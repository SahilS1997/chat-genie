import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const execFileAsync = promisify(execFile);
const port = Number(process.env.CHAT_GENIE_API_PORT ?? 8787);
const workspaceId = await readRayfinSetting('RAYFIN_PUBLIC_WORKSPACE_ID');
const powerBiBaseUrl = 'https://api.powerbi.com/v1.0/myorg';
const fabricBaseUrl = 'https://api.fabric.microsoft.com/v1';

async function readRayfinSetting(name) {
  const content = await readFile(new URL('../rayfin/.env', import.meta.url), 'utf8');
  const line = content.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? '';
}

async function getAccessToken(resource) {
  const args = [
    'account',
    'get-access-token',
    '--resource',
    resource,
    '--query',
    'accessToken',
    '--output',
    'tsv',
  ];
  const command = process.platform === 'win32' ? 'az.cmd' : 'az';
  const { stdout } =
    process.platform === 'win32'
      ? await execFileAsync('cmd.exe', ['/d', '/s', '/c', command, ...args])
      : await execFileAsync(command, args);
  const token = stdout.trim();
  if (!token) throw new Error(`Azure CLI returned no token for ${resource}.`);
  return token;
}

async function tenantRequest(url, resource, init = {}) {
  const token = await getAccessToken(resource);
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function listReports() {
  const groups = await tenantRequest(`${powerBiBaseUrl}/groups?$top=500`, 'https://analysis.windows.net/powerbi/api');
  const reports = await Promise.all((groups.value ?? []).map(async (group) => {
    const result = await tenantRequest(
      `${powerBiBaseUrl}/groups/${encodeURIComponent(group.id)}/reports`,
      'https://analysis.windows.net/powerbi/api'
    );
    return (result.value ?? []).map((report) => ({
      id: report.id,
      name: report.name,
      workspaceId: group.id,
      workspaceName: group.name,
      webUrl: report.webUrl,
      embedUrl: report.embedUrl,
      datasetId: report.datasetId,
      modifiedDateTime: report.modifiedDateTime,
    }));
  }));
  return reports.flat();
}

async function listAgents() {
  if (!workspaceId) throw new Error('RAYFIN_PUBLIC_WORKSPACE_ID is missing from rayfin/.env.');
  const result = await tenantRequest(
    `${fabricBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/dataAgents`,
    'https://api.fabric.microsoft.com'
  );
  return (result.value ?? []).map((agent) => ({
    id: agent.id,
    name: agent.displayName ?? agent.name,
    description: agent.description,
    source: 'Fabric Data Agent',
  }));
}

async function getEmbedConfig(reportId, workspaceId) {
  if (!reportId) throw new Error('reportId is required.');
  if (!workspaceId) throw new Error('workspaceId is required.');
  const report = await tenantRequest(
    `${powerBiBaseUrl}/groups/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(reportId)}`,
    'https://analysis.windows.net/powerbi/api'
  );
  if (!report.embedUrl) {
    throw new Error(`Power BI report ${reportId} did not include an embedUrl.`);
  }
  const token = await tenantRequest(
    `${powerBiBaseUrl}/groups/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(reportId)}/GenerateToken`,
    'https://analysis.windows.net/powerbi/api',
    { method: 'POST', body: JSON.stringify({ accessLevel: 'View' }) }
  );
  if (!token.token) {
    throw new Error(`Power BI did not return an embed token for report ${reportId}.`);
  }
  return {
    reportId,
    embedUrl: report.embedUrl,
    accessToken: token.token,
    expiration: token.expiration,
    tokenType: 'Embed',
  };
}

async function askAgent(agentId, question, reportId, conversationId) {
  const token = await getAccessToken('https://api.fabric.microsoft.com');
  const endpoint =
    `https://api.fabric.microsoft.com/v1/mcp/workspaces/${encodeURIComponent(workspaceId)}` +
    `/dataagents/${encodeURIComponent(agentId)}/agent`;
  const client = new Client({ name: 'chat-genie-local-bridge', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const tool = tools.tools[0];
    if (!tool) throw new Error('The published Data Agent MCP server exposed no tools.');
    const properties = tool.inputSchema?.properties ?? {};
    const args = Object.prototype.hasOwnProperty.call(properties, 'userQuestion')
      ? { userQuestion: question }
      : Object.prototype.hasOwnProperty.call(properties, 'question')
        ? { question }
        : { input: question };
    const result = await client.callTool({ name: tool.name, arguments: args });
    const text = result.content
      ?.filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n')
      .trim();
    if (!text) throw new Error('The Data Agent MCP server returned no answer text.');
    return { answer: text, conversationId };
  } finally {
    await client.close();
  }
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function requestHandler(request, response) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Access-Control-Allow-Origin', 'http://localhost:5175');
  try {
    if (request.method === 'GET' && url.pathname === '/api/bi/reports') {
      return writeJson(response, 200, await listReports());
    }
    if (request.method === 'GET' && url.pathname === '/api/bi/agents') {
      return writeJson(response, 200, await listAgents());
    }
    if (request.method === 'POST' && url.pathname === '/api/bi/embed') {
      const body = await readBody(request);
      return writeJson(response, 200, await getEmbedConfig(body.reportId, body.workspaceId));
    }
    if (request.method === 'POST' && url.pathname === '/api/bi/agent/chat') {
      const body = await readBody(request);
      return writeJson(
        response,
        200,
        await askAgent(body.agentId, body.question, body.reportId, body.conversationId)
      );
    }
    return writeJson(response, 404, { error: 'Local tenant bridge route not found.' });
  } catch (error) {
    return writeJson(response, 502, {
      error: error instanceof Error ? error.message : 'Local tenant bridge request failed.',
    });
  }
}

function writeJson(response, status, body) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

createServer(requestHandler).listen(port, '127.0.0.1', () => {
  console.log(`[chat-genie] Local tenant bridge listening on http://127.0.0.1:${port}`);
});
