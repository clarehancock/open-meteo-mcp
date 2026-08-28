# Open-Meteo MCP Server

A small [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server
that gives an AI assistant like Claude the ability to look up real weather
data — current conditions and forecasts — by wrapping the free
[Open-Meteo](https://open-meteo.com) API. No API key required.

Built as a learning project to understand how MCP servers work end to end:
defining tools, running them locally, and connecting them to a real AI client.

## What it does

Once connected to an MCP-compatible client (like Claude), it exposes three tools:

| Tool | What it does |
|---|---|
| `geocode_location` | Turns a place name ("London") into coordinates |
| `get_current_weather` | Current temperature, wind, precipitation, etc. for a coordinate |
| `get_weather_forecast` | Up to a 16-day forecast (daily and/or hourly) for a coordinate |

So a person can ask an assistant "what's the weather in Lisbon tomorrow?" and
the assistant will call these tools itself to find out and answer — it isn't
pre-programmed with weather data, it fetches it live.

## How it's built

- **`src/server.ts`** — defines the three tools and how each one calls the
  Open-Meteo API. This is the actual "brains" of the server.
- **`src/index.ts`** — runs the server over **stdio** (standard input/output).
  This is the transport used by local dev tools like the
  [MCP Inspector](https://github.com/modelcontextprotocol/inspector) and by
  desktop apps that launch the server as a subprocess.
- **`src/http.ts`** — runs the *same* server over **Streamable HTTP**, so it
  can be reached over the network — e.g. hosted somewhere, or reached from a
  browser-based client. This is what makes it possible to demo without
  installing anything locally.

Both entry points share the same tool definitions in `server.ts`, so there's
only one place where the actual logic lives.

## Running it

```bash
npm install
npm run build
```

**Local/stdio mode** (for tools that spawn the server as a subprocess):

```bash
npm start
```

**HTTP mode** (for connecting a remote client, e.g. over a forwarded
Codespaces port or a hosting provider):

```bash
node build/http.js
```

This starts a plain HTTP server on port 3000 (configurable via `PORT`) with
a single MCP endpoint at `POST /mcp`, plus a `GET /health` check.

## Testing it without any client

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector)'s
CLI mode is the fastest way to poke at it directly from a terminal, no
browser needed:

```bash
# See what tools are available
npx @modelcontextprotocol/inspector --cli node build/index.js --method tools/list

# Actually call one
npx @modelcontextprotocol/inspector --cli node build/index.js \
  --method tools/call --tool-name geocode_location --tool-arg name=London
```

## Connecting it to an AI assistant

- **Claude Desktop / Claude Code**: point at `build/index.js` as a stdio MCP
  server in the client's config.
- **Claude.ai custom connectors**: point at the `/mcp` URL of a running HTTP
  instance (requires a plan that allows custom connectors).
- **Anthropic API directly**: pass the `/mcp` URL in the `mcp_servers`
  parameter of a `/v1/messages` request — this lets any custom app or page
  use the tools without needing a pre-built MCP client.

## Notes for extending it

Open-Meteo has many more variables and endpoints than this project uses
(air quality, marine forecasts, historical/archive data, ensembles). To add
more, follow the pattern of an existing tool in `src/server.ts` — register
a new `server.tool(...)` block with its own input schema and Open-Meteo
request.

Data © [Open-Meteo.com](https://open-meteo.com), CC BY 4.0.
