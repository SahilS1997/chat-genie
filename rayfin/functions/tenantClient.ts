import {
  AudienceType,
  RayfinContext,
} from '@microsoft/fabric-user-data-functions';

import type {
  AgentChatResponse,
  PortalAgent,
  PortalReport,
  PowerBiEmbedConfig,
} from './schema.js';

type JsonObject = Record<string, unknown>;

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Tenant integration is not configured: set ${name} for the Rayfin Functions runtime.`
    );
  }
  return value.replace(/\/$/, '');
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringProperty(
  value: JsonObject,
  property: string,
  context: string
): string {
  const result = value[property];
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error(`Tenant integration returned an invalid ${context}.${property}.`);
  }
  return result;
}

function optionalString(
  value: JsonObject,
  property: string
): string | undefined {
  return typeof value[property] === 'string' ? value[property] : undefined;
}

function objectArray(value: unknown, context: string): JsonObject[] {
  const items =
    Array.isArray(value)
      ? value
      : isObject(value) && Array.isArray(value.value)
        ? value.value
        : null;
  if (!items || !items.every(isObject)) {
    throw new Error(`Tenant integration returned an invalid ${context} collection.`);
  }
  return items;
}

export class TenantIntegrationClient {
  private readonly powerBiBaseUrl: string;
  private readonly agentBaseUrl: string;
  private readonly accessToken: string;

  constructor(context: RayfinContext) {
    this.powerBiBaseUrl = requiredSetting('POWERBI_API_BASE_URL');
    this.agentBaseUrl = requiredSetting('FABRIC_DATA_AGENT_API_BASE_URL');
    this.accessToken = context.getToken(AudienceType.Fabric);
  }

  async listReports(): Promise<PortalReport[]> {
    const payload = await this.request(this.powerBiBaseUrl, '/reports');
    return objectArray(payload, 'Power BI reports').map((report) => ({
      id: stringProperty(report, 'id', 'report'),
      name: stringProperty(report, 'name', 'report'),
      workspaceId: optionalString(report, 'workspaceId') ?? '',
      workspaceName: optionalString(report, 'workspaceName') ?? '',
      webUrl: optionalString(report, 'webUrl'),
      embedUrl: optionalString(report, 'embedUrl'),
      datasetId: optionalString(report, 'datasetId'),
      modifiedDateTime: optionalString(report, 'modifiedDateTime'),
    }));
  }

  async listAgents(): Promise<PortalAgent[]> {
    const payload = await this.request(this.agentBaseUrl, '/agents');
    return objectArray(payload, 'Fabric Data Agents').map((agent) => ({
      id: stringProperty(agent, 'id', 'agent'),
      name: stringProperty(agent, 'name', 'agent'),
      description: optionalString(agent, 'description'),
      source: optionalString(agent, 'source'),
    }));
  }

  async getEmbedConfig(reportId: string, workspaceId: string): Promise<PowerBiEmbedConfig> {
    if (!reportId.trim()) {
      throw new Error('reportId is required to generate an embed configuration.');
    }
    if (!workspaceId.trim()) {
      throw new Error('workspaceId is required to generate an embed configuration.');
    }

    const reportPayload = await this.request(
      this.powerBiBaseUrl,
      `/groups/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(reportId)}`
    );
    if (!isObject(reportPayload)) {
      throw new Error('Power BI returned an invalid report before token generation.');
    }

    const embedUrl = optionalString(reportPayload, 'embedUrl');
    if (!embedUrl) {
      throw new Error(`Power BI report ${reportId} did not include an embedUrl.`);
    }

    const tokenPayload = await this.request(
      this.powerBiBaseUrl,
      `/groups/${encodeURIComponent(workspaceId)}/reports/${encodeURIComponent(reportId)}/GenerateToken`,
      {
        method: 'POST',
        body: JSON.stringify({ accessLevel: 'view' }),
      }
    );
    if (!isObject(tokenPayload)) {
      throw new Error('Power BI returned an invalid embed-token response.');
    }

    return {
      reportId,
      embedUrl,
      accessToken: stringProperty(tokenPayload, 'token', 'embed token'),
      expiration: optionalString(tokenPayload, 'expiration'),
    };
  }

  async askAgent(
    agentId: string,
    question: string,
    reportId?: string,
    conversationId?: string
  ): Promise<AgentChatResponse> {
    if (!agentId.trim()) throw new Error('agentId is required to ask a Data Agent.');
    if (!question.trim()) throw new Error('question is required to ask a Data Agent.');

    const payload = await this.request(
      this.agentBaseUrl,
      `/agents/${encodeURIComponent(agentId)}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ question, reportId, conversationId }),
      }
    );
    if (!isObject(payload)) {
      throw new Error('Fabric Data Agent returned an invalid chat response.');
    }

    const citations = Array.isArray(payload.citations)
      ? payload.citations.filter(isObject).map((citation) => ({
          title: stringProperty(citation, 'title', 'citation'),
          url: optionalString(citation, 'url'),
        }))
      : undefined;

    return {
      answer: stringProperty(payload, 'answer', 'chat response'),
      citations,
      conversationId: optionalString(payload, 'conversationId'),
    };
  }

  private async request(
    baseUrl: string,
    path: string,
    init: RequestInit = {}
  ): Promise<unknown> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${this.accessToken}`);

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `Tenant integration request failed (${response.status}) for ${path}: ${
          detail || response.statusText
        }`
      );
    }

    return response.json();
  }
}
