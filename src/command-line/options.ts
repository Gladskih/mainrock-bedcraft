import {
  DEFAULT_BEDROCK_PORT,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_JOIN_TIMEOUT_MS,
  DEFAULT_NETHERNET_PORT,
  DEFAULT_RAKNET_BACKEND,
  RAKNET_BACKEND_NODE,
  RAKNET_BACKEND_JS,
  RAKNET_BACKEND_NATIVE,
  type RaknetBackend
} from "../constants.js";
import type { JoinCommandOptions } from "./runJoinCommand.js";
import type { ScanCommandOptions } from "./runScanCommand.js";

export type ScanInput = {
  timeout: string | undefined;
  name: string | undefined;
  transport: string | undefined;
};

export type JoinInput = {
  host: string | undefined;
  port: string | undefined;
  name: string | undefined;
  account: string | undefined;
  cacheDir: string | undefined;
  keyFile: string | undefined;
  minecraftVersion: string | undefined;
  joinTimeout: string | undefined;
  forceRefresh: boolean | undefined;
  skipPing: boolean | undefined;
  raknetBackend: string | undefined;
  discoveryTimeout: string | undefined;
  transport: string | undefined;
};

export type EnvironmentVariables = Record<string, string | undefined>;

const parseBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number, label: string): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
};

const normalizeRaknetBackend = (value: string | undefined): RaknetBackend => {
  if (!value) return DEFAULT_RAKNET_BACKEND;
  const normalized = value.toLowerCase();
  if (normalized === "native" || normalized === RAKNET_BACKEND_NATIVE) return RAKNET_BACKEND_NATIVE;
  if (normalized === "node" || normalized === RAKNET_BACKEND_NODE) return RAKNET_BACKEND_NODE;
  if (normalized === "js" || normalized === RAKNET_BACKEND_JS) return RAKNET_BACKEND_JS;
  throw new Error(`Invalid RakNet backend: ${value}`);
};

const normalizeTransport = (value: string | undefined): "raknet" | "nethernet" | null => {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === "raknet") return "raknet";
  if (normalized === "nethernet") return "nethernet";
  throw new Error(`Invalid transport: ${value}`);
};

export const resolveScanOptions = (input: ScanInput, env: EnvironmentVariables): ScanCommandOptions => ({
  timeoutMs: parseNumber(input.timeout ?? env["BEDCRAFT_DISCOVERY_TIMEOUT_MS"], DEFAULT_DISCOVERY_TIMEOUT_MS, "discovery timeout"),
  serverNameFilter: input.name ?? env["BEDCRAFT_SERVER_NAME"],
  transport: normalizeTransport(input.transport ?? env["BEDCRAFT_TRANSPORT"]) ?? "nethernet"
});

export const resolveJoinOptions = (input: JoinInput, env: EnvironmentVariables): JoinCommandOptions => {
  const accountName = input.account ?? env["BEDCRAFT_ACCOUNT"];
  if (!accountName) throw new Error("Account name is required for authentication");
  const requestedTransport = normalizeTransport(input.transport ?? env["BEDCRAFT_TRANSPORT"]);
  const defaultPort = requestedTransport === "raknet" ? DEFAULT_BEDROCK_PORT : DEFAULT_NETHERNET_PORT;
  const port = parseNumber(input.port ?? env["BEDCRAFT_PORT"], defaultPort, "port");
  const transport = requestedTransport ?? (port === DEFAULT_NETHERNET_PORT ? "nethernet" : "raknet");
  return {
    accountName,
    host: input.host ?? env["BEDCRAFT_HOST"],
    port,
    serverName: input.name ?? env["BEDCRAFT_SERVER_NAME"],
    discoveryTimeoutMs: parseNumber(input.discoveryTimeout ?? env["BEDCRAFT_DISCOVERY_TIMEOUT_MS"], DEFAULT_DISCOVERY_TIMEOUT_MS, "discovery timeout"),
    cacheDirectory: input.cacheDir ?? env["BEDCRAFT_CACHE_DIR"],
    keyFilePath: input.keyFile ?? env["BEDCRAFT_CACHE_KEY_FILE"],
    environmentKey: env["BEDCRAFT_CACHE_KEY"],
    minecraftVersion: input.minecraftVersion ?? env["BEDCRAFT_MINECRAFT_VERSION"] ?? env["BEDCRAFT_VERSION"],
    joinTimeoutMs: parseNumber(input.joinTimeout ?? env["BEDCRAFT_JOIN_TIMEOUT_MS"], DEFAULT_JOIN_TIMEOUT_MS, "join timeout"),
    disconnectAfterFirstChunk: true,
    forceRefresh: input.forceRefresh ?? parseBoolean(env["BEDCRAFT_FORCE_REFRESH"]),
    skipPing: input.skipPing ?? parseBoolean(env["BEDCRAFT_SKIP_PING"]),
    raknetBackend: normalizeRaknetBackend(input.raknetBackend ?? env["BEDCRAFT_RAKNET_BACKEND"]),
    transport
  };
};
