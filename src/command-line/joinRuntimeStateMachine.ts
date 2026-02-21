import type { Logger } from "pino";

export type JoinRuntimeState = "offline" | "auth_ready" | "discovering" | "connecting" | "online" | "retry_waiting" | "failed";

type JoinStateTransition = {
  from: JoinRuntimeState;
  to: JoinRuntimeState;
  details: Record<string, unknown>;
};

const ALLOWED_TRANSITIONS: Record<JoinRuntimeState, readonly JoinRuntimeState[]> = {
  offline: ["auth_ready", "retry_waiting", "failed"],
  auth_ready: ["discovering", "failed"],
  discovering: ["connecting", "retry_waiting", "failed"],
  connecting: ["online", "offline", "retry_waiting", "failed"],
  online: ["offline", "failed"],
  retry_waiting: ["discovering", "failed"],
  failed: []
};

export type JoinRuntimeStateMachine = {
  getState: () => JoinRuntimeState;
  transitionTo: (nextState: JoinRuntimeState, details?: Record<string, unknown>) => void;
};

const transitionAllowed = (currentState: JoinRuntimeState, nextState: JoinRuntimeState): boolean => {
  return ALLOWED_TRANSITIONS[currentState].includes(nextState);
};

const logStateTransition = (logger: Logger, transition: JoinStateTransition): void => {
  logger.info(
    {
      event: "join_state",
      from: transition.from,
      to: transition.to,
      ...transition.details
    },
    "Join runtime state changed"
  );
};

export const createJoinRuntimeStateMachine = (logger: Logger): JoinRuntimeStateMachine => {
  let currentState: JoinRuntimeState = "offline";
  return {
    getState: () => currentState,
    transitionTo: (nextState, details = {}) => {
      if (currentState === nextState) return;
      if (!transitionAllowed(currentState, nextState)) throw new Error(`Invalid join runtime transition: ${currentState} -> ${nextState}`);
      const transition = {
        from: currentState,
        to: nextState,
        details
      };
      currentState = nextState;
      logStateTransition(logger, transition);
    }
  };
};
