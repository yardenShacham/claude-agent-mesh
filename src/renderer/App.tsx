import { AgentProvider } from "./contexts/AgentContext";
import { Sidebar } from "./components/Sidebar";
import { TerminalArea } from "./components/TerminalArea";
import { StatusBar } from "./components/StatusBar";
import { CommandPalette } from "./components/CommandPalette";
import { ManageAgentsModal } from "./components/ManageAgentsModal";
import { SplitAgentsModal } from "./components/SplitAgentsModal";

export function App() {
  return (
    <AgentProvider>
      <div className="flex flex-col h-screen" style={{ background: "var(--bg-primary)" }}>
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <TerminalArea />
        </div>
        <StatusBar />
        <CommandPalette />
        <ManageAgentsModal />
        <SplitAgentsModal />
      </div>
    </AgentProvider>
  );
}
