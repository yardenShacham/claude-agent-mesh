# claude-agent-mesh

Electron desktop app that orchestrates multiple Claude Code sessions as specialized agents, connected via a shared HTTP MCP server so agents can query each other through their interactive sessions.

## Build & Run

```bash
npm run build    # vite build + tsc (main process)
npm run dev      # concurrent: vite dev server + tsc --watch + electron
npm run package  # build + electron-builder
```

## Architecture

```
src/
  main/                     # Electron main process (Node.js)
    index.ts                # App lifecycle, BrowserWindow, startup sequence
    pty-manager.ts          # node-pty per-agent spawning, I/O, state tracking
    ipc-handlers.ts         # All ipcMain.handle / ipcMain.on registrations
    menu.ts                 # Native application menu
    mcp-bridge.ts           # Constructs McpSharedContext from pty-manager
    agent-lifecycle.ts      # registerMcpForAgent / unregisterMcpForAgent
  renderer/                 # React app (browser context, bundled by Vite)
    App.tsx                 # Root layout: sidebar + terminal area + status bar + command palette
    components/             # Sidebar, AgentList, McpStatus, Terminal, TerminalArea, CommandPalette, StatusBar
    contexts/AgentContext   # React context: agents state, active agent, split mode, MCP status
  preload/
    index.ts                # contextBridge.exposeInMainWorld('electronAPI', {...})
    api.d.ts                # TypeScript declarations for window.electronAPI
  shared/                   # Reused business logic (unchanged from v1)
    types.ts                # AgentConfig, AgentTerminalRef, McpSharedContext, etc.
    agent-registry.ts       # Loads agent configs from ~/.agent-mesh/agents.json
    session-store.ts        # Persists interactive state to ~/.agent-mesh/sessions.json
    mcp-http-server.ts      # Single HTTP MCP server with list_agents, ask_agent, answer_agent
```

**MCP server lifecycle:** A single HTTP MCP server runs inside the Electron main process on a dynamic port (localhost). Each agent gets an `agent-mesh` entry in `<agent-dir>/.mcp.json` with `{ type: "http", url: "http://localhost:PORT/mcp" }`. The server supports multiple MCP sessions via `StreamableHTTPServerTransport`.

**ask_agent flow (direct):** Checks target agent is idle → generates request_id → injects formatted question into target agent's pty via `ptyManager.injectInput()` → holds caller's request open → target agent calls `answer_agent(request_id, response)` → resolves and returns response to caller. Timeout: 120s.

**Terminal I/O:** Renderer xterm.js `onData` → IPC `pty:write` → main pty-manager → node-pty. Reverse: node-pty `onData` → IPC `pty:data` → renderer xterm.js `write`.

## Key Paths

- `~/.agent-mesh/agents.json` — agent definitions (name, directory, description)
- `~/.agent-mesh/sessions.json` — runtime state (interactive flag per agent)
- `<agent-dir>/.mcp.json` — MCP server registration (managed by start/stop)

## Code Conventions

- ESM modules: `"type": "module"` in package.json, use `.js` extensions in main/shared imports
- Let TypeScript infer return types — no explicit return type annotations
- `as const` for MCP response type literals (e.g., `type: "text" as const`)
- Main process: target ES2022, module Node16 (`tsconfig.main.json`)
- Renderer: target ES2022, module ESNext, jsx react-jsx (`tsconfig.renderer.json`)
- Tailwind CSS v4 for renderer styling, dark theme with CSS custom properties

## Dependencies

Runtime:

- `@modelcontextprotocol/sdk` — MCP server implementation
- `@xterm/xterm` + `@xterm/addon-fit` — terminal rendering in renderer
- `node-pty` — PTY spawning in main process

Dev:

- `electron` — desktop app framework
- `react` + `react-dom` — renderer UI
- `tailwindcss` + `@tailwindcss/vite` — styling
- `vite` + `@vitejs/plugin-react` — renderer bundling

## Build Notes

`npm run build` does:

1. `vite build` — bundles renderer (React + Tailwind) to `dist/renderer/`
2. `tsc -p tsconfig.main.json` — compiles main process + shared + preload to `dist/`
