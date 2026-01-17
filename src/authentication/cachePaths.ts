import envPaths from "env-paths";
import { join } from "node:path";
import { CACHE_KEY_FILE_NAME } from "../constants.js";

export type CachePaths = {
  cacheDirectory: string;
  keyFilePath: string;
};

export const resolveCachePaths = (applicationName: string): CachePaths => {
  const paths = envPaths(applicationName);
  return { cacheDirectory: paths.data, keyFilePath: join(paths.config, CACHE_KEY_FILE_NAME) };
};
