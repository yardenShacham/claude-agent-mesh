import { useAgents } from "../contexts/AgentContext";
import { AgentList } from "./AgentList";
import { McpStatus } from "./McpStatus";

export function Sidebar() {
  const { sidebarVisible } = useAgents();

  if (!sidebarVisible) return null;

  return (
    <div
      className="flex flex-col shrink-0 border-r"
      style={{
        width: 240,
        background: "var(--bg-secondary)",
        borderColor: "var(--border)",
      }}
    >
      <div
        className="px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b"
        style={{ color: "var(--text-muted)", borderColor: "var(--border)" }}
      >
        Agent Mesh
      </div>
      <div className="flex-1 overflow-y-auto">
        <AgentList />
      </div>
      <McpStatus />
    </div>
  );
}
