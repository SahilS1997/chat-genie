import type {
  AgentChatResponse,
  PortalAgent,
  PortalReport,
  PowerBiEmbedConfig,
} from '../../rayfin/functions/schema';

import {
  connectFabric as acquireFabricConnection,
  getFabricAccessToken,
} from './fabricEntraAuth';

export function connectFabric() {
  return acquireFabricConnection();
}

const defaultBaseUrl =
  'https://238b7fdfe09a4d0290128afed2aee1b2.z23.userdatafunctions.fabric.microsoft.com';
const workspaceId = '238b7fdf-e09a-4d02-9012-8afed2aee1b2';
const functionItemId =
  import.meta.env.VITE_FABRIC_USER_DATA_FUNCTION_ID ||
  '9db794e4-8fea-4ffc-bf47-02a2c3ae4aba';

const baseUrl = (
  import.meta.env.VITE_FABRIC_USER_DATA_FUNCTION_URL || defaultBaseUrl
).replace(/\/$/, '');

interface FunctionResponse<T> {
  output?: T;
  errors?: Array<{ message?: string }>;
}

async function invoke<T>(
  functionName: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const accessToken = await getFabricAccessToken();
  const response = await fetch(
    `${baseUrl}/v1/workspaces/${workspaceId}/userDataFunctions/${functionItemId}/functions/${functionName}/invoke`,
    {
      method: 'POST',
      credentials:
        import.meta.env.MODE === 'github-pages' ? 'omit' : 'include',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  const payload = (await response.json()) as FunctionResponse<T> & {
    error?: string;
  };
  if (!response.ok) {
    const functionError =
      payload.errors?.map((error) => error.message).filter(Boolean).join('; ') ||
      payload.error;
    throw new Error(
      functionError || `Fabric function returned HTTP ${response.status}.`
    );
  }
  if (!payload.output) {
    throw new Error(`Fabric function "${functionName}" returned no output.`);
  }
  return payload.output;
}

export function listReports() {
  return invoke<PortalReport[]>('list_reports');
}

export function listAgents() {
  return invoke<PortalAgent[]>('list_agents');
}

export function getEmbedConfig(reportId: string, workspaceId: string) {
  return invoke<PowerBiEmbedConfig>('get_embed_config', {
    reportId,
    workspaceId,
  });
}

export function askAgent(
  agentId: string,
  question: string,
  reportId?: string,
  conversationId?: string
) {
  return invoke<AgentChatResponse>('ask_agent', {
    agentId,
    question,
    reportId: reportId ?? '',
    conversationId: conversationId ?? '',
  });
}
