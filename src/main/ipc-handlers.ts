import { ipcMain } from "electron";
import type { AgentConfig, McpSharedContext } from "../shared/types.js";
import type { PtyManager } from "./pty-manager.js";
import { clearSessions } from "../shared/session-store.js";
import { registerMcpForAgent, unregisterMcpForAgent } from "./agent-lifecycle.js";

interface IpcDeps {
  agents: AgentConfig[];
  ptyManager: PtyManager;
  sharedContext: McpSharedContext;
  mcpPort: number;
  mcpUrl: string;
  getMcpSessionCount: () => number;
}

export function registerIpcHandlers(deps: IpcDeps) {
  const { agents, ptyManager, sharedContext, mcpPort, mcpUrl, getMcpSessionCount } = deps;

  ipcMain.handle("agents:list", () => {
    return agents.map((a) => ({
      ...a,
      busyState: ptyManager.getBusyState(a.name),
      pendingRequestId: ptyManager.getPendingRequestId(a.name),
    }));
  });

  ipcMain.on("pty:write", (_event, { agentName, data }: { agentName: string; data: string }) => {
    ptyManager.write(agentName, data);
  });

  ipcMain.on(
    "pty:resize",
    (_event, { agentName, cols, rows }: { agentName: string; cols: number; rows: number }) => {
      ptyManager.resize(agentName, cols, rows);
    },
  );

  ipcMain.handle("pty:restart", (_event, agentName: string) => {
    ptyManager.spawnAgent(agents.find((a) => a.name === agentName)!, agents, mcpUrl);
  });

  ipcMain.handle("mcp:status", () => {
    const pendingRequests: Array<{ caller: string; target: string }> = [];
    for (const [, req] of sharedContext.pendingRequests) {
      pendingRequests.push({ caller: req.callerAgent, target: req.targetAgent });
    }
    return {
      port: mcpPort,
      sessionCount: getMcpSessionCount(),
      pendingRequests,
    };
  });

  ipcMain.handle("app:reload-all", async () => {
    // Kill all PTYs
    ptyManager.killAll();

    // Unregister MCP
    for (const agent of agents) {
      unregisterMcpForAgent(agent.directory);
    }

    // Clear sessions
    clearSessions();

    // Wait for PTYs to close
    await new Promise((r) => setTimeout(r, 500));

    // Re-register MCP
    for (const agent of agents) {
      registerMcpForAgent(agent.directory, mcpUrl);
    }

    // Respawn all
    for (const agent of agents) {
      ptyManager.spawnAgent(agent, agents, mcpUrl);
    }
  });
}
