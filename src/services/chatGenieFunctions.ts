import { getRayfinClient } from './rayfinClient';

export function listReports() {
  return getRayfinClient().functions.listReports.invoke();
}

export function listAgents() {
  return getRayfinClient().functions.listAgents.invoke();
}

export function getEmbedConfig(reportId: string, workspaceId: string) {
  return getRayfinClient().functions.getEmbedConfig.invoke({ reportId, workspaceId });
}

export function askAgent(
  agentId: string,
  question: string,
  reportId?: string,
  conversationId?: string
) {
  return getRayfinClient().functions.askAgent.invoke({
    agentId,
    question,
    reportId,
    conversationId,
  });
}
