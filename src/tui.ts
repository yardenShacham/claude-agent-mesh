import {createRequire} from "node:module";
import blessed from "blessed";
import type {AgentConfig, AgentTerminalRef, McpSharedContext} from "./types.js";
import {clearSessions, setInteractive} from "./session-store.js";
import {startMcpHttpServer} from "./mcp-http-server.js";

const require = createRequire(import.meta.url);
const XTerm = require("blessed-xterm");

interface AgentTerminal {
    config: AgentConfig;
    xterm: InstanceType<typeof XTerm>;
}

interface TuiCommand {
    name: string;
    aliases: string[];
    description: string;
    execute: (args?: string) => void;
}

export interface TuiOptions {
    agents: AgentConfig[];
    registerMcp: (agentDir: string, mcpUrl: string) => void;
    unregisterMcp: (agentDir: string) => void;
}

export function launchTui(options: TuiOptions) {
    const { agents, registerMcp, unregisterMcp } = options;
    const SIDEBAR_WIDTH = 32;
    return new Promise<void>(async (resolve) => {
        const screen = blessed.screen({
            smartCSR: true,
            fullUnicode: true,
            mouse: true,
            title: "Agent Mesh",
            autoPadding: false,
            warnings: false,
        });

        // Sidebar container
        const sidebarContainer = blessed.box({
            parent: screen,
            left: 0,
            top: 0,
            width: SIDEBAR_WIDTH,
            height: "100%-1",
        });

        // Agent list (top of sidebar)
        const agentListHeight = agents.length * 2 + 2; // 2 lines per agent + 2 for border
        const sidebar = blessed.box({
            parent: sidebarContainer,
            label: " Agent Mesh ",
            left: 0,
            top: 0,
            width: SIDEBAR_WIDTH,
            height: agentListHeight,
            border: { type: "line" },
            tags: true,
            mouse: true,
            style: {
                border: { fg: "blue" },
                fg: "white",
                label: { fg: "cyan", bold: true } as unknown as string,
            },
        });

        // Per-agent row boxes inside the sidebar container
        const agentBoxes = agents.map((a, i) => {
            const box = blessed.box({
                parent: sidebar,
                left: 1,
                top: i * 2 + 1 ,
                width: SIDEBAR_WIDTH - 2, // account for border
                height: 2,
                tags: true,
                mouse: true,
                content: ` ${i + 1}  ● ${a.name}`,
                valign: "middle",
                style: { fg: "white" },
            });
            box.on("click", () => switchToAgent(i));
            return box;
        });

        // MCP status box (below agent list)
        const mcpStatusBox = blessed.box({
            parent: sidebarContainer,
            label: " MCP Server ",
            left: 0,
            top: agentListHeight,
            width: SIDEBAR_WIDTH,
            height: `100%-${agentListHeight}`,
            border: { type: "line" },
            tags: true,
            style: {
                border: { fg: "blue" },
                fg: "white",
                label: { fg: "cyan", bold: true } as unknown as string,
            },
            content: " Starting...",
        });

        // Status bar
        const statusBar = blessed.box({
            parent: screen,
            bottom: 0,
            left: 0,
            width: "100%",
            height: 1,
            style: { fg: "white", bg: "blue" },
            content: " Ctrl+G: command prompt",
        });

        // Command prompt widgets (hidden by default)
        const completionList = blessed.list({
            parent: screen,
            bottom: 1,
            left: SIDEBAR_WIDTH,
            width: `100%-${SIDEBAR_WIDTH}`,
            height: 8,
            border: { type: "line" },
            style: {
                border: { fg: "cyan" },
                selected: { fg: "black", bg: "cyan", bold: true },
                item: { fg: "white" },
            },
            hidden: true,
            interactive: false,
        });

        const commandInput = blessed.box({
            parent: screen,
            bottom: 0,
            left: 0,
            width: "100%",
            height: 1,
            style: { fg: "white", bg: "blue" },
            hidden: true,
        });

        // Terminal container
        const termContainer = blessed.box({
            parent: screen,
            left: SIDEBAR_WIDTH,
            top: 0,
            width: `100%-${SIDEBAR_WIDTH}`,
            height: "100%-1",
        });

        // Create XTerm widgets for each agent
        // NOTE: Do not pass `parent` in XTerm options — blessed-xterm uses clone()
        // which deep-clones all options including parent refs to Screen/Socket objects,
        // causing "Cannot set property bytesRead" errors. Append manually instead.
        // Also must use numeric width/height (not "100%") since blessed resolves
        // percentage strings via parent.width which is null before appending.
        const termWidth = (screen.width as number) - SIDEBAR_WIDTH;
        const termHeight = (screen.height as number) - 1;
        const terminals: AgentTerminal[] = agents.map((config) => {
            const xterm = new XTerm({
                left: 0,
                top: 0,
                width: termWidth,
                height: termHeight,
                shell: null, // Don't auto-spawn; we spawn claude manually
                controlKey: "none", // Disable built-in control key
                scrollback: 5000,
                style: {
                    fg: "default",
                    bg: "default",
                },
                hidden: true,
            });
            termContainer.append(xterm);


            return { config, xterm };
        });

        // Spinner animation state
        const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        let spinnerTick = 0;

        // Debounce timers for detecting idle after terminal activity stops
        const activityTimers = new Map<string, ReturnType<typeof setTimeout>>();
        const ACTIVITY_DEBOUNCE_MS = 3000;

        // Build shared context for MCP server
        const terminalRefs = new Map<string, AgentTerminalRef>();
        for (const t of terminals) {
            terminalRefs.set(t.config.name, {
                config: t.config,
                injectInput: (data: string) => t.xterm.injectInput(data),
                busyState: "idle",
                pendingRequestId: null,
            });
        }

        const sharedContext: McpSharedContext = {
            getAgents: () => agents,
            getTerminalRef: (name) => terminalRefs.get(name),
            pendingRequests: new Map(),
        };

        // Start HTTP MCP server
        const mcpServer = await startMcpHttpServer(sharedContext);
        const mcpUrl = `http://localhost:${mcpServer.port}/mcp`;

        // Register MCP for each agent with the HTTP URL
        for (const agent of agents) {
            registerMcp(agent.directory, mcpUrl);
        }

        // Refresh sidebar status frequently for smooth spinner animation
        const sidebarRefreshInterval = setInterval(() => {
            spinnerTick++;
            updateSidebarItems();
            updateMcpStatus();
            screen.render();
        }, 200);

        // Resize XTerm widgets when screen resizes
        screen.on("resize", () => {
            mcpStatusBox.height = `100%-${agentListHeight}` as unknown as number;
            layoutTerminals();
        });

        let activeIndex = 0;
        let promptActive = false;
        let promptValue = "";
        let completionIndex = 0;
        let filteredCommands: TuiCommand[] = [];
        let splitVisible: number[] | null = null;

        function layoutTerminals() {
            const containerWidth = (screen.width as number) - SIDEBAR_WIDTH;
            const containerHeight = (screen.height as number) - 1;

            if (splitVisible === null) {
                // Single mode: show only active terminal at full size
                for (let i = 0; i < terminals.length; i++) {
                    if (i === activeIndex) {
                        const xt = terminals[i].xterm;
                        xt.left = 0;
                        xt.top = 0;
                        xt.width = containerWidth;
                        xt.height = containerHeight;
                        xt.show();
                    } else {
                        terminals[i].xterm.hide();
                    }
                }
            } else {
                // Split mode: tile visible agents in a grid (max 2 columns)
                const paneCount = splitVisible.length;
                const cols = Math.min(paneCount, 2);
                const rows = Math.ceil(paneCount / cols);
                const paneWidth = Math.floor(containerWidth / cols);
                const paneHeight = Math.floor(containerHeight / rows);

                // Hide all first
                for (const t of terminals) t.xterm.hide();

                // Show and position visible panes in grid
                for (let p = 0; p < paneCount; p++) {
                    const col = p % cols;
                    const row = Math.floor(p / cols);
                    const idx = splitVisible[p];
                    const xt = terminals[idx].xterm;
                    xt.left = col * paneWidth;
                    xt.top = row * paneHeight;
                    xt.width = col === cols - 1 ? containerWidth - col * paneWidth : paneWidth;
                    xt.height = row === rows - 1 ? containerHeight - row * paneHeight : paneHeight;
                    xt.show();
                }
            }

            terminals[activeIndex].xterm.focus();
            updateSidebarItems();
            updateStatusBar();
            screen.render();
        }

        function updateStatusBar() {
            if (splitVisible !== null) {
                const names = splitVisible.map((i) => `${i + 1}:${agents[i].name}`).join(" | ");
                statusBar.setContent(` Split: ${names}  |  Ctrl+G: command prompt`);
            } else {
                statusBar.setContent(" Ctrl+G: command prompt");
            }
        }

        function switchToAgent(index: number) {
            if (index < 0 || index >= terminals.length) return;

            if (splitVisible !== null) {
                if (splitVisible.includes(index)) {
                    // Target is in split view — just switch focus
                    activeIndex = index;
                    terminals[activeIndex].xterm.focus();
                    updateSidebarItems();
                    screen.render();
                    return;
                }
                // Target not in split — exit split mode
                splitVisible = null;
            }

            if (index === activeIndex && !terminals[index].xterm.hidden) return;
            activeIndex = index;
            layoutTerminals();
        }

        function getStatusIndicator(state: import("./types.js").AgentBusyState, isActive: boolean) {
            switch (state) {
                case "working": {
                    const frame = spinnerFrames[spinnerTick % spinnerFrames.length];
                    return isActive ? `{red-fg}${frame}{/red-fg}` : `{cyan-fg}${frame}{/cyan-fg}`;
                }
                case "asking":     return "{blue-fg}◇{/blue-fg}";
                case "answering":  return "{yellow-fg}◆{/yellow-fg}";
                default:           return "{green-fg}●{/green-fg}";
            }
        }

        function updateSidebarItems() {
            agents.forEach((a, i) => {
                const ref = terminalRefs.get(a.name);
                const state = ref?.busyState ?? "idle";
                const indicator = getStatusIndicator(state, i === activeIndex);
                const box = agentBoxes[i];
                if (i === activeIndex) {
                    box.style.bg = "cyan";
                    box.style.fg = "black";
                    box.setContent(`{cyan-bg}{black-fg} ${i + 1}  {/}{cyan-bg}${indicator}{cyan-bg}{black-fg} ${a.name}{/}`);
                } else if (splitVisible !== null && splitVisible.includes(i)) {
                    box.style.bg = "blue";
                    box.style.fg = "white";
                    box.setContent(`{blue-bg}{white-fg} ${i + 1}  {/}{blue-bg}${indicator}{blue-bg}{white-fg} ${a.name}{/}`);
                } else {
                    box.style.bg = "default";
                    box.style.fg = "white";
                    box.setContent(` ${i + 1}  ${indicator} ${a.name}`);
                }
            });
        }

        function updateMcpStatus() {
            const port = mcpServer?.port ?? "...";
            const sessionCount = mcpServer?.getSessionCount() ?? 0;
            const pendingCount = sharedContext.pendingRequests.size;

            const lines = [
                ` Port: ${port}`,
                ` Sessions: ${sessionCount}`,
                ` Requests: ${pendingCount}`,
            ];

            for (const [, req] of sharedContext.pendingRequests) {
                lines.push(`  ${req.callerAgent} → ${req.targetAgent}`);
            }

            mcpStatusBox.setContent(lines.join("\n"));
        }

        function spawnClaude(terminal: AgentTerminal) {
            const { config, xterm } = terminal;
            setInteractive(config.name, true);

            const otherAgents = agents
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

            // Spawn claude in the agent's directory
            xterm.spawn("claude", ["--system-prompt", systemPrompt], config.directory, {
                ...process.env,
                CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: "false",
            } as Record<string, string>);

            // Detect activity from PTY output (not UI repaints)
            xterm.pty.on("data", () => {
                const ref = terminalRefs.get(config.name);
                if (!ref) return;

                if (ref.busyState === "idle") {
                    ref.busyState = "working";
                }

                const existing = activityTimers.get(config.name);
                if (existing) clearTimeout(existing);

                activityTimers.set(config.name, setTimeout(() => {
                    const r = terminalRefs.get(config.name);
                    if (r && r.busyState === "working") {
                        r.busyState = "idle";
                    }
                    activityTimers.delete(config.name);
                }, ACTIVITY_DEBOUNCE_MS));
            });

            xterm.on("exit", () => {
                // Reject any pending requests for this agent
                const ref = terminalRefs.get(config.name);
                if (ref?.pendingRequestId) {
                    const pending = sharedContext.pendingRequests.get(ref.pendingRequestId);
                    if (pending) {
                        clearTimeout(pending.timeoutHandle);
                        pending.reject(new Error(`Agent "${config.name}" exited while processing request`));
                        sharedContext.pendingRequests.delete(ref.pendingRequestId);
                    }
                    ref.busyState = "idle";
                    ref.pendingRequestId = null;
                }

                setInteractive(config.name, false);
                xterm.write("\r\n\x1b[33m  Session ended. Press ENTER to restart or wait.\x1b[0m\r\n");

                // Only listen when this terminal is focused
                const checkFocusAndRestart = (_ch: string, key: blessed.Widgets.Events.IKeyEventArg) => {
                    if (screen.focused === xterm && (key.full === "enter" || key.full === "return")) {
                        screen.removeListener("keypress", checkFocusAndRestart);
                        spawnClaude(terminal);
                    }
                };
                screen.on("keypress", checkFocusAndRestart);
            });
        }

        async function reloadAllAgents() {
            statusBar.setContent(" Reloading all agents...");
            screen.render();

            // 1. Terminate all PTYs
            for (const t of terminals) {
                try { t.xterm.terminate(); } catch { /* ignore */ }
                setInteractive(t.config.name, false);
            }

            // 2. Unregister MCP for all agents
            for (const t of terminals) {
                unregisterMcp(t.config.directory);
            }

            // 3. Clear sessions
            clearSessions();

            // 4. Wait for PTYs to close
            await new Promise((r) => setTimeout(r, 500));

            // 5. Re-register MCP for all agents (HTTP server stays running)
            for (const t of terminals) {
                registerMcp(t.config.directory, mcpUrl);
            }

            // 6. Respawn claude in all terminals
            for (const terminal of terminals) {
                spawnClaude(terminal);
            }

            statusBar.setContent(" Ctrl+G: command prompt");
            screen.render();
        }

        // Build command registry
        const commands: TuiCommand[] = [
            { name: "/quit", aliases: ["/q"], description: "Quit agent mesh", execute: () => cleanup() },
            { name: "/status", aliases: [], description: "Show agent status", execute: () => {
                    const statusLines = terminals.map((t, i) => {
                        const active = i === activeIndex ? " *" : "  ";
                        return `${active}${t.config.name}`;
                    });
                    statusBar.setContent(` ${statusLines.join(" | ")}`);
                    screen.render();
                }},
            { name: "/reload", aliases: [], description: "Restart all agent sessions", execute: () => { reloadAllAgents(); } },
            { name: "/split", aliases: ["/sp"], description: "Split view (e.g. /split 1 3)", execute: (args?: string) => {
                    let indices: number[];
                    if (args && args.trim()) {
                        indices = [...new Set(
                            args.trim().split(/\s+/)
                                .map((s) => parseInt(s, 10) - 1)
                                .filter((n) => !isNaN(n) && n >= 0 && n < terminals.length)
                        )];
                    } else {
                        indices = terminals.map((_, i) => i);
                    }
                    if (indices.length < 2) return;
                    if (!indices.includes(activeIndex)) {
                        activeIndex = indices[0];
                    }
                    splitVisible = indices;
                    layoutTerminals();
                }},
            { name: "/focus", aliases: ["/f"], description: "Exit split, single view", execute: () => {
                    if (splitVisible === null) return;
                    splitVisible = null;
                    layoutTerminals();
                }},
            ...terminals.map((_, i) => ({
                name: `/${i + 1}`,
                aliases: [] as string[],
                description: `Switch to ${agents[i].name}`,
                execute: () => switchToAgent(i),
            })),
        ];

        function updateCompletions() {
            const cmdPortion = promptValue.split(" ")[0].toLowerCase();
            filteredCommands = commands.filter((cmd) =>
                cmd.name.toLowerCase().startsWith(cmdPortion) ||
                cmd.aliases.some((a) => a.toLowerCase().startsWith(cmdPortion))
            );
            completionList.height = Math.min(filteredCommands.length + 2, 10);
            completionList.setItems(
                filteredCommands.map((cmd) => `${cmd.name}  ${cmd.description}`) as unknown as string[]
            );
            completionIndex = 0;
            if (filteredCommands.length > 0) {
                completionList.select(0);
            }
            screen.render();
        }

        function openPrompt() {
            promptActive = true;
            promptValue = "/";

            // Disable input on active xterm
            terminals[activeIndex].xterm.enableInput(false);

            statusBar.hide();
            commandInput.setContent(" > /");
            commandInput.show();
            completionList.show();
            // Bring prompt widgets above the XTerm terminal
            commandInput.setFront();
            completionList.setFront();
            updateCompletions();
        }

        function closePrompt() {
            promptActive = false;
            commandInput.hide();
            completionList.hide();
            statusBar.show();

            // Re-enable input on active xterm and refocus
            terminals[activeIndex].xterm.enableInput(true);
            terminals[activeIndex].xterm.focus();
            screen.render();
        }

        function executeCommand(value: string) {
            const input = value.trim().replace(/^\/\s*/, "/");
            const spaceIdx = input.indexOf(" ");
            const cmdName = spaceIdx === -1 ? input : input.slice(0, spaceIdx);
            const args = spaceIdx === -1 ? undefined : input.slice(spaceIdx + 1);
            const cmd = commands.find((c) =>
                c.name === cmdName || c.aliases.includes(cmdName)
            );
            if (cmd) {
                cmd.execute(args);
            }
        }

        function acceptCompletion() {
            if (filteredCommands.length > 0 && completionIndex < filteredCommands.length) {
                promptValue = filteredCommands[completionIndex].name;
                commandInput.setContent(` > ${promptValue}`);
                updateCompletions();
            }
        }

        // Handle keypress
        screen.on("keypress", (_ch: string, key: blessed.Widgets.Events.IKeyEventArg) => {
            if (!key) return;

            if (promptActive) {
                if (key.full === "escape") {
                    closePrompt();
                    return;
                }
                if (key.full === "enter" || key.full === "return") {
                    const value = promptValue;
                    closePrompt();
                    executeCommand(value);
                    return;
                }
                if (key.full === "up") {
                    if (filteredCommands.length > 0) {
                        completionIndex = (completionIndex - 1 + filteredCommands.length) % filteredCommands.length;
                        completionList.select(completionIndex);
                        screen.render();
                    }
                    return;
                }
                if (key.full === "down") {
                    if (filteredCommands.length > 0) {
                        completionIndex = (completionIndex + 1) % filteredCommands.length;
                        completionList.select(completionIndex);
                        screen.render();
                    }
                    return;
                }
                if (key.full === "tab") {
                    acceptCompletion();
                    return;
                }
                if (key.full === "backspace") {
                    if (promptValue.length > 1) {
                        promptValue = promptValue.slice(0, -1);
                        commandInput.setContent(` > ${promptValue}`);
                        updateCompletions();
                    }
                    return;
                }
                // Regular character input
                if (_ch && _ch.length === 1 && !key.ctrl && !key.meta) {
                    promptValue += _ch;
                    commandInput.setContent(` > ${promptValue}`);
                    updateCompletions();
                }
                return;
            }

            if (key.full === "C-g") {
                openPrompt();
                return;
            }
        });

        let cleanedUp = false;
        function cleanup() {
            if (cleanedUp) return;
            cleanedUp = true;

            clearInterval(sidebarRefreshInterval);

            // Terminate all PTYs and mark non-interactive
            for (const t of terminals) {
                try {
                    t.xterm.terminate();
                } catch {
                    // ignore
                }
                setInteractive(t.config.name, false);
            }

            // Stop HTTP MCP server
            mcpServer.stop().catch(() => {});

            screen.destroy();
            resolve();
        }

        // Signal handlers
        process.on("SIGINT", cleanup);
        process.on("SIGTERM", cleanup);

        // Show first agent and spawn claude for all
        layoutTerminals();

        screen.render();

        // Spawn claude for each agent
        for (const terminal of terminals) {
            spawnClaude(terminal);
        }
    });
}
