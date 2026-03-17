import { ipcMain, dialog, type BrowserWindow } from "electron";
import fs from "node:fs";
import type { AgentConfig, McpSharedContext } from "../shared/types.js";
import type { PtyManager } from "./pty-manager.js";
import { clearSessions } from "../shared/session-store.js";
import { loadRegistry, saveRegistry } from "../shared/agent-registry.js";
import { registerMcpForAgent, unregisterMcpForAgent } from "./agent-lifecycle.js";
import { buildAppMenu } from "./menu.js";

interface IpcDeps {
  agents: AgentConfig[];
  ptyManager: PtyManager;
  sharedContext: McpSharedContext;
  mcpPort: number;
  mcpUrl: string;
  getMcpSessionCount: () => number;
  mainWindow: BrowserWindow;
}

async function performFullReload(deps: IpcDeps) {
  const { agents, ptyManager, mcpUrl, mainWindow } = deps;

  // Kill all PTYs
  ptyManager.killAll();

  // Unregister MCP from old agent directories
  for (const agent of agents) {
    unregisterMcpForAgent(agent.directory);
  }

  // Clear sessions
  clearSessions();

  // Wait for PTYs to close
  await new Promise((r) => setTimeout(r, 500));

  // Re-read registry from disk
  const registry = loadRegistry();
  const newAgents = registry.agents;

  // Update the agents array in-place
  agents.length = 0;
  agents.push(...newAgents);

  // Re-register MCP for all agents
  for (const agent of agents) {
    registerMcpForAgent(agent.directory, mcpUrl);
  }

  // Respawn all PTYs
  for (const agent of agents) {
    ptyManager.spawnAgent(agent, agents, mcpUrl);
  }

  // Rebuild menu
  buildAppMenu(agents, mainWindow);
}

export function registerIpcHandlers(deps: IpcDeps) {
  const { agents, ptyManager, sharedContext, mcpPort, mcpUrl, getMcpSessionCount, mainWindow } = deps;

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
    await performFullReload(deps);
  });

  ipcMain.handle("agents:save", async (_event, newAgents: AgentConfig[]) => {
    // Validate
    for (const agent of newAgents) {
      if (!agent.name || !agent.name.trim()) {
        throw new Error("Each agent must have a name");
      }
      if (!agent.directory || !agent.directory.trim()) {
        throw new Error(`Agent "${agent.name}" must have a directory`);
      }
      if (!fs.existsSync(agent.directory)) {
        throw new Error(`Directory for agent "${agent.name}" does not exist: ${agent.directory}`);
      }
    }

    // Check for duplicate names
    const names = new Set<string>();
    for (const agent of newAgents) {
      if (names.has(agent.name)) {
        throw new Error(`Duplicate agent name: "${agent.name}"`);
      }
      names.add(agent.name);
    }

    // Save to disk
    saveRegistry(newAgents);

    // Perform full reload
    await performFullReload(deps);

    return { success: true };
  });

  ipcMain.handle("dialog:open-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
}
