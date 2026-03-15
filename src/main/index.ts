import { app, BrowserWindow, dialog, screen } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  loadRegistry,
  ensureMeshDir,
  agentsFileExists,
  copyExampleConfig,
} from "../shared/agent-registry.js";
import { clearSessions } from "../shared/session-store.js";
import { startMcpHttpServer } from "../shared/mcp-http-server.js";
import { PtyManager } from "./pty-manager.js";
import { createMcpContext } from "./mcp-bridge.js";
import { registerMcpForAgent, unregisterMcpForAgent } from "./agent-lifecycle.js";
import { registerIpcHandlers } from "./ipc-handlers.js";
import { buildAppMenu } from "./menu.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const windowStatePath = path.join(os.homedir(), ".agent-mesh", "window-state.json");

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadWindowState(): WindowState | null {
  try {
    const data = JSON.parse(fs.readFileSync(windowStatePath, "utf-8")) as WindowState;
    // Verify the saved position is on a visible display
    const displays = screen.getAllDisplays();
    const visible = displays.some((d) => {
      const { x, y, width, height } = d.bounds;
      return data.x >= x && data.x < x + width && data.y >= y && data.y < y + height;
    });
    return visible ? data : null;
  } catch {
    return null;
  }
}

function saveWindowState(win: BrowserWindow) {
  if (win.isMinimized() || win.isMaximized()) return;
  const bounds = win.getBounds();
  fs.writeFileSync(windowStatePath, JSON.stringify(bounds), "utf-8");
}

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;
let mcpStop: (() => Promise<void>) | null = null;

async function createWindow() {
  // 1. Ensure mesh directory and agents config
  ensureMeshDir();

  if (!agentsFileExists()) {
    const result = dialog.showMessageBoxSync({
      type: "question",
      buttons: ["Copy Example Config", "Cancel"],
      title: "Agent Mesh Setup",
      message: "No agents.json found in ~/.agent-mesh/",
      detail: "Would you like to copy the example config? You can edit it afterwards.",
    });
    if (result === 0) {
      copyExampleConfig();
      dialog.showMessageBoxSync({
        type: "info",
        title: "Config Created",
        message: "Created ~/.agent-mesh/agents.json",
        detail: "Edit it to configure your agents, then restart Agent Mesh.",
      });
    }
    app.quit();
    return;
  }

  // 2. Load registry and validate
  const registry = loadRegistry();
  if (registry.agents.length === 0) {
    dialog.showMessageBoxSync({
      type: "error",
      title: "No Agents",
      message: "No agents configured in ~/.agent-mesh/agents.json",
    });
    app.quit();
    return;
  }

  for (const agent of registry.agents) {
    if (!fs.existsSync(agent.directory)) {
      dialog.showMessageBoxSync({
        type: "error",
        title: "Invalid Agent Directory",
        message: `Directory for agent "${agent.name}" does not exist: ${agent.directory}`,
      });
      app.quit();
      return;
    }
  }

  const agents = registry.agents;

  // 3. Create PTY manager
  ptyManager = new PtyManager();

  // 4. Create MCP context and start HTTP server
  const sharedContext = createMcpContext(agents, ptyManager);
  ptyManager.setSharedContext(sharedContext);

  const mcpServer = await startMcpHttpServer(sharedContext);
  mcpStop = mcpServer.stop;
  const mcpUrl = `http://localhost:${mcpServer.port}/mcp`;

  // 5. Register MCP for each agent
  for (const agent of agents) {
    registerMcpForAgent(agent.directory, mcpUrl);
  }

  // 6. Create browser window — maximize on saved or primary display
  const savedState = loadWindowState();
  const displays = screen.getAllDisplays();
  const primaryDisplay = savedState
    ? displays.find((d) => {
        const { x, y, width, height } = d.bounds;
        return savedState.x >= x && savedState.x < x + width && savedState.y >= y && savedState.y < y + height;
      }) ?? screen.getPrimaryDisplay()
    : screen.getPrimaryDisplay();

  const { x: px, y: py, width: pw, height: ph } = primaryDisplay.workArea;

  mainWindow = new BrowserWindow({
    x: px,
    y: py,
    width: pw,
    height: ph,
    minWidth: 800,
    minHeight: 500,
    show: false,
    title: "Agent Mesh",
    backgroundColor: "#1e1e1e",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "..", "preload", "index.js"),
    },
  });

  // Show maximized once content is ready — avoids resize race with terminals
  mainWindow.once("ready-to-show", () => {
    mainWindow!.maximize();
    mainWindow!.show();
  });

  // Persist window position on move/resize
  mainWindow.on("moved", () => saveWindowState(mainWindow!));
  mainWindow.on("resized", () => saveWindowState(mainWindow!));

  ptyManager.setWindow(mainWindow);

  // 7. Load renderer
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");

    // Open DevTools in a dedicated window on a different monitor
    const otherDisplay = displays.find((d) => d.id !== primaryDisplay.id);
    if (otherDisplay) {
      const { x, y, width, height } = otherDisplay.workArea;
      const devToolsWin = new BrowserWindow({
        x,
        y,
        width: Math.min(900, width),
        height,
      });
      mainWindow.webContents.setDevToolsWebContents(devToolsWin.webContents);
      mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  // 8. Build menu
  buildAppMenu(agents, mainWindow);

  // 9. Register IPC handlers
  registerIpcHandlers({
    agents,
    ptyManager,
    sharedContext,
    mcpPort: mcpServer.port,
    mcpUrl,
    getMcpSessionCount: mcpServer.getSessionCount,
  });

  // 10. Push MCP status updates to renderer periodically
  const mcpStatusInterval = setInterval(() => {
    if (mainWindow?.isDestroyed()) return;
    const pendingRequests: Array<{ caller: string; target: string }> = [];
    for (const [, req] of sharedContext.pendingRequests) {
      pendingRequests.push({ caller: req.callerAgent, target: req.targetAgent });
    }
    mainWindow?.webContents.send("mcp:status-update", {
      port: mcpServer.port,
      sessionCount: mcpServer.getSessionCount(),
      pendingRequests,
    });
  }, 200);

  // 11. Spawn PTYs for all agents
  for (const agent of agents) {
    ptyManager.spawnAgent(agent, agents, mcpUrl);
  }

  // Cleanup on window close
  mainWindow.on("closed", () => {
    clearInterval(mcpStatusInterval);
    mainWindow = null;
  });
}

async function cleanup() {
  if (ptyManager) {
    ptyManager.killAll();
  }

  if (mcpStop) {
    await mcpStop().catch(() => {});
  }

  // Unregister MCP from all agent dirs
  try {
    const registry = loadRegistry();
    for (const agent of registry.agents) {
      unregisterMcpForAgent(agent.directory);
    }
  } catch {
    // ignore if registry can't be loaded
  }

  clearSessions();
}

app.whenReady().then(createWindow);

app.on("before-quit", async (e) => {
  e.preventDefault();
  await cleanup();
  app.exit(0);
});

app.on("window-all-closed", () => {
  app.quit();
});
