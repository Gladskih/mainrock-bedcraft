import type { ClientOptions } from "bedrock-protocol";
import type { Authflow } from "prismarine-auth";
import type { RaknetBackend } from "../constants.js";

export type AuthenticatedClientOptions = ClientOptions & {
  authflow: Authflow;
  flow: "live";
  deviceType: string;
  raknetBackend: RaknetBackend;
};

