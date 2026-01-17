import prismarineAuth from "prismarine-auth";
import type { Authflow, ServerDeviceCodeResponse } from "prismarine-auth";
import { createEncryptedCacheFactory } from "./encryptedCache.js";
import { loadEncryptionKey } from "./encryptionKey.js";

export type AuthFlowOptions = {
  accountName: string;
  cacheDirectory: string;
  keyFilePath: string;
  deviceCodeCallback: (code: ServerDeviceCodeResponse) => void;
  environmentKey: string | undefined;
  forceRefresh: boolean;
};

export type AuthFlowResult = {
  authflow: Authflow;
  keySource: "environment" | "file" | "generated";
};

type PrismarineAuthModule = {
  Authflow: new (...args: unknown[]) => Authflow;
  Titles: {
    MinecraftNintendoSwitch: string;
  };
};

export const createAuthFlow = (options: AuthFlowOptions): AuthFlowResult => {
  const { key, source } = loadEncryptionKey(options.keyFilePath, options.environmentKey);
  const { Authflow: AuthflowConstructor, Titles } = prismarineAuth as PrismarineAuthModule;
  return {
    authflow: new AuthflowConstructor(options.accountName, createEncryptedCacheFactory(options.cacheDirectory, key), {
      flow: "live",
      authTitle: Titles.MinecraftNintendoSwitch,
      deviceType: "Nintendo",
      forceRefresh: options.forceRefresh
    }, options.deviceCodeCallback),
    keySource: source
  };
};
