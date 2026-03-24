import { useState, useEffect } from "react";
import { useAgents } from "../contexts/AgentContext";

interface EditableAgent {
  name: string;
  directory: string;
  description: string;
}

export function ManageAgentsModal() {
  const { agents, manageAgentsOpen, setManageAgentsOpen, refreshAgents } = useAgents();
  const [editedAgents, setEditedAgents] = useState<EditableAgent[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (manageAgentsOpen) {
      setEditedAgents(
        agents.map((a) => ({ name: a.name, directory: a.directory, description: a.description })),
      );
      setSelectedIndices(new Set());
      setError(null);
      setSaving(false);
    }
  }, [manageAgentsOpen]);

  // Close on Escape
  useEffect(() => {
    if (!manageAgentsOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setManageAgentsOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [manageAgentsOpen, setManageAgentsOpen]);

  if (!manageAgentsOpen) return null;

  const updateAgent = (index: number, field: keyof EditableAgent, value: string) => {
    setEditedAgents((prev) => prev.map((a, i) => (i === index ? { ...a, [field]: value } : a)));
    setError(null);
  };

  const addAgent = () => {
    setEditedAgents((prev) => [...prev, { name: "", directory: "", description: "" }]);
    setSelectedIndices(new Set([editedAgents.length]));
  };

  const removeSelected = () => {
    if (selectedIndices.size === 0) return;
    setEditedAgents((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
    setSelectedIndices(new Set());
  };

  const handleRowClick = (index: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedIndices((prev) => {
        const next = new Set(prev);
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
        return next;
      });
    } else {
      setSelectedIndices(new Set([index]));
    }
  };

  const browseDirectory = async (index: number) => {
    const dir = await window.electronAPI.browseDirectory();
    if (dir) {
      updateAgent(index, "directory", dir);
    }
  };

  const handleSave = async () => {
    for (const agent of editedAgents) {
      if (!agent.name.trim()) {
        setError("Each agent must have a name");
        return;
      }
      if (!agent.directory.trim()) {
        setError(`Agent "${agent.name}" must have a directory`);
        return;
      }
    }

    const names = new Set<string>();
    for (const agent of editedAgents) {
      if (names.has(agent.name)) {
        setError(`Duplicate agent name: "${agent.name}"`);
        return;
      }
      names.add(agent.name);
    }

    setSaving(true);
    setError(null);

    try {
      await window.electronAPI.saveAgents(editedAgents);
      await refreshAgents();
      setManageAgentsOpen(false);
      setTimeout(() => window.electronAPI.triggerRefreshTerminals(), 300);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Determine what to show in the detail panel
  const selectedArray = [...selectedIndices];
  const singleSelected = selectedIndices.size === 1 ? editedAgents[selectedArray[0]] : null;
  const singleSelectedIndex = selectedIndices.size === 1 ? selectedArray[0] : -1;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={() => setManageAgentsOpen(false)}
      />

      {/* Modal */}
      <div
        className="fixed z-50 rounded-2xl shadow-2xl border overflow-hidden flex flex-col"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 860,
          maxHeight: "85vh",
          minHeight: 500,
          background: "var(--bg-secondary)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)", padding: 4, marginLeft: 8 }}
          >
            Manage Agents
          </h2>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:opacity-80"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
            onClick={() => setManageAgentsOpen(false)}
            title="Close (Esc)"
          >
            x
          </button>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-1 px-4 py-2 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold hover:opacity-80"
            style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}
            onClick={addAgent}
            title="Add agent"
          >
            +
          </button>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold hover:opacity-80"
            style={{
              background: "var(--bg-tertiary)",
              color: selectedIndices.size > 0 ? "var(--error)" : "var(--text-muted)",
              opacity: selectedIndices.size > 0 ? 1 : 0.4,
              cursor: selectedIndices.size > 0 ? "pointer" : "not-allowed",
            }}
            onClick={removeSelected}
            disabled={selectedIndices.size === 0}
            title="Delete selected agents"
          >
            −
          </button>
        </div>

        {/* Main content: sidebar + detail */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left sidebar */}
          <div
            className="overflow-y-auto border-r"
            style={{ width: 240, flexShrink: 0, borderColor: "var(--border)" }}
          >
            {editedAgents.map((agent, i) => {
              const isSelected = selectedIndices.has(i);
              return (
                <div
                  key={i}
                  className="px-4 py-3 cursor-pointer"
                  style={{
                    background: isSelected ? "var(--bg-tertiary)" : "transparent",
                    borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                    padding: 8,
                  }}
                  onClick={(e) => handleRowClick(i, e)}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)", marginBottom: 4 }}
                  >
                    {agent.name || "Untitled"}
                  </div>
                  <div className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {agent.description || "No description"}
                  </div>
                </div>
              );
            })}
            {editedAgents.length === 0 && (
              <div className="px-4 py-6 text-xs text-center" style={{ color: "var(--text-muted)" }}>
                No agents yet. Click + to add one.
              </div>
            )}
          </div>

          {/* Right detail panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {singleSelected ? (
              <div className="flex flex-col gap-5" style={{ padding: 8 }}>
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="text-xs font-medium"
                    style={{ color: "var(--text-muted)", paddingLeft: 2 }}
                  >
                    Agent Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. my-agent"
                    value={singleSelected.name}
                    onChange={(e) => updateAgent(singleSelectedIndex, "name", e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none border focus:border-(--accent)"
                    style={{
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      borderColor: "var(--border)",
                      height: 24,
                      paddingLeft: 8,
                      paddingRight: 8,
                    }}
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Description
                  </label>
                  <textarea
                    placeholder="What does this agent do?"
                    value={singleSelected.description}
                    onChange={(e) =>
                      updateAgent(singleSelectedIndex, "description", e.target.value)
                    }
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none border focus:border-(--accent) resize-none"
                    style={{
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      borderColor: "var(--border)",
                      paddingLeft: 8,
                      paddingRight: 8,
                      height: 120,
                    }}
                  />
                </div>

                {/* Base Directory */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Base Directory
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="/path/to/project"
                      value={singleSelected.directory}
                      onChange={(e) =>
                        updateAgent(singleSelectedIndex, "directory", e.target.value)
                      }
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none border focus:border-(--accent)"
                      style={{
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        borderColor: "var(--border)",
                        height: 24,
                        paddingLeft: 8,
                        paddingRight: 8,
                      }}
                    />
                    <button
                      className="px-3 py-2 rounded-lg text-xs font-medium shrink-0 hover:opacity-80"
                      style={{
                        background: "var(--bg-hover)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border)",
                        padding: 4,
                      }}
                      onClick={() => browseDirectory(singleSelectedIndex)}
                      title="Browse for directory"
                    >
                      Browse
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center justify-center h-full text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {selectedIndices.size > 1
                  ? `${selectedIndices.size} agents selected`
                  : editedAgents.length > 0
                    ? "Select an agent"
                    : "Add an agent to get started"}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-8 border-t"
          style={{ borderColor: "var(--border)", height: 40 }}
        >
          <div className="text-sm" style={{ color: "var(--error)" }}>
            {error || ""}
          </div>
          <div className="flex items-center gap-4">
            <button
              className="px-4 py-1 rounded-lg text-[13px] font-medium hover:opacity-80"
              style={{ color: "var(--text-secondary)", cursor: "pointer" }}
              onClick={() => setManageAgentsOpen(false)}
            >
              Cancel
            </button>
            <button
              className="px-5 py-1.5 rounded-lg text-[13px] font-medium  hover:opacity-70 transition-opacity"
              style={{
                background: "var(--accent)",
                color: "#fff",
                opacity: saving ? 0.6 : undefined,
                marginRight: 12,
                padding: 4,
                minWidth: 60,
                cursor: "pointer",
              }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
