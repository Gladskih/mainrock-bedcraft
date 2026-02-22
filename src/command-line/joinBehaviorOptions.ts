import {
  MOVEMENT_GOAL_FOLLOW_COORDINATES,
  MOVEMENT_GOAL_FOLLOW_PLAYER,
  MOVEMENT_SPEED_MODE_CALIBRATE
} from "../constants.js";
import type { EnvironmentVariables, JoinInput } from "./options.js";
import { resolveJoinOptions } from "./options.js";
import type { JoinCommandOptions } from "./runJoinCommand.js";

export type CalibrateSpeedInput = {
  host: string | undefined;
  port: string | undefined;
  name: string | undefined;
  transport: string | undefined;
  account: string | undefined;
  cacheDir: string | undefined;
  keyFile: string | undefined;
  minecraftVersion: string | undefined;
  joinTimeout: string | undefined;
  forceRefresh: boolean | undefined;
  skipPing: boolean | undefined;
  raknetBackend: string | undefined;
  discoveryTimeout: string | undefined;
  followCoordinates: string | undefined;
  chunkRadius: string | undefined;
  reconnectRetries: string | undefined;
  reconnectBaseDelay: string | undefined;
  reconnectMaxDelay: string | undefined;
  speedProfileFile: string | undefined;
};

export type FollowInput = {
  host: string | undefined;
  port: string | undefined;
  name: string | undefined;
  transport: string | undefined;
  account: string | undefined;
  cacheDir: string | undefined;
  keyFile: string | undefined;
  minecraftVersion: string | undefined;
  joinTimeout: string | undefined;
  forceRefresh: boolean | undefined;
  skipPing: boolean | undefined;
  raknetBackend: string | undefined;
  discoveryTimeout: string | undefined;
  followPlayer: string | undefined;
  followCoordinates: string | undefined;
  chunkRadius: string | undefined;
  reconnectRetries: string | undefined;
  reconnectBaseDelay: string | undefined;
  reconnectMaxDelay: string | undefined;
  speedProfileFile: string | undefined;
};

type BehaviorInputBase = {
  host: string | undefined;
  port: string | undefined;
  name: string | undefined;
  transport: string | undefined;
  account: string | undefined;
  cacheDir: string | undefined;
  keyFile: string | undefined;
  minecraftVersion: string | undefined;
  joinTimeout: string | undefined;
  forceRefresh: boolean | undefined;
  skipPing: boolean | undefined;
  raknetBackend: string | undefined;
  discoveryTimeout: string | undefined;
  chunkRadius: string | undefined;
  reconnectRetries: string | undefined;
  reconnectBaseDelay: string | undefined;
  reconnectMaxDelay: string | undefined;
  speedProfileFile: string | undefined;
};

const toJoinInput = (
  input: BehaviorInputBase,
  goal: JoinInput["goal"],
  followPlayer: JoinInput["followPlayer"],
  followCoordinates: JoinInput["followCoordinates"]
): JoinInput => ({
  host: input.host,
  port: input.port,
  name: input.name,
  transport: input.transport,
  account: input.account,
  cacheDir: input.cacheDir,
  keyFile: input.keyFile,
  minecraftVersion: input.minecraftVersion,
  joinTimeout: input.joinTimeout,
  disconnectAfterFirstChunk: false,
  forceRefresh: input.forceRefresh,
  skipPing: input.skipPing,
  raknetBackend: input.raknetBackend,
  discoveryTimeout: input.discoveryTimeout,
  goal,
  followPlayer,
  followCoordinates,
  chunkRadius: input.chunkRadius,
  reconnectRetries: input.reconnectRetries,
  reconnectBaseDelay: input.reconnectBaseDelay,
  reconnectMaxDelay: input.reconnectMaxDelay,
  speedProfileFile: input.speedProfileFile
});

export const resolveCalibrateSpeedOptions = (
  input: CalibrateSpeedInput,
  env: EnvironmentVariables
): JoinCommandOptions => {
  const joinOptions = resolveJoinOptions(
    toJoinInput(input, MOVEMENT_GOAL_FOLLOW_COORDINATES, undefined, input.followCoordinates),
    env
  );
  return {
    ...joinOptions,
    movementGoal: MOVEMENT_GOAL_FOLLOW_COORDINATES,
    movementSpeedMode: MOVEMENT_SPEED_MODE_CALIBRATE,
    disconnectAfterFirstChunk: false
  };
};

export const resolveFollowOptions = (
  input: FollowInput,
  env: EnvironmentVariables
): JoinCommandOptions => {
  const followPlayer = input.followPlayer ?? env["BEDCRAFT_FOLLOW_PLAYER"];
  const followCoordinates = input.followCoordinates ?? env["BEDCRAFT_FOLLOW_COORDINATES"];
  const hasFollowPlayer = Boolean(followPlayer);
  const hasFollowCoordinates = Boolean(followCoordinates);
  if (hasFollowPlayer === hasFollowCoordinates) {
    throw new Error("Follow command requires exactly one target: --follow-player or --follow-coordinates");
  }
  return resolveJoinOptions(
    toJoinInput(
      input,
      hasFollowPlayer ? MOVEMENT_GOAL_FOLLOW_PLAYER : MOVEMENT_GOAL_FOLLOW_COORDINATES,
      followPlayer,
      followCoordinates
    ),
    env
  );
};
