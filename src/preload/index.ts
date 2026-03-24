import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Agent management
  listAgents: () => ipcRenderer.invoke("agents:list"),
  onAgentStateUpdate: (
    cb: (data: { name: string; busyState: string; pendingRequestId: string | null }) => void,
  ) => {
    const handler = (
      _: unknown,
      d: { name: string; busyState: string; pendingRequestId: string | null },
    ) => cb(d);
    ipcRenderer.on("agents:state-update", handler);
    return () => ipcRenderer.removeListener("agents:state-update", handler);
  },

  // PTY I/O
  onPtyData: (cb: (agentName: string, data: string) => void) => {
    const handler = (_: unknown, d: { agentName: string; data: string }) => cb(d.agentName, d.data);
    ipcRenderer.on("pty:data", handler);
    return () => ipcRenderer.removeListener("pty:data", handler);
  },
  writePty: (agentName: string, data: string) => {
    ipcRenderer.send("pty:write", { agentName, data });
  },
  resizePty: (agentName: string, cols: number, rows: number) => {
    ipcRenderer.send("pty:resize", { agentName, cols, rows });
  },
  restartAgent: (agentName: string) => ipcRenderer.invoke("pty:restart", agentName),
  onPtyExit: (cb: (agentName: string) => void) => {
    const handler = (_: unknown, d: { agentName: string }) => cb(d.agentName);
    ipcRenderer.on("pty:exit", handler);
    return () => ipcRenderer.removeListener("pty:exit", handler);
  },

  // MCP status
  getMcpStatus: () => ipcRenderer.invoke("mcp:status"),
  onMcpStatusUpdate: (
    cb: (data: {
      port: number;
      sessionCount: number;
      pendingRequests: Array<{ caller: string; target: string }>;
    }) => void,
  ) => {
    const handler = (
      _: unknown,
      d: {
        port: number;
        sessionCount: number;
        pendingRequests: Array<{ caller: string; target: string }>;
      },
    ) => cb(d);
    ipcRenderer.on("mcp:status-update", handler);
    return () => ipcRenderer.removeListener("mcp:status-update", handler);
  },

  // App actions
  reloadAll: () => ipcRenderer.invoke("app:reload-all"),
  saveAgents: (agents: Array<{ name: string; directory: string; description: string }>) =>
    ipcRenderer.invoke("agents:save", agents),
  browseDirectory: () => ipcRenderer.invoke("dialog:open-directory"),

  // Menu events
  onMenuSwitchAgent: (cb: (name: string) => void) => {
    const handler = (_: unknown, name: string) => cb(name);
    ipcRenderer.on("menu:switch-agent", handler);
    return () => ipcRenderer.removeListener("menu:switch-agent", handler);
  },
  onMenuToggleSidebar: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:toggle-sidebar", handler);
    return () => ipcRenderer.removeListener("menu:toggle-sidebar", handler);
  },
  onMenuSplitAll: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:split-all", handler);
    return () => ipcRenderer.removeListener("menu:split-all", handler);
  },
  onMenuFocusActive: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:focus-active", handler);
    return () => ipcRenderer.removeListener("menu:focus-active", handler);
  },
  onMenuReloadAll: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:reload-all", handler);
    return () => ipcRenderer.removeListener("menu:reload-all", handler);
  },
  onMenuRefreshTerminals: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:refresh-terminals", handler);
    return () => ipcRenderer.removeListener("menu:refresh-terminals", handler);
  },
  triggerRefreshTerminals: () => {
    ipcRenderer.emit("menu:refresh-terminals");
  },
  onMenuShowShortcuts: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:show-shortcuts", handler);
    return () => ipcRenderer.removeListener("menu:show-shortcuts", handler);
  },
  onMenuManageAgents: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on("menu:manage-agents", handler);
    return () => ipcRenderer.removeListener("menu:manage-agents", handler);
  },

  // File utilities
  getFilePath: (file: File) => webUtils.getPathForFile(file),
});
