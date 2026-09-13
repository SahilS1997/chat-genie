/**
 * Function schema consumed by the frontend RayfinClient.
 *
 * Keep this file free of Node.js imports so it can be used by the browser
 * TypeScript compiler.
 */
export type AppFunctionsSchema = {
  listReports: {
    input: Record<string, never>;
    output: import('../schema.js').PortalReport[];
  };
  listAgents: {
    input: Record<string, never>;
    output: import('../schema.js').PortalAgent[];
  };
  getEmbedConfig: {
    input: { reportId: string };
    output: import('../schema.js').PowerBiEmbedConfig;
  };
  askAgent: {
    input: {
      agentId: string;
      question: string;
      reportId?: string;
      conversationId?: string;
    };
    output: import('../schema.js').AgentChatResponse;
  };
};
