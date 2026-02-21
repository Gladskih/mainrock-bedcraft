import { lookup } from "node:dns/promises";

export const lookupHostAddress = async (hostname: string): Promise<string> => {
  return (await lookup(hostname, { family: 4 })).address;
};

export { createJoinPromise } from "./joinClientSessionRuntime.js";
