import { Client as BedrockProtocolClient } from "bedrock-protocol";
import type { ClientOptions } from "bedrock-protocol";
import type { Logger } from "pino";
import { NethernetRakClient, type NethernetRakClientOptions } from "../nethernet/nethernetRakClient.js";
import type { AuthenticatedClientOptions } from "./authenticatedClientOptions.js";
import type { ClientLike } from "./clientTypes.js";

export const disableBedrockEncryptionForNethernet = (client: unknown, logger: Logger): void => {
  if (!client || typeof client !== "object") return;
  const mutable = client as {
    startEncryption?: (iv: Buffer) => void;
  };
  if (typeof mutable.startEncryption !== "function") return;
  let logged = false;
  mutable.startEncryption = () => {
    if (logged) return;
    logged = true;
    logger.info({ event: "encryption", mode: "disabled_for_nethernet" }, "Skipping bedrock-protocol packet encryption for NetherNet");
  };
};

type BedrockProtocolClientLike = ClientLike & {
  init: () => void;
  connect: () => void;
  write: (name: string, params: object) => void;
  queue: (name: string, params: object) => void;
  connection?: { close?: () => void } | null;
  startEncryption?: (iv: Buffer) => void;
};

export type CreateNethernetClientDependencies = {
  createBedrockClient: (options: ClientOptions) => BedrockProtocolClientLike;
  createNethernetRakClient: (options: NethernetRakClientOptions) => NethernetRakClient;
};

const defaultCreateNethernetClientDependencies: CreateNethernetClientDependencies = {
  createBedrockClient: (options) => new BedrockProtocolClient(options) as unknown as BedrockProtocolClientLike,
  createNethernetRakClient: (options) => new NethernetRakClient(options)
};

export const createNethernetClient = (
  options: AuthenticatedClientOptions,
  logger: Logger,
  serverId: bigint,
  clientId: bigint,
  dependencies: CreateNethernetClientDependencies = defaultCreateNethernetClientDependencies
): ClientLike => {
  const client = dependencies.createBedrockClient({ ...options, delayedInit: true } as unknown as ClientOptions);
  client.init();
  client.connection?.close?.();
  disableBedrockEncryptionForNethernet(client, logger);
  client.connection = dependencies.createNethernetRakClient({
    host: options.host,
    port: options.port,
    clientId,
    serverId,
    logger
  });
  client.queue = (name, params) => client.write(name, params);
  client.connect();
  return client;
};

