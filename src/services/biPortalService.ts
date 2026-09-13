import type {
  AgentChatResponse,
  PortalAgent,
  PortalReport,
  PowerBiEmbedConfig,
} from '../../rayfin/functions/schema';

import {
  askAgent as invokeFabricAgent,
  connectFabric,
  listAgents as invokeFabricAgents,
  listReports as invokeFabricReports,
} from './fabricUserDataFunction';
import { getPowerBiAccessToken } from './fabricEntraAuth';

export { connectFabric };
export type {
  AgentChatResponse,
  PortalAgent,
  PortalReport,
  PowerBiEmbedConfig,
};

async function localRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'error' in payload
        ? payload.error || `Local tenant bridge returned ${response.status}.`
        : `Local tenant bridge returned ${response.status}.`
    );
  }
  return payload as T;
}

export function listReports() {
  return import.meta.env.DEV
    ? localRequest<import('../../rayfin/functions/schema').PortalReport[]>(
        '/api/bi/reports'
      )
    : invokeFabricReports();
}

export function listAgents() {
  return import.meta.env.DEV
    ? localRequest<import('../../rayfin/functions/schema').PortalAgent[]>(
        '/api/bi/agents'
      )
    : invokeFabricAgents();
}

export async function getEmbedConfig(
  report: PortalReport
): Promise<PowerBiEmbedConfig> {
  if (import.meta.env.DEV) {
    return localRequest<PowerBiEmbedConfig>(
        '/api/bi/embed',
        {
          method: 'POST',
          body: JSON.stringify({
            reportId: report.id,
            workspaceId: report.workspaceId,
          }),
        }
      );
  }

  if (!report.embedUrl) {
    throw new Error(`Power BI report ${report.id} did not include an embedUrl.`);
  }

  return {
    reportId: report.id,
    embedUrl: report.embedUrl,
    accessToken: await getPowerBiAccessToken(),
    tokenType: 'Aad',
  };
}

export function askAgent(
  agentId: string,
  question: string,
  reportId?: string,
  conversationId?: string
) {
  return import.meta.env.DEV
    ? localRequest<import('../../rayfin/functions/schema').AgentChatResponse>(
        '/api/bi/agent/chat',
        {
          method: 'POST',
          body: JSON.stringify({ agentId, question, reportId, conversationId }),
        }
      )
    : invokeFabricAgent(agentId, question, reportId, conversationId);
}
