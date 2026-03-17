export interface McpStatus {
  port: number;
  sessionCount: number;
  pendingRequests: Array<{ caller: string; target: string }>;
}

export interface AgentInfo {
  name: string;
  directory: string;
  description: string;
  busyState: "idle" | "working" | "asking" | "answering";
  pendingRequestId: string | null;
}

export interface ElectronAPI {
  listAgents: () => Promise<AgentInfo[]>;
  onAgentStateUpdate: (
    cb: (data: { name: string; busyState: string; pendingRequestId: string | null }) => void,
  ) => () => void;
  onPtyData: (cb: (agentName: string, data: string) => void) => () => void;
  writePty: (agentName: string, data: string) => void;
  resizePty: (agentName: string, cols: number, rows: number) => void;
  restartAgent: (agentName: string) => Promise<void>;
  onPtyExit: (cb: (agentName: string) => void) => () => void;
  getMcpStatus: () => Promise<McpStatus>;
  onMcpStatusUpdate: (cb: (data: McpStatus) => void) => () => void;
  reloadAll: () => Promise<void>;
  saveAgents: (agents: Array<{ name: string; directory: string; description: string }>) => Promise<{ success: true }>;
  browseDirectory: () => Promise<string | null>;
  onMenuSwitchAgent: (cb: (name: string) => void) => () => void;
  onMenuToggleSidebar: (cb: () => void) => () => void;
  onMenuSplitAll: (cb: () => void) => () => void;
  onMenuFocusActive: (cb: () => void) => () => void;
  onMenuReloadAll: (cb: () => void) => () => void;
  onMenuRefreshTerminals: (cb: () => void) => () => void;
  triggerRefreshTerminals: () => void;
  onMenuShowShortcuts: (cb: () => void) => () => void;
  onMenuManageAgents: (cb: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
