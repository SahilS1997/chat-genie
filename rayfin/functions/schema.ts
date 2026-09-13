export type PortalReport = {
  id: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  webUrl?: string;
  embedUrl?: string;
  datasetId?: string;
  modifiedDateTime?: string;
};

export type PortalAgent = {
  id: string;
  name: string;
  description?: string;
  source?: string;
};

export type PowerBiEmbedConfig = {
  reportId: string;
  embedUrl: string;
  accessToken: string;
  tokenType?: 'Embed' | 'Aad';
  expiration?: string;
};

export type AgentChatResponse = {
  answer: string;
  citations?: Array<{ title: string; url?: string }>;
  conversationId?: string;
};

export type ChatGenieFunctions = {
  listReports: {
    input: Record<string, never>;
    output: PortalReport[];
  };
  listAgents: {
    input: Record<string, never>;
    output: PortalAgent[];
  };
  getEmbedConfig: {
    input: { reportId: string; workspaceId: string };
    output: PowerBiEmbedConfig;
  };
  askAgent: {
    input: {
      agentId: string;
      question: string;
      reportId?: string;
      conversationId?: string;
    };
    output: AgentChatResponse;
  };
};
