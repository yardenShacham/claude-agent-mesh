import { useState } from "react";
import { useAgents } from "../contexts/AgentContext";

export function McpStatus() {
  const { mcpStatus } = useAgents();
  const [collapsed, setCollapsed] = useState(false);

  if (!mcpStatus) return null;

  return (
    <div className="border-t" style={{ borderColor: "var(--border)" }}>
      <button
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider"
        style={{ color: "var(--text-muted)" }}
        onClick={() => setCollapsed((v) => !v)}
      >
        <span>MCP Server</span>
        <span>{collapsed ? "+" : "-"}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Port</span>
            <span style={{ color: "var(--text-primary)" }}>localhost:{mcpStatus.port}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Sessions</span>
            <span style={{ color: "var(--text-primary)" }}>{mcpStatus.sessionCount}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span style={{ color: "var(--text-secondary)" }}>Pending</span>
            <span style={{ color: "var(--text-primary)" }}>{mcpStatus.pendingRequests.length}</span>
          </div>
          {mcpStatus.pendingRequests.map((req, i) => (
            <div key={i} className="text-xs pl-2" style={{ color: "var(--text-muted)" }}>
              {req.caller} → {req.target}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
