import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type MovementSpeedProfileEntry = {
  speedBlocksPerSecond: number;
  measuredAtIso: string;
};

type MovementSpeedProfileDocument = {
  version: 1;
  profiles: Record<string, MovementSpeedProfileEntry>;
};

const DEFAULT_DOCUMENT: MovementSpeedProfileDocument = { version: 1, profiles: {} };

const readDocument = async (filePath: string): Promise<MovementSpeedProfileDocument> => {
  try {
    const fileText = await readFile(filePath, "utf8");
    const parsed = JSON.parse(fileText);
    if (!parsed || typeof parsed !== "object") return DEFAULT_DOCUMENT;
    if (!("version" in parsed) || parsed["version"] !== 1) return DEFAULT_DOCUMENT;
    if (!("profiles" in parsed) || typeof parsed["profiles"] !== "object" || parsed["profiles"] === null) {
      return DEFAULT_DOCUMENT;
    }
    return { version: 1, profiles: parsed["profiles"] as Record<string, MovementSpeedProfileEntry> };
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return DEFAULT_DOCUMENT;
    return DEFAULT_DOCUMENT;
  }
};

const writeDocument = async (filePath: string, document: MovementSpeedProfileDocument): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(document, null, 2), "utf8");
};

const isValidSpeed = (value: unknown): value is number => {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
};

export const toMovementSpeedProfileKey = (parameters: {
  transport: "raknet" | "nethernet";
  host: string;
  port: number;
  serverId: string | null;
}): string => {
  if (parameters.serverId) return `${parameters.transport}|id:${parameters.serverId}`;
  return `${parameters.transport}|host:${parameters.host.toLowerCase()}|port:${parameters.port}`;
};

export const createMovementSpeedProfileStore = (filePath: string): {
  readSpeed: (profileKey: string) => Promise<number | null>;
  writeSpeed: (profileKey: string, speedBlocksPerSecond: number) => Promise<void>;
} => {
  const readSpeed = async (profileKey: string): Promise<number | null> => {
    const document = await readDocument(filePath);
    const profile = document.profiles[profileKey];
    if (!profile) return null;
    return isValidSpeed(profile.speedBlocksPerSecond) ? profile.speedBlocksPerSecond : null;
  };
  const writeSpeed = async (profileKey: string, speedBlocksPerSecond: number): Promise<void> => {
    if (!isValidSpeed(speedBlocksPerSecond)) return;
    const document = await readDocument(filePath);
    const nextDocument: MovementSpeedProfileDocument = {
      version: 1,
      profiles: {
        ...document.profiles,
        [profileKey]: { speedBlocksPerSecond, measuredAtIso: new Date().toISOString() }
      }
    };
    await writeDocument(filePath, nextDocument);
  };
  return { readSpeed, writeSpeed };
};
