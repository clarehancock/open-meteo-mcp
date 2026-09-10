#!/usr/bin/env node
/**
 * Open-Meteo MCP Server — Streamable HTTP entry point
 *
 * This is the version to run when you want a REMOTE client to connect —
 * for example, adding this server as a "custom connector" in Claude.ai,
 * or in GitHub Codespaces where a forwarded port gives you a public URL.
 *
 * It listens on a plain HTTP port and speaks the MCP "Streamable HTTP"
 * transport at a single endpoint: POST /mcp
 *
 * It also serves a free, zero-setup demo chat page at GET / — see the
 * "chat proxy" section below for how that works without visitors needing
 * their own API key.
 *
 * Run it with:
 *   node build/http.js
 * or during development:
 *   npm run start:http
 */

import http, { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./server.js";

const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Open-Meteo weather chat</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,450;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0f1115;
    --panel: #16191f;
    --panel-2: #1c2028;
    --line: #262b35;
    --ink: #e8eaed;
    --ink-dim: #9aa1ad;
    --ink-faint: #565d6a;
    --live: #5ee6a8;
    --live-dim: #234f3d;
    --wire: #4c8bf5;
    --error: #e8746b;
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--bg); color: var(--ink); font-family: 'Inter', sans-serif; }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
  body { display: flex; flex-direction: column; max-width: 680px; margin: 0 auto; height: 100vh; padding: 20px; }
  header { flex-shrink: 0; margin-bottom: 14px; }
  .title-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
  h1 { font-family: 'Fraunces', serif; font-weight: 450; font-size: 24px; margin: 0; letter-spacing: -0.01em; }
  h1 span { color: var(--wire); font-style: italic; font-weight: 300; }
  .status { display: flex; align-items: center; gap: 6px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--live); box-shadow: 0 0 0 3px var(--live-dim); flex-shrink: 0; }
  .subtitle { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--ink-faint); line-height: 1.5; }
  .hint.error { color: var(--error); }
  main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 14px 2px 20px; }
  .empty-state { margin: auto; text-align: center; color: var(--ink-faint); font-size: 13px; max-width: 320px; line-height: 1.6; }
  .msg { display: flex; flex-direction: column; max-width: 88%; }
  .msg.user { align-self: flex-end; align-items: flex-end; }
  .msg.assistant { align-self: flex-start; align-items: flex-start; }
  .bubble { padding: 11px 15px; border-radius: var(--radius); font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; }
  .msg.user .bubble { background: var(--panel-2); border: 1px solid var(--line); border-bottom-right-radius: 3px; }
  .msg.assistant .bubble { background: transparent; padding-left: 0; padding-right: 0; }
  .tool-chip { display: inline-flex; align-items: center; gap: 7px; background: rgba(94, 230, 168, 0.08); border: 1px solid var(--live-dim); border-radius: 8px; padding: 6px 10px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--live); margin: 4px 0; }
  .tool-chip .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--live); }
  .thinking { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--ink-faint); display: flex; align-items: center; gap: 8px; }
  .thinking .pulse { width: 6px; height: 6px; border-radius: 50%; background: var(--wire); animation: blink 1.1s ease-in-out infinite; }
  @keyframes blink { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
  footer { flex-shrink: 0; display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid var(--line); }
  footer input { flex: 1; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 13px 15px; font-family: 'Inter', sans-serif; font-size: 14.5px; color: var(--ink); outline: none; }
  footer input::placeholder { color: var(--ink-faint); }
  footer input:focus { border-color: var(--wire); }
  footer input:focus-visible { outline: 2px solid var(--wire); outline-offset: 1px; }
  footer input:disabled { opacity: 0.5; }
  footer button { background: var(--wire); border: none; color: #06101f; border-radius: var(--radius); padding: 0 22px; font-family: 'Inter', sans-serif; font-weight: 600; font-size: 14px; cursor: pointer; }
  footer button:hover { background: #6da0f7; }
  footer button:disabled { opacity: 0.4; cursor: default; }
  footer button:focus-visible { outline: 2px solid var(--ink); outline-offset: 1px; }
  main::-webkit-scrollbar { width: 6px; }
  main::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
</style>
</head>
<body>

<header>
  <div class="title-row">
    <h1>Open-Meteo <span>weather chat</span></h1>
    <div class="status"><div class="dot"></div><span>Ready</span></div>
  </div>
  <div class="subtitle">Ask about the weather anywhere — this runs on a live MCP server, no setup needed.</div>
</header>

<main id="chat">
  <div class="empty-state" id="empty-state">Try: "what's the weather in Lisbon?" or "will it rain in Tokyo this weekend?"</div>
</main>

<footer>
  <input type="text" id="message-input" placeholder="Ask about the weather somewhere…" />
  <button id="send-btn" type="button">Send</button>
</footer>

<script>
  const chat = document.getElementById("chat");
  const emptyState = document.getElementById("empty-state");
  const messageInput = document.getElementById("message-input");
  const sendBtn = document.getElementById("send-btn");

  let history = [];

  function addUserBubble(text) {
    if (emptyState.parentNode) emptyState.remove();
    const wrap = document.createElement("div");
    wrap.className = "msg user";
    wrap.innerHTML = '<div class="bubble"></div>';
    wrap.querySelector(".bubble").textContent = text;
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
  }

  function addAssistantContainer() {
    const wrap = document.createElement("div");
    wrap.className = "msg assistant";
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return wrap;
  }

  function addThinking(container) {
    const el = document.createElement("div");
    el.className = "thinking";
    el.innerHTML = '<div class="pulse"></div><span>thinking…</span>';
    container.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
    return el;
  }

  function addToolChip(container, toolName) {
    const el = document.createElement("div");
    el.className = "tool-chip";
    el.innerHTML = '<div class="pulse"></div><span>ran ' + toolName + '</span>';
    container.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function addTextBubble(container, text) {
    const el = document.createElement("div");
    el.className = "bubble";
    el.textContent = text;
    container.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function extractTextAndTools(historyBefore, historyAfter) {
    const newTurns = historyAfter.slice(historyBefore.length);
    const texts = [];
    const tools = [];
    for (const turn of newTurns) {
      if (turn.role !== "model") continue;
      for (const part of turn.parts || []) {
        if (part.text) texts.push(part.text);
        if (part.functionCall) tools.push(part.functionCall.name);
      }
    }
    return { texts, tools };
  }

  async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    addUserBubble(text);
    const historyBefore = history.slice();
    history.push({ role: "user", parts: [{ text }] });

    messageInput.value = "";
    messageInput.disabled = true;
    sendBtn.disabled = true;

    const assistantContainer = addAssistantContainer();
    const thinkingEl = addThinking(assistantContainer);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history }),
      });
      const data = await res.json();
      thinkingEl.remove();

      if (!res.ok) {
        addTextBubble(assistantContainer, "Something went wrong: " + (data.error || "unknown error"));
        return;
      }

      history = data.history;
      const seenTools = new Set();
      (data.toolsUsed || []).forEach((name) => {
        if (!seenTools.has(name)) {
          addToolChip(assistantContainer, name);
          seenTools.add(name);
        }
      });

      const { texts } = extractTextAndTools(historyBefore, history);
      if (texts.length === 0) {
        addTextBubble(assistantContainer, "(No text reply.)");
      } else {
        texts.forEach((t) => addTextBubble(assistantContainer, t));
      }
    } catch (err) {
      thinkingEl.remove();
      addTextBubble(assistantContainer, "Couldn't reach the server: " + (err.message || "unknown error"));
    } finally {
      messageInput.disabled = false;
      sendBtn.disabled = false;
      messageInput.focus();
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  messageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") sendMessage(); });
  messageInput.focus();
</script>
</body>
</html>
`;
const PORT = Number(process.env.PORT) || 3000;
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// ---------------------------------------------------------------------------
// Chat proxy: lets the demo page have a normal conversation without every
// visitor needing their own Gemini API key. This server holds ONE key
// (set as a secret environment variable, never sent to the browser) and
// does the tool-calling loop itself, talking to the MCP tools in-process
// (no extra network hop to /mcp needed).
// ---------------------------------------------------------------------------

function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return { type: "STRING" };
  const typeMap: Record<string, string> = {
    string: "STRING",
    number: "NUMBER",
    integer: "INTEGER",
    boolean: "BOOLEAN",
    array: "ARRAY",
    object: "OBJECT",
  };
  const out: any = { type: typeMap[schema.type] || "STRING" };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    out.properties = {};
    for (const [key, val] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(val);
    }
  }
  if (schema.required) out.required = schema.required;
  return out;
}

async function makeInProcessMcpClient(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "chat-proxy", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

async function callGeminiApi(contents: unknown, tools: unknown) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text:
                "You are a friendly weather assistant. You have tools that wrap the Open-Meteo API. Use them to answer questions about weather, forecasts, and locations. Keep answers brief and conversational.",
            },
          ],
        },
        contents,
        tools,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    const message = (data && data.error && data.error.message) || "Gemini request failed.";
    throw new Error(message);
  }
  return data;
}

async function handleChat(history: any[]): Promise<{ history: any[]; toolsUsed: string[] }> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Server isn't configured with a GEMINI_API_KEY yet. Set that environment variable where this is hosted."
    );
  }

  const client = await makeInProcessMcpClient();
  const toolsUsed: string[] = [];

  try {
    const { tools } = await client.listTools();
    const geminiTools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description || "",
          parameters: toGeminiSchema(t.inputSchema),
        })),
      },
    ];

    for (let round = 0; round < 5; round++) {
      const data = await callGeminiApi(history, geminiTools);
      const candidate = data.candidates && data.candidates[0];
      const parts = (candidate && candidate.content && candidate.content.parts) || [];

      history.push({ role: "model", parts });

      const functionCalls = parts.filter((p: any) => p.functionCall);
      if (functionCalls.length === 0) break;

      const functionResponses = [];
      for (const fc of functionCalls) {
        toolsUsed.push(fc.functionCall.name);
        try {
          const result: any = await client.callTool({
            name: fc.functionCall.name,
            arguments: fc.functionCall.args || {},
          });
          const resultText = (result.content || [])
            .filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("\n");
          functionResponses.push({
            functionResponse: { name: fc.functionCall.name, response: { result: resultText } },
          });
        } catch (toolErr: any) {
          functionResponses.push({
            functionResponse: {
              name: fc.functionCall.name,
              response: { error: toolErr.message || "Tool call failed." },
            },
          });
        }
      }
      history.push({ role: "user", parts: functionResponses });
    }
  } finally {
    await client.close();
  }

  return { history, toolsUsed };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const httpServer = http.createServer(async (req, res) => {
  // CORS: allow browser-based MCP clients (like Claude.ai) to reach us.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, mcp-session-id, mcp-protocol-version"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/api/chat" && req.method === "POST") {
    try {
      const body: any = await readBody(req);
      const history = (body && body.history) || [];
      const result = await handleChat(history);
      sendJson(res, 200, result);
    } catch (err: any) {
      sendJson(res, 500, { error: err.message || "Chat request failed." });
    }
    return;
  }

  if (req.url !== "/mcp") {
    if (req.url === "/" || req.url === "/demo" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(DEMO_HTML);
      return;
    }
    if (req.url === "/health") {
      sendJson(res, 200, {
        status: "ok",
        message: "Open-Meteo MCP server is running. Connect an MCP client to POST /mcp.",
      });
      return;
    }
    sendJson(res, 404, { error: "Not found. The MCP endpoint is /mcp." });
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed. Use POST." },
        id: null,
      })
    );
    return;
  }

  try {
    // Stateless mode: a brand-new server + transport per request.
    // Simple and fine for a small tool server like this one.
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const body = await readBody(req);

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      sendJson(res, 500, {
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

httpServer.listen(PORT, () => {
  console.log(`Open-Meteo MCP server (Streamable HTTP) listening on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  httpServer.close(() => process.exit(0));
});