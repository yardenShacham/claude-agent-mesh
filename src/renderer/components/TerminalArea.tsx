import { useAgents } from "../contexts/AgentContext";
import { Terminal } from "./Terminal";

export function TerminalArea() {
  const { agents, activeAgent, splitAgents } = useAgents();

  if (splitAgents) {
    // Split mode: show selected agents in a grid
    const cols = Math.min(splitAgents.length, 2);
    const rows = Math.ceil(splitAgents.length / cols);

    return (
      <div
        className="flex-1 grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: 1,
          background: "var(--border)",
        }}
      >
        {splitAgents.map((name) => (
          <div
            key={name}
            className="flex flex-col min-h-0"
            style={{ background: "var(--bg-primary)" }}
          >
            {/* Thin top bar with agent name */}
            <div
              className="flex items-center px-2 shrink-0"
              style={{
                height: 24,
                background: "var(--bg-secondary)",
                borderBottom:
                  name === activeAgent ? "2px solid var(--accent)" : "2px solid var(--border)",
              }}
            >
              <span className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                {name}
              </span>
            </div>
            <div className="flex-1 min-h-0">
              <Terminal agentName={name} visible={true} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Single mode: render all terminals, only show active one
  return (
    <div className="flex-1 min-h-0">
      {agents.map((agent) => (
        <Terminal key={agent.name} agentName={agent.name} visible={agent.name === activeAgent} />
      ))}
    </div>
  );
}
