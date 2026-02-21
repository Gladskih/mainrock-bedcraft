import { createClient } from "bedrock-protocol";
import type { ClientLike } from "./clientTypes.js";
import type { JoinOptions } from "./joinClient.js";
import { createNethernetClient } from "./nethernetClientFactory.js";
import { createRandomSenderId, toClientOptions } from "./sessionClientOptions.js";

export const createSessionClient = (resolvedOptions: JoinOptions): ClientLike => {
  if (resolvedOptions.transport !== "nethernet") {
    return (resolvedOptions.clientFactory ?? createClient)(toClientOptions(resolvedOptions)) as ClientLike;
  }
  if (!resolvedOptions.nethernetServerId) throw new Error("NetherNet join requires serverId from discovery");
  return (resolvedOptions.nethernetClientFactory ?? createNethernetClient)(
    toClientOptions({ ...resolvedOptions, skipPing: true }),
    resolvedOptions.logger,
    resolvedOptions.nethernetServerId,
    resolvedOptions.nethernetClientId ?? createRandomSenderId()
  );
};
