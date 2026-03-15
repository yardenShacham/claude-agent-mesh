export interface AgentConfig {
  name: string;
  directory: string;
  description: string;
}

export interface AgentRegistry {
  agents: AgentConfig[];
}

export interface SessionEntry {
  interactive: boolean;
}

export type SessionStore = Record<string, SessionEntry>;

export type AgentBusyState = "idle" | "working" | "asking" | "answering";

export interface PendingRequest {
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
  callerAgent: string;
  targetAgent: string;
}

export interface AgentTerminalRef {
  config: AgentConfig;
  injectInput: (data: string) => void;
  busyState: AgentBusyState;
  pendingRequestId: string | null;
}

export interface McpSharedContext {
  getAgents: () => AgentConfig[];
  getTerminalRef: (agentName: string) => AgentTerminalRef | undefined;
  pendingRequests: Map<string, PendingRequest>;
}
