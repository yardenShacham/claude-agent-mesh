import { useAgents } from "../contexts/AgentContext";

export function StatusBar() {
  const { agents, activeAgent, splitAgents, mcpStatus } = useAgents();

  const modeLabel = splitAgents ? `Split ${splitAgents.length}` : "Single";

  return (
    <div
      className="flex items-center justify-between px-3 shrink-0"
      style={{
        height: 28,
        background: "var(--bg-secondary)",
        borderTop: "1px solid var(--border)",
        color: "var(--text-secondary)",
        fontSize: 12,
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <span
          className="px-1.5 py-0.5 rounded text-xs"
          style={{ background: "var(--bg-tertiary)" }}
        >
          {modeLabel}
        </span>
        {activeAgent && <span style={{ color: "var(--text-primary)" }}>{activeAgent}</span>}
      </div>

      {/* Center */}
      <div className="flex items-center gap-2">
        {mcpStatus && (
          <>
            <span>MCP :{mcpStatus.port}</span>
            <span style={{ color: "var(--text-muted)" }}>|</span>
            <span>{mcpStatus.sessionCount} sessions</span>
          </>
        )}
      </div>

      {/* Right */}
      <div style={{ color: "var(--text-muted)" }}>Cmd+K Commands</div>
    </div>
  );
}
