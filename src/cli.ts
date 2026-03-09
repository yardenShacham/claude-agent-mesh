#!/usr/bin/env node

import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { loadRegistry, ensureMeshDir, getAllAgents, agentsFileExists, copyExampleConfig } from "./agent-registry.js";
import { loadSessions, clearSessions } from "./session-store.js";
import { launchTui } from "./tui.js";

function registerMcpForAgent(agentDirectory: string, mcpUrl: string) {
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

function unregisterMcpForAgent(agentDirectory: string) {
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

function askYesNo(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<boolean>((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

const program = new Command();

program
  .name("agent-mesh")
  .description("Orchestrate multiple Claude Code sessions as specialized agents")
  .version("1.0.0");

program
  .command("start")
  .argument("[agent-name]", "Agent to activate first (shown initially in TUI)")
  .description("Launch the agent mesh TUI with all configured agents")
  .action(async (agentName?: string) => {
    ensureMeshDir();

    if (!agentsFileExists()) {
      console.log("Config not found: ~/.agent-mesh/agents.json");
      const copy = await askYesNo("Copy example config from agents.example.json?");
      if (copy) {
        copyExampleConfig();
        console.log("Created ~/.agent-mesh/agents.json — edit it to configure your agents, then run 'agent-mesh start' again.");
      }
      process.exit(1);
    }

    const registry = loadRegistry();

    if (registry.agents.length === 0) {
      console.log("No agents configured. Edit ~/.agent-mesh/agents.json to add agents.");
      process.exit(1);
    }

    // Validate agent directories exist
    for (const agent of registry.agents) {
      if (!fs.existsSync(agent.directory)) {
        console.error(`Error: Directory for agent "${agent.name}" does not exist: ${agent.directory}`);
        process.exit(1);
      }
    }

    // If a specific agent was requested, reorder so it's first
    if (agentName) {
      const idx = registry.agents.findIndex((a) => a.name === agentName);
      if (idx === -1) {
        console.error(`Agent "${agentName}" not found in registry.`);
        process.exit(1);
      }
      // Move requested agent to front
      const [agent] = registry.agents.splice(idx, 1);
      registry.agents.unshift(agent);
    }

    // Launch TUI — blocks until user quits (MCP registration happens inside TUI after HTTP server starts)
    await launchTui({
      agents: registry.agents,
      registerMcp: registerMcpForAgent,
      unregisterMcp: unregisterMcpForAgent,
    });

    // Cleanup after TUI exits
    for (const agent of registry.agents) {
      unregisterMcpForAgent(agent.directory);
    }
    clearSessions();

    console.log("Agent mesh stopped.");
    process.exit(0);
  });

program
  .command("status")
  .description("Show running agents and their session IDs")
  .action(() => {
    const agents = getAllAgents();
    const sessions = loadSessions();

    console.log("Agent Mesh Status\n");

    for (const agent of agents) {
      const session = sessions[agent.name];
      const interactive = session?.interactive ? " (INTERACTIVE)" : "";
      console.log(`  ${agent.name}${interactive}`);
      console.log(`    ${agent.description}`);
      console.log(`    ${agent.directory}\n`);
    }
  });

program
  .command("reload")
  .description("Reload all agents (stop + start)")
  .action(async () => {
    const agents = getAllAgents();

    // Unregister MCP and clear sessions
    for (const agent of agents) {
      unregisterMcpForAgent(agent.directory);
    }
    clearSessions();
    console.log("Cleaned up. Restarting...");

    // Re-exec start
    const { execSync } = await import("node:child_process");
    execSync("agent-mesh start", { stdio: "inherit" });
  });

program
  .command("stop")
  .description("Clean up MCP registrations and session store")
  .action(() => {
    const agents = getAllAgents();

    // Unregister MCP server from each agent
    for (const agent of agents) {
      unregisterMcpForAgent(agent.directory);
      console.log(`Unregistered MCP server for ${agent.name}`);
    }

    // Clear sessions
    clearSessions();
    console.log("Cleared session store.");

    console.log("\nAgent mesh stopped.");
  });

program.parse();
