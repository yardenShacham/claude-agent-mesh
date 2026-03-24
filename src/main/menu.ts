import { Menu, shell, app, type BrowserWindow } from "electron";
import type { AgentConfig } from "../shared/types.js";
import path from "node:path";

export function buildAppMenu(agents: AgentConfig[], window: BrowserWindow) {
  const agentsMenuItems = agents.map((agent, i) => ({
    label: agent.name,
    accelerator: i < 9 ? `CmdOrCtrl+${i + 1}` : undefined,
    click: () => {
      window.webContents.send("menu:switch-agent", agent.name);
    },
  }));

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        {
          label: "Open agents.json",
          click: () => {
            const agentsFile = path.join(process.env.HOME!, ".agent-mesh", "agents.json");
            shell.openPath(agentsFile);
          },
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Toggle Sidebar",
          accelerator: "CmdOrCtrl+B",
          click: () => {
            window.webContents.send("menu:toggle-sidebar");
          },
        },
        {
          label: "Split View\u2026",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            window.webContents.send("menu:split-all");
          },
        },
        {
          label: "Focus Active",
          accelerator: "Escape",
          click: () => {
            window.webContents.send("menu:focus-active");
          },
        },
        { type: "separator" },
        {
          label: "Refresh Terminals",
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => {
            window.webContents.send("menu:refresh-terminals");
          },
        },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Agents",
      submenu: [
        {
          label: "Manage Agents\u2026",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => {
            window.webContents.send("menu:manage-agents");
          },
        },
        {
          label: "Reload All",
          accelerator: "CmdOrCtrl+Shift+R",
          click: () => {
            window.webContents.send("menu:reload-all");
          },
        },
        { type: "separator" },
        ...agentsMenuItems,
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About Agent Mesh",
          click: () => {
            const { dialog } = require("electron");
            dialog.showMessageBox(window, {
              type: "info",
              title: "About Agent Mesh",
              message: "Agent Mesh",
              detail: `Version ${app.getVersion()}\nOrchestrates multiple Claude Code sessions as specialized agents.`,
            });
          },
        },
        {
          label: "Keyboard Shortcuts",
          click: () => {
            window.webContents.send("menu:show-shortcuts");
          },
        },
      ],
    },
  ];

  // macOS app menu
  if (process.platform === "darwin") {
    template.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
