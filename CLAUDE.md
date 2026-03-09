# claude-agent-mesh

CLI tool that orchestrates multiple Claude Code sessions as specialized agents in a TUI, connected via a shared HTTP MCP server so agents can query each other through their interactive sessions.

## Build & Run

```bash
npm run build    # tsc + chmod
npm run dev      # tsc --watch
npm link         # install `agent-mesh` CLI globally
```

**CLI commands:**
- `agent-mesh start [agent-name]` — launch TUI, start HTTP MCP server, register agents, open agent terminals
- `agent-mesh status` — show agent states
- `agent-mesh stop` — unregister MCP servers, clear sessions

## Architecture

```
cli.ts             — Commander-based CLI entry point
mcp-http-server.ts — Single HTTP MCP server with list_agents, ask_agent, ask_agent_background, answer_agent
tui.ts             — Blessed-based TUI with xterm terminals per agent
agent-registry.ts  — Loads agent configs from ~/.agent-mesh/agents.json
session-store.ts   — Persists interactive state to ~/.agent-mesh/sessions.json
types.ts           — Shared interfaces
```

**MCP server lifecycle:** A single HTTP MCP server runs inside the TUI process on a dynamic port (localhost). Each agent gets an `agent-mesh` entry in `<agent-dir>/.claude/settings.local.json` with `{ type: "http", url: "http://localhost:PORT/mcp" }`. The server supports multiple MCP sessions via `StreamableHTTPServerTransport`.

**ask_agent flow (direct):** Checks target agent is idle → generates request_id → injects formatted question into target agent's pty via `xterm.injectInput()` → holds caller's request open → target agent calls `answer_agent(request_id, response)` → resolves and returns response to caller. Timeout: 120s.

**ask_agent_background flow (fallback):** Spawns disposable `claude -p` process in target agent's directory. No session persistence, no pty injection. Use when target is busy.

## Key Paths

- `~/.agent-mesh/agents.json` — agent definitions (name, directory, description)
- `~/.agent-mesh/sessions.json` — runtime state (interactive flag per agent)
- `<agent-dir>/.claude/settings.local.json` — MCP server registration (managed by start/stop)

## Code Conventions

- ESM modules: `"type": "module"` in package.json, use `.js` extensions in all imports
- Let TypeScript infer return types — no explicit return type annotations
- `execFileSync` for claude CLI calls
- `as const` for MCP response type literals (e.g., `type: "text" as const`)
- Target: ES2022, module resolution: Node16, strict mode enabled

## Dependencies

Runtime dependencies — keep it minimal:
- `@modelcontextprotocol/sdk` — MCP server implementation
- `blessed-xterm` — TUI terminal widgets
- `commander` — CLI framework

## Build Notes

The build script (`npm run build`) does two things:
1. Compiles TypeScript (`tsc`)
2. Sets executable permissions on `dist/cli.js`
