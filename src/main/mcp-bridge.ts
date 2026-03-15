import type { AgentConfig, McpSharedContext } from "../shared/types.js";
import type { PtyManager } from "./pty-manager.js";

export function createMcpContext(agents: AgentConfig[], ptyManager: PtyManager): McpSharedContext {
  return {
    getAgents: () => agents,
    getTerminalRef: (name) => ptyManager.getTerminalRef(name),
    pendingRequests: new Map(),
  };
}
