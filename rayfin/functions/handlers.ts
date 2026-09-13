import type { RayfinContext } from '@microsoft/fabric-user-data-functions';

import type {
  AgentChatResponse,
  PortalAgent,
  PortalReport,
  PowerBiEmbedConfig,
} from './schema.js';
import { TenantIntegrationClient } from './tenantClient.js';

export async function listReports(
  context: RayfinContext
): Promise<PortalReport[]> {
  return new TenantIntegrationClient(context).listReports();
}

export async function listAgents(
  context: RayfinContext
): Promise<PortalAgent[]> {
  return new TenantIntegrationClient(context).listAgents();
}

export async function getEmbedConfig(
  context: RayfinContext,
  reportId: string,
  workspaceId: string
): Promise<PowerBiEmbedConfig> {
  return new TenantIntegrationClient(context).getEmbedConfig(reportId, workspaceId);
}

export async function askAgent(
  context: RayfinContext,
  agentId: string,
  question: string,
  reportId?: string,
  conversationId?: string
): Promise<AgentChatResponse> {
  return new TenantIntegrationClient(context).askAgent(
    agentId,
    question,
    reportId,
    conversationId
  );
}
