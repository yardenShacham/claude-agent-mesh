import fs from "node:fs";
import path from "node:path";
import type { SessionStore } from "./types.js";
import { ensureMeshDir } from "./agent-registry.js";

const MESH_DIR = path.join(process.env.HOME!, ".agent-mesh");
const SESSIONS_FILE = path.join(MESH_DIR, "sessions.json");

export function loadSessions() {
  ensureMeshDir();
  if (!fs.existsSync(SESSIONS_FILE)) {
    return {} as SessionStore;
  }
  const data = fs.readFileSync(SESSIONS_FILE, "utf-8");
  return JSON.parse(data) as SessionStore;
}

export function saveSessions(store: SessionStore) {
  ensureMeshDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(store, null, 2));
}

export function setInteractive(agentName: string, value: boolean) {
  const store = loadSessions();
  const existing = store[agentName] ?? { interactive: false };
  existing.interactive = value;
  store[agentName] = existing;
  saveSessions(store);
}

export function clearSessions() {
  if (fs.existsSync(SESSIONS_FILE)) {
    fs.unlinkSync(SESSIONS_FILE);
  }
}
