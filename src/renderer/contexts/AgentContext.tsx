import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { AgentInfo, McpStatus } from "../../preload/api";

interface AgentContextValue {
  agents: AgentInfo[];
  activeAgent: string | null;
  setActiveAgent: (name: string) => void;
  splitAgents: string[] | null;
  setSplitAgents: (agents: string[] | null) => void;
  sidebarVisible: boolean;
  setSidebarVisible: (v: boolean) => void;
  mcpStatus: McpStatus | null;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgents() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgents must be used within AgentProvider");
  return ctx;
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [splitAgents, setSplitAgents] = useState<string[] | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mcpStatus, setMcpStatus] = useState<McpStatus | null>(null);

  // Load initial agent list
  useEffect(() => {
    window.electronAPI?.listAgents().then((list) => {
      setAgents(list);
      if (list.length > 0 && !activeAgent) {
        setActiveAgent(list[0].name);
      }
    });
  }, []);

  // Subscribe to state updates
  useEffect(() => {
    const unsub = window.electronAPI?.onAgentStateUpdate((data) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.name === data.name
            ? {
                ...a,
                busyState: data.busyState as AgentInfo["busyState"],
                pendingRequestId: data.pendingRequestId,
              }
            : a,
        ),
      );
    });
    return unsub;
  }, []);

  // Subscribe to MCP status updates
  useEffect(() => {
    const unsub = window.electronAPI?.onMcpStatusUpdate(setMcpStatus);
    // Also get initial status
    window.electronAPI?.getMcpStatus().then(setMcpStatus);
    return unsub;
  }, []);

  // Menu event handlers
  useEffect(() => {
    const unsubs = [
      window.electronAPI?.onMenuSwitchAgent((name) => {
        setSplitAgents(null);
        setActiveAgent(name);
      }),
      window.electronAPI?.onMenuToggleSidebar(() => setSidebarVisible((v) => !v)),
      window.electronAPI?.onMenuSplitAll(() => {
        setAgents((prev) => {
          setSplitAgents(prev.map((a) => a.name));
          return prev;
        });
      }),
      window.electronAPI?.onMenuFocusActive(() => setSplitAgents(null)),
      window.electronAPI?.onMenuReloadAll(() => window.electronAPI.reloadAll()),
    ];
    return () => unsubs.forEach((fn) => fn?.());
  }, []);

  const handleSetActiveAgent = useCallback(
    (name: string) => {
      if (splitAgents && !splitAgents.includes(name)) {
        setSplitAgents(null);
      }
      setActiveAgent(name);
    },
    [splitAgents],
  );

  return (
    <AgentContext.Provider
      value={{
        agents,
        activeAgent,
        setActiveAgent: handleSetActiveAgent,
        splitAgents,
        setSplitAgents,
        sidebarVisible,
        setSidebarVisible,
        mcpStatus,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
}
