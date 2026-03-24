import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { McpSharedContext } from "./types.js";

const REQUEST_TIMEOUT_MS = 120_000;

interface McpSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

function createMcpServer(context: McpSharedContext) {
  const server = new McpServer({
    name: "agent-mesh",
    version: "1.0.0",
  });

  server.registerTool(
    "list_agents",
    {
      description: "List all available agents with their names and descriptions",
    },
    async () => {
      const agents = context.getAgents();
      const list = agents.map((a) => `- ${a.name}: ${a.description} (${a.directory})`).join("\n");
      return {
        content: [{ type: "text" as const, text: list }],
      };
    },
  );

  server.registerTool(
    "ask_agent",
    {
      description:
        "Ask another agent a question. Injects the question into the agent's live interactive session " +
        "and waits for a response.",
      inputSchema: {
        agent: z.string().describe("The name of the agent to ask"),
        question: z.string().describe("The question to ask the agent"),
        caller: z
          .string()
          .optional()
          .describe(
            "Your agent name (the agent making this request). Fill this with your own name so the mesh can track who is asking.",
          ),
      },
    },
    async ({ agent: agentName, question, caller }) => {
      const terminalRef = context.getTerminalRef(agentName);
      if (!terminalRef) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent "${agentName}" not found. Use list_agents to see available agents.`,
            },
          ],
          isError: true,
        };
      }

      if (terminalRef.busyState !== "idle") {
        return {
          content: [
            {
              type: "text" as const,
              text: `Agent "${agentName}" is currently busy processing another request. Try again later.`,
            },
          ],
          isError: true,
        };
      }

      const requestId = randomUUID();
      const callerAgent = caller ?? "another agent";

      // Set caller agent's state to "asking" if we can find it
      const callerRef = caller ? context.getTerminalRef(caller) : undefined;
      if (callerRef) {
        callerRef.busyState = "asking";
      }

      const responsePromise = new Promise<string>((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
          context.pendingRequests.delete(requestId);
          terminalRef.busyState = "idle";
          terminalRef.pendingRequestId = null;
          if (callerRef) callerRef.busyState = "idle";
          reject(
            new Error(
              `Request to agent "${agentName}" timed out after ${REQUEST_TIMEOUT_MS / 1000}s`,
            ),
          );
        }, REQUEST_TIMEOUT_MS);

        context.pendingRequests.set(requestId, {
          resolve,
          reject,
          timeoutHandle,
          callerAgent,
          targetAgent: agentName,
        });
      });

      terminalRef.busyState = "answering";
      terminalRef.pendingRequestId = requestId;

      // Inject the question into the agent's terminal
      const sanitizedQuestion = question.replace(/\n/g, " ");
      const prompt = `[MESH REQUEST id=${requestId} from=${callerAgent}] ${sanitizedQuestion} --- You MUST respond by calling the \`answer_agent\` tool with request_id="${requestId}" and your response text. Respond directly without asking clarifying questions.`;

      // Inject text, then Escape (dismiss autocomplete), then Enter (submit)
      terminalRef.injectInput(prompt);
      setTimeout(() => terminalRef.injectInput("\x1b"), 100); // Escape
      setTimeout(() => terminalRef.injectInput("\r"), 200); // Enter

      try {
        const response = await responsePromise;
        return {
          content: [{ type: "text" as const, text: response }],
        };
      } catch (e) {
        return {
          content: [{ type: "text" as const, text: (e as Error).message }],
          isError: true,
        };
      } finally {
        terminalRef.busyState = "idle";
        terminalRef.pendingRequestId = null;
        if (callerRef) callerRef.busyState = "idle";
        context.pendingRequests.delete(requestId);
      }
    },
  );

  server.registerTool(
    "answer_agent",
    {
      description:
        "Respond to an inter-agent request. Call this tool when you receive a [MESH REQUEST] " +
        "with a request_id. Provide the request_id and your response text.",
      inputSchema: {
        request_id: z.string().describe("The request_id from the [MESH REQUEST] header"),
        response: z.string().describe("Your response to the requesting agent"),
      },
    },
    async ({ request_id, response }) => {
      const pending = context.pendingRequests.get(request_id);
      if (!pending) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No pending request found for id "${request_id}". It may have expired or already been answered.`,
            },
          ],
          isError: true,
        };
      }

      clearTimeout(pending.timeoutHandle);
      pending.resolve(response);
      context.pendingRequests.delete(request_id);

      return {
        content: [{ type: "text" as const, text: `Response delivered to ${pending.callerAgent}.` }],
      };
    },
  );

  return server;
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export async function startMcpHttpServer(context: McpSharedContext) {
  const sessions = new Map<string, McpSession>();

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (req.method === "POST") {
      try {
        const body = await readBody(req);
        const jsonBody = JSON.parse(body);
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (sessionId && sessions.has(sessionId)) {
          const session = sessions.get(sessionId)!;
          await session.transport.handleRequest(req, res, jsonBody);
          return;
        }

        if (!sessionId && isInitializeRequest(jsonBody)) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          const server = createMcpServer(context);
          await server.connect(transport);

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) sessions.delete(sid);
          };

          await transport.handleRequest(req, res, jsonBody);

          const sid = transport.sessionId;
          if (sid) {
            sessions.set(sid, { transport, server });
          }
          return;
        }

        res.writeHead(400);
        res.end(
          JSON.stringify({ error: "Bad request: missing session ID or not an initialize request" }),
        );
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
      return;
    }

    if (req.method === "GET") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing or invalid session ID" }));
      return;
    }

    if (req.method === "DELETE") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        sessions.delete(sessionId);
        return;
      }
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing or invalid session ID" }));
      return;
    }

    res.writeHead(405);
    res.end("Method not allowed");
  });

  return new Promise<{ port: number; stop: () => Promise<void>; getSessionCount: () => number; clearSessions: () => Promise<void> }>(
    (resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        const addr = httpServer.address();
        const port = typeof addr === "object" && addr ? addr.port : 0;

        const stop = async () => {
          for (const [, session] of sessions) {
            try {
              await session.transport.close();
            } catch {
              // ignore
            }
          }
          sessions.clear();

          return new Promise<void>((resolveClose) => {
            httpServer.close(() => resolveClose());
          });
        };

        const clearSessions = async () => {
          for (const [, session] of sessions) {
            try { await session.transport.close(); } catch { /* ignore */ }
          }
          sessions.clear();
        };

        resolve({ port, stop, clearSessions, getSessionCount: () => sessions.size });
      });
    },
  );
}
