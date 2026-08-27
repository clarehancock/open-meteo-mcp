#!/usr/bin/env node
/**
 * Open-Meteo MCP Server — stdio entry point
 *
 * Run this for local tools that speak stdio, e.g.:
 *   npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list
 *   Claude Desktop's mcpServers config
 *
 * For a version reachable over the web (e.g. from Claude.ai as a custom
 * connector), use http.ts / build/http.js instead.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Open-Meteo MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting Open-Meteo MCP server:", err);
  process.exit(1);
});