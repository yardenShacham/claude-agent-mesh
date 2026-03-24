import { useState, useEffect, useRef, useMemo } from "react";
import { useAgents } from "../contexts/AgentContext";

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  execute: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    agents,
    setActiveAgent,
    setSplitAgents,
    setSidebarVisible,
    sidebarVisible,
    setManageAgentsOpen,
    setSplitModalOpen,
  } = useAgents();

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Per-agent switch commands
    agents.forEach((agent, i) => {
      cmds.push({
        id: `switch-${agent.name}`,
        label: `Switch to ${agent.name}`,
        shortcut: i < 9 ? `Cmd+${i + 1}` : undefined,
        execute: () => {
          setSplitAgents(null);
          setActiveAgent(agent.name);
        },
      });
    });

    cmds.push({
      id: "split-view",
      label: "Split View — Select agents",
      shortcut: "Cmd+Shift+S",
      execute: () => setSplitModalOpen(true),
    });

    cmds.push({
      id: "focus-active",
      label: "Focus Active — Exit split mode",
      shortcut: "Esc",
      execute: () => setSplitAgents(null),
    });

    cmds.push({
      id: "toggle-sidebar",
      label: `${sidebarVisible ? "Hide" : "Show"} Sidebar`,
      shortcut: "Cmd+B",
      execute: () => setSidebarVisible(!sidebarVisible),
    });

    cmds.push({
      id: "manage-agents",
      label: "Manage Agents",
      shortcut: "Cmd+Shift+A",
      execute: () => setManageAgentsOpen(true),
    });

    cmds.push({
      id: "reload-all",
      label: "Reload All Agents",
      shortcut: "Cmd+Shift+R",
      execute: () => window.electronAPI.reloadAll(),
    });

    cmds.push({
      id: "refresh-terminals",
      label: "Refresh Terminals",
      shortcut: "Cmd+Shift+T",
      execute: () => {
        window.electronAPI.triggerRefreshTerminals();
      },
    });

    cmds.push({
      id: "restart-current",
      label: "Restart Current Agent",
      execute: () => {
        const active = agents.find((a) => a.name === agents[0]?.name);
        if (active) window.electronAPI.restartAgent(active.name);
      },
    });

    return cmds;
  }, [
    agents,
    sidebarVisible,
    setActiveAgent,
    setSplitAgents,
    setSidebarVisible,
    setManageAgentsOpen,
    setSplitModalOpen,
  ]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter((cmd) => cmd.label.toLowerCase().includes(lower));
  }, [commands, query]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setSelectedIndex(0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Also listen for menu show-shortcuts
  useEffect(() => {
    return window.electronAPI?.onMenuShowShortcuts(() => {
      setOpen(true);
      setQuery("");
      setSelectedIndex(0);
    });
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset selection when filtered changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && filtered[selectedIndex]) {
      filtered[selectedIndex].execute();
      setOpen(false);
      return;
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.5)" }}
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div
        className="fixed z-50 rounded-lg shadow-2xl border overflow-hidden"
        style={{
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: 480,
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Search input */}
        <div className="border-b" style={{ borderColor: "var(--border)" }}>
          <input
            ref={inputRef}
            type="text"
            className="w-full px-4 py-3 outline-none text-sm"
            style={{
              background: "transparent",
              color: "var(--text-primary)",
            }}
            placeholder="Type a command..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Command list */}
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className="flex items-center justify-between px-4 py-2 cursor-pointer"
              style={{
                background: i === selectedIndex ? "var(--bg-hover)" : "transparent",
                color: "var(--text-primary)",
              }}
              onClick={() => {
                cmd.execute();
                setOpen(false);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="text-sm">{cmd.label}</span>
              {cmd.shortcut && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "var(--bg-tertiary)", color: "var(--text-muted)" }}
                >
                  {cmd.shortcut}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
              No commands found
            </div>
          )}
        </div>
      </div>
    </>
  );
}
