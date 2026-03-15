import { useState } from "react";
import { useAgents } from "../contexts/AgentContext";
import type { AgentInfo } from "../../preload/api";

const stateColors: Record<AgentInfo["busyState"], string> = {
  idle: "var(--success)",
  working: "var(--accent)",
  asking: "var(--info)",
  answering: "var(--warning)",
};

export function AgentList() {
  const { agents, activeAgent, setActiveAgent, splitAgents } = useAgents();
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; agent: string } | null>(
    null,
  );

  const handleContextMenu = (e: React.MouseEvent, agentName: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, agent: agentName });
  };

  const handleRestart = (agentName: string) => {
    window.electronAPI.restartAgent(agentName);
    setContextMenu(null);
  };

  return (
    <div className="py-1">
      {agents.map((agent, i) => {
        const isActive = agent.name === activeAgent;
        const isInSplit = splitAgents?.includes(agent.name);
        const isHovered = hoveredAgent === agent.name;

        return (
          <div
            key={agent.name}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
            style={{
              background: isActive
                ? "var(--bg-tertiary)"
                : isHovered
                  ? "var(--bg-hover)"
                  : "transparent",
              borderLeft: isActive ? "3px solid var(--accent)" : "3px solid transparent",
            }}
            onClick={() => setActiveAgent(agent.name)}
            onMouseEnter={() => setHoveredAgent(agent.name)}
            onMouseLeave={() => setHoveredAgent(null)}
            onContextMenu={(e) => handleContextMenu(e, agent.name)}
          >
            {/* Status dot */}
            <span
              className={agent.busyState === "working" ? "animate-pulse-dot" : ""}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: stateColors[agent.busyState],
                flexShrink: 0,
              }}
            />
            {/* Index number */}
            <span
              className="text-xs"
              style={{ color: "var(--text-muted)", width: 14, textAlign: "center" }}
            >
              {i + 1}
            </span>
            {/* Agent name */}
            <span
              className="truncate flex-1"
              style={{ color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}
            >
              {agent.name}
            </span>
            {/* Split indicator */}
            {isInSplit && !isActive && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                split
              </span>
            )}
            {/* Restart button on hover */}
            {isHovered && (
              <button
                className="text-xs px-1 rounded hover:opacity-100 opacity-60"
                style={{ color: "var(--text-muted)" }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestart(agent.name);
                }}
                title="Restart agent"
              >
                ↻
              </button>
            )}
          </div>
        );
      })}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 py-1 rounded shadow-lg border"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              background: "var(--bg-tertiary)",
              borderColor: "var(--border)",
              minWidth: 150,
            }}
          >
            <button
              className="w-full text-left px-3 py-1.5 text-sm hover:opacity-80"
              style={{ color: "var(--text-primary)" }}
              onClick={() => handleRestart(contextMenu.agent)}
            >
              Restart Agent
            </button>
          </div>
        </>
      )}
    </div>
  );
}
