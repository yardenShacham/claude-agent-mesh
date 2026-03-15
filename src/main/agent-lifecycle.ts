import fs from "node:fs";
import path from "node:path";

export function registerMcpForAgent(agentDirectory: string, mcpUrl: string) {
  const mcpFile = path.join(agentDirectory, ".mcp.json");

  let settings: Record<string, unknown> = {};
  if (fs.existsSync(mcpFile)) {
    settings = JSON.parse(fs.readFileSync(mcpFile, "utf-8"));
  }

  const mcpServers = (settings.mcpServers ?? {}) as Record<string, unknown>;
  mcpServers["agent-mesh"] = {
    type: "http",
    url: mcpUrl,
  };
  settings.mcpServers = mcpServers;

  fs.writeFileSync(mcpFile, JSON.stringify(settings, null, 2));
}

export function unregisterMcpForAgent(agentDirectory: string) {
  const mcpFile = path.join(agentDirectory, ".mcp.json");

  if (!fs.existsSync(mcpFile)) return;

  const settings = JSON.parse(fs.readFileSync(mcpFile, "utf-8"));
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  if (mcpServers) {
    delete mcpServers["agent-mesh"];
    if (Object.keys(mcpServers).length === 0) {
      delete settings.mcpServers;
    }
  }

  if (Object.keys(settings).length === 0) {
    fs.unlinkSync(mcpFile);
  } else {
    fs.writeFileSync(mcpFile, JSON.stringify(settings, null, 2));
  }
}
