import { useState, useEffect } from "react";
import { useAgents } from "../contexts/AgentContext";

export function SplitAgentsModal() {
  const { agents, splitAgents, setSplitAgents, setActiveAgent, splitModalOpen, setSplitModalOpen } =
    useAgents();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Initialize selection when modal opens
  useEffect(() => {
    if (splitModalOpen) {
      if (splitAgents) {
        setSelected(new Set(splitAgents));
      } else {
        setSelected(new Set(agents.map((a) => a.name)));
      }
    }
  }, [splitModalOpen]);

  // Close on Escape
  useEffect(() => {
    if (!splitModalOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSplitModalOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [splitModalOpen, setSplitModalOpen]);

  if (!splitModalOpen) return null;

  const toggle = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const list = agents.filter((a) => selected.has(a.name)).map((a) => a.name);
    if (list.length >= 2) {
      setSplitAgents(list);
      setActiveAgent(list[0]);
    }
    setSplitModalOpen(false);
  };

  const selectAll = () => setSelected(new Set(agents.map((a) => a.name)));
  const selectNone = () => setSelected(new Set());

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={() => setSplitModalOpen(false)}
      />

      {/* Modal */}
      <div
        className="fixed z-50 rounded-2xl shadow-2xl border overflow-hidden flex flex-col"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 400,
          maxHeight: "70vh",
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border)", padding: 4, paddingLeft: 8 }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Split View
          </h2>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
            onClick={() => setSplitModalOpen(false)}
            title="Close (Esc)"
          >
            x
          </button>
        </div>

        {/* Select all / none */}
        <div
          className="flex items-center gap-3 px-6 py-2 border-b"
          style={{ borderColor: "var(--border)", padding: 8 }}
        >
          <button
            className="text-sm hover:opacity-80"
            style={{ color: "var(--accent)", cursor: "pointer" }}
            onClick={selectAll}
          >
            Select All
          </button>
          <button
            className="text-sm hover:opacity-80"
            style={{ color: "var(--text-muted)", cursor: "pointer" }}
            onClick={selectNone}
          >
            None
          </button>
        </div>

        {/* Agent list */}
        <div className="flex-1 overflow-y-auto">
          {agents.map((agent) => {
            const checked = selected.has(agent.name);
            return (
              <div
                key={agent.name}
                className="flex items-center gap-3 px-6 py-3 cursor-pointer border-b"
                style={{
                  background: checked ? "var(--bg-tertiary)" : "transparent",
                  borderColor: "var(--border)",
                  padding: 8,
                }}
                onClick={() => toggle(agent.name)}
                onMouseEnter={(e) => {
                  if (!checked) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!checked) e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: checked ? "var(--accent)" : "var(--border)",
                    background: checked ? "var(--accent)" : "transparent",
                  }}
                >
                  {checked && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {agent.name}
                  </div>
                  {agent.description && (
                    <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                      {agent.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-6 py-3 border-t"
          style={{ borderColor: "var(--border)", padding: 8 }}
        >
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {selected.size} of {agents.length} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              className="px-4 py-1.5 rounded-lg text-[13px] font-medium hover:opacity-80"
              style={{ color: "var(--text-secondary)", cursor: "pointer" }}
              onClick={() => setSplitModalOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-5 py-1.5 rounded-lg text-[13px] font-medium hover:opacity-70 transition-opacity"
              style={{
                background: "var(--accent)",
                color: "#fff",
                opacity: selected.size < 2 ? 0.4 : undefined,
                cursor: selected.size < 2 ? "not-allowed" : "pointer",
                padding: 4,
                minWidth: 60,
              }}
              onClick={handleConfirm}
              disabled={selected.size < 2}
            >
              Split
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
