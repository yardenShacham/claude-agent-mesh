import * as pty from "node-pty";
import { BrowserWindow } from "electron";
import type {
  AgentConfig,
  AgentBusyState,
  AgentTerminalRef,
  McpSharedContext,
} from "../shared/types.js";
import { setInteractive } from "../shared/session-store.js";

const ACTIVITY_DEBOUNCE_MS = 3000;

interface ManagedPty {
  agentName: string;
  config: AgentConfig;
  ptyProcess: pty.IPty;
  busyState: AgentBusyState;
  pendingRequestId: string | null;
  activityTimer: ReturnType<typeof setTimeout> | null;
}

export class PtyManager {
  private ptys = new Map<string, ManagedPty>();
  private window: BrowserWindow | null = null;
  private sharedContext: McpSharedContext | null = null;

  setWindow(win: BrowserWindow) {
    this.window = win;
  }

  setSharedContext(ctx: McpSharedContext) {
    this.sharedContext = ctx;
  }

  spawnAgent(config: AgentConfig, allAgents: AgentConfig[], mcpUrl: string) {
    // Kill existing PTY for this agent if any
    this.kill(config.name);

    setInteractive(config.name, true);

    const otherAgents = allAgents
      .filter((a) => a.name !== config.name)
      .map((a) => `- ${a.name}: ${a.description}`)
      .join("\n");

    const systemPrompt = [
      `You are the "${config.name}" agent in a multi-agent mesh.`,
      `Your fellow agents (use these exact names with ask_agent):`,
      otherAgents,
      ``,
      `When you need info from another agent's codebase, use the ask_agent tool with the exact agent name above. Do NOT guess agent names.`,
    ].join("\n");

    const ptyProcess = pty.spawn("claude", ["--system-prompt", systemPrompt], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: config.directory,
      env: {
        ...process.env,
        CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false",
      } as Record<string, string>,
    });

    const managed: ManagedPty = {
      agentName: config.name,
      config,
      ptyProcess,
      busyState: "idle",
      pendingRequestId: null,
      activityTimer: null,
    };

    this.ptys.set(config.name, managed);

    // Forward PTY output to renderer
    ptyProcess.onData((data) => {
      this.window?.webContents.send("pty:data", { agentName: config.name, data });

      // Activity-based busy state detection
      if (managed.busyState === "idle") {
        managed.busyState = "working";
        this.sendStateUpdate(config.name);
      }

      if (managed.activityTimer) clearTimeout(managed.activityTimer);
      managed.activityTimer = setTimeout(() => {
        if (managed.busyState === "working") {
          managed.busyState = "idle";
          this.sendStateUpdate(config.name);
        }
        managed.activityTimer = null;
      }, ACTIVITY_DEBOUNCE_MS);
    });

    ptyProcess.onExit(() => {
      // Reject any pending MCP requests for this agent
      if (managed.pendingRequestId && this.sharedContext) {
        const pending = this.sharedContext.pendingRequests.get(managed.pendingRequestId);
        if (pending) {
          clearTimeout(pending.timeoutHandle);
          pending.reject(new Error(`Agent "${config.name}" exited while processing request`));
          this.sharedContext.pendingRequests.delete(managed.pendingRequestId);
        }
        managed.pendingRequestId = null;
      }

      managed.busyState = "idle";
      setInteractive(config.name, false);

      this.window?.webContents.send("pty:exit", { agentName: config.name });
      this.sendStateUpdate(config.name);
    });
  }

  write(agentName: string, data: string) {
    const managed = this.ptys.get(agentName);
    if (managed) {
      managed.ptyProcess.write(data);
    }
  }

  injectInput(agentName: string, data: string) {
    const managed = this.ptys.get(agentName);
    if (managed) {
      managed.ptyProcess.write(data);
    }
  }

  resize(agentName: string, cols: number, rows: number) {
    const managed = this.ptys.get(agentName);
    if (managed) {
      managed.ptyProcess.resize(cols, rows);
    }
  }

  kill(agentName: string) {
    const managed = this.ptys.get(agentName);
    if (managed) {
      if (managed.activityTimer) clearTimeout(managed.activityTimer);
      try {
        managed.ptyProcess.kill();
      } catch {
        // ignore
      }
      setInteractive(agentName, false);
      this.ptys.delete(agentName);
    }
  }

  killAll() {
    for (const name of [...this.ptys.keys()]) {
      this.kill(name);
    }
  }

  getTerminalRef(agentName: string): AgentTerminalRef | undefined {
    const managed = this.ptys.get(agentName);
    if (!managed) return undefined;

    return {
      config: managed.config,
      injectInput: (data: string) => this.injectInput(agentName, data),
      get busyState() {
        return managed.busyState;
      },
      set busyState(v: AgentBusyState) {
        managed.busyState = v;
      },
      get pendingRequestId() {
        return managed.pendingRequestId;
      },
      set pendingRequestId(v: string | null) {
        managed.pendingRequestId = v;
      },
    };
  }

  getBusyState(agentName: string): AgentBusyState {
    return this.ptys.get(agentName)?.busyState ?? "idle";
  }

  getPendingRequestId(agentName: string): string | null {
    return this.ptys.get(agentName)?.pendingRequestId ?? null;
  }

  private sendStateUpdate(agentName: string) {
    const managed = this.ptys.get(agentName);
    this.window?.webContents.send("agents:state-update", {
      name: agentName,
      busyState: managed?.busyState ?? "idle",
      pendingRequestId: managed?.pendingRequestId ?? null,
    });
  }
}
