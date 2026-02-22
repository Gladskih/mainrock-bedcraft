import { DEFAULT_FOLLOW_PLAYER_TARGET_ACQUIRE_TIMEOUT_MS } from "../constants.js";

export type FollowPlayerTargetAcquireState = {
  missingSinceMs: number | null;
  waitLogged: boolean;
  failureRaised: boolean;
};

export const createFollowPlayerTargetAcquireState = (): FollowPlayerTargetAcquireState => ({
  missingSinceMs: null,
  waitLogged: false,
  failureRaised: false
});

type UpdateFollowPlayerTargetAcquireStateOptions = {
  state: FollowPlayerTargetAcquireState;
  nowMs: number;
  hasTarget: boolean;
  onWait: () => void;
  onFailure: () => void;
  timeoutMs?: number;
};

export const updateFollowPlayerTargetAcquireState = (
  options: UpdateFollowPlayerTargetAcquireStateOptions
): void => {
  if (options.hasTarget) {
    options.state.missingSinceMs = null;
    options.state.waitLogged = false;
    return;
  }
  if (options.state.missingSinceMs === null) options.state.missingSinceMs = options.nowMs;
  if (!options.state.waitLogged) {
    options.state.waitLogged = true;
    options.onWait();
  }
  if (options.state.failureRaised) return;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FOLLOW_PLAYER_TARGET_ACQUIRE_TIMEOUT_MS;
  if (options.nowMs - options.state.missingSinceMs < timeoutMs) return;
  options.state.failureRaised = true;
  options.onFailure();
};
