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
 * Run it with:
 *   node build/http.js
 * or during development:
 *   npm run start:http
 */

import http, { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT) || 3000;

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

  if (req.url !== "/mcp") {
    if (req.url === "/" || req.url === "/health") {
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