/**
 * Open-Meteo MCP Server — shared tool definitions
 *
 * Exposes the free, keyless Open-Meteo weather & geocoding APIs as MCP tools:
 *   - geocode_location    : turn a place name into coordinates
 *   - get_current_weather : right-now conditions for a lat/lon
 *   - get_weather_forecast: hourly/daily forecast for a lat/lon
 *
 * This file only builds and returns a configured McpServer. It does NOT
 * start a transport — see index.ts (stdio, for local tools like the
 * Inspector) and http.ts (Streamable HTTP, for connecting from Claude.ai
 * or any other remote MCP client) for the two ways to actually run it.
 *
 * Docs: https://open-meteo.com/en/docs
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const GEOCODING_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";

const USER_AGENT = "open-meteo-mcp/1.0 (+https://open-meteo.com)";

/** Small helper: fetch JSON and surface API errors as thrown Errors with useful text. */
async function fetchJson<T>(url: URL): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const reason =
      body && typeof body === "object" && "reason" in body
        ? (body as { reason?: string }).reason
        : res.statusText;
    throw new Error(`Open-Meteo request failed (${res.status}): ${reason}`);
  }

  return body as T;
}

// ---------------------------------------------------------------------------
// Types (partial — only the fields we actually use)
// ---------------------------------------------------------------------------

interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  country?: string;
  country_code?: string;
  admin1?: string;
  admin2?: string;
  timezone?: string;
  population?: number;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

interface CurrentWeatherResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: Record<string, number | string>;
  current_units?: Record<string, string>;
}

interface ForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly?: Record<string, (number | string | null)[]>;
  hourly_units?: Record<string, string>;
  daily?: Record<string, (number | string | null)[]>;
  daily_units?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function createServer(): McpServer {
  const server = new McpServer({
    name: "open-meteo-mcp",
    version: "1.0.0",
  });

// --- Tool: geocode_location -------------------------------------------------

server.tool(
  "geocode_location",
  "Look up geographic coordinates (latitude/longitude) for a place name, e.g. " +
    "'London', 'Paris, TX', or 'Tokyo'. Use this before calling the weather tools " +
    "if you only have a place name rather than coordinates.",
  {
    name: z.string().describe("Place name to search for, e.g. 'San Francisco'"),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum number of matching locations to return (default 5)"),
    language: z
      .string()
      .default("en")
      .describe("Language for place names, as an ISO 639-1 code (default 'en')"),
  },
  async ({ name, count, language }) => {
    const url = new URL(GEOCODING_BASE);
    url.searchParams.set("name", name);
    url.searchParams.set("count", String(count));
    url.searchParams.set("language", language);
    url.searchParams.set("format", "json");

    const data = await fetchJson<GeocodingResponse>(url);

    if (!data.results || data.results.length === 0) {
      return {
        content: [
          { type: "text", text: `No locations found matching "${name}".` },
        ],
      };
    }

    const lines = data.results.map((r) => {
      const region = [r.admin1, r.country].filter(Boolean).join(", ");
      return (
        `${r.name}${region ? ` (${region})` : ""} — ` +
        `lat: ${r.latitude}, lon: ${r.longitude}` +
        (r.timezone ? `, timezone: ${r.timezone}` : "") +
        (r.population ? `, population: ${r.population.toLocaleString()}` : "")
      );
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${data.results.length} location(s) for "${name}":\n\n${lines.join(
            "\n"
          )}`,
        },
      ],
    };
  }
);

// --- Tool: get_current_weather ----------------------------------------------

const CURRENT_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "is_day",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
];

server.tool(
  "get_current_weather",
  "Get the current weather conditions (temperature, wind, precipitation, etc.) " +
    "for a specific latitude/longitude. Use geocode_location first if you only " +
    "have a place name.",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
    longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees"),
    temperature_unit: z
      .enum(["celsius", "fahrenheit"])
      .default("celsius")
      .describe("Unit for temperature values"),
    wind_speed_unit: z
      .enum(["kmh", "ms", "mph", "kn"])
      .default("kmh")
      .describe("Unit for wind speed values"),
    timezone: z
      .string()
      .default("auto")
      .describe(
        "Timezone for returned timestamps, e.g. 'America/New_York' or 'auto' to infer from coordinates"
      ),
  },
  async ({ latitude, longitude, temperature_unit, wind_speed_unit, timezone }) => {
    const url = new URL(FORECAST_BASE);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("current", CURRENT_VARS.join(","));
    url.searchParams.set("temperature_unit", temperature_unit);
    url.searchParams.set("wind_speed_unit", wind_speed_unit);
    url.searchParams.set("timezone", timezone);

    const data = await fetchJson<CurrentWeatherResponse>(url);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              latitude: data.latitude,
              longitude: data.longitude,
              timezone: data.timezone,
              current: data.current,
              units: data.current_units,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

// --- Tool: get_weather_forecast ---------------------------------------------

const DEFAULT_DAILY_VARS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
];

const DEFAULT_HOURLY_VARS = [
  "temperature_2m",
  "precipitation_probability",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
];

server.tool(
  "get_weather_forecast",
  "Get a multi-day hourly and/or daily weather forecast (up to 16 days) for a " +
    "specific latitude/longitude. Use geocode_location first if you only have a " +
    "place name. Defaults to a useful set of daily summary variables; pass " +
    "include_hourly=true for hour-by-hour detail as well.",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees"),
    longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees"),
    forecast_days: z
      .number()
      .int()
      .min(1)
      .max(16)
      .default(7)
      .describe("Number of forecast days to return (1-16, default 7)"),
    include_hourly: z
      .boolean()
      .default(false)
      .describe("Whether to also include hourly detail (default: daily summary only)"),
    temperature_unit: z
      .enum(["celsius", "fahrenheit"])
      .default("celsius")
      .describe("Unit for temperature values"),
    wind_speed_unit: z
      .enum(["kmh", "ms", "mph", "kn"])
      .default("kmh")
      .describe("Unit for wind speed values"),
    timezone: z
      .string()
      .default("auto")
      .describe(
        "Timezone for returned timestamps, e.g. 'America/New_York' or 'auto' to infer from coordinates"
      ),
  },
  async ({
    latitude,
    longitude,
    forecast_days,
    include_hourly,
    temperature_unit,
    wind_speed_unit,
    timezone,
  }) => {
    const url = new URL(FORECAST_BASE);
    url.searchParams.set("latitude", String(latitude));
    url.searchParams.set("longitude", String(longitude));
    url.searchParams.set("forecast_days", String(forecast_days));
    url.searchParams.set("daily", DEFAULT_DAILY_VARS.join(","));
    if (include_hourly) {
      url.searchParams.set("hourly", DEFAULT_HOURLY_VARS.join(","));
    }
    url.searchParams.set("temperature_unit", temperature_unit);
    url.searchParams.set("wind_speed_unit", wind_speed_unit);
    url.searchParams.set("timezone", timezone);

    const data = await fetchJson<ForecastResponse>(url);

    const result: Record<string, unknown> = {
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      daily: data.daily,
      daily_units: data.daily_units,
    };
    if (include_hourly) {
      result.hourly = data.hourly;
      result.hourly_units = data.hourly_units;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

  return server;
}