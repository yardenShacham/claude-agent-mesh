import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentConfig, AgentRegistry } from "./types.js";

const MESH_DIR = path.join(process.env.HOME!, ".agent-mesh");
const AGENTS_FILE = path.join(MESH_DIR, "agents.json");

export function ensureMeshDir() {
  if (!fs.existsSync(MESH_DIR)) {
    fs.mkdirSync(MESH_DIR, { recursive: true });
  }
}

export function agentsFileExists() {
  return fs.existsSync(AGENTS_FILE);
}

export function getExampleConfigPath() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "config", "agents.example.json");
}

export function copyExampleConfig() {
  ensureMeshDir();
  fs.copyFileSync(getExampleConfigPath(), AGENTS_FILE);
}

export function loadRegistry() {
  ensureMeshDir();

  if (!fs.existsSync(AGENTS_FILE)) {
    throw new Error(`Config not found: ${AGENTS_FILE}`);
  }

  const data = fs.readFileSync(AGENTS_FILE, "utf-8");
  const registry: AgentRegistry = JSON.parse(data);
  return registry;
}

export function getAgent(name: string) {
  const registry = loadRegistry();
  const agent = registry.agents.find((a) => a.name === name);
  if (!agent) {
    throw new Error(`Agent "${name}" not found in registry. Available: ${registry.agents.map((a) => a.name).join(", ")}`);
  }
  return agent;
}

export function getAllAgents() {
  const registry = loadRegistry();
  return registry.agents;
}
