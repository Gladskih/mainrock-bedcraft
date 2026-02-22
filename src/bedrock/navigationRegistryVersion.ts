import type { ClientLike } from "./clientTypes.js";

export type ClientRegistryVersion = {
  requested: string | null;
  effective: string | null;
};

export const readClientRegistryVersion = (client: ClientLike): ClientRegistryVersion => {
  if (!("options" in client) || !client.options || typeof client.options !== "object") {
    return { requested: null, effective: null };
  }
  if (!("version" in client.options)) return { requested: null, effective: null };
  if (typeof client.options.version !== "string") return { requested: null, effective: null };
  const requested = client.options.version.startsWith("bedrock_")
    ? client.options.version.slice("bedrock_".length)
    : client.options.version;
  return { requested, effective: requested };
};
