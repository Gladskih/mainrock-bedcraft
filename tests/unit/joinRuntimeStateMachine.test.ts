import assert from "node:assert/strict";
import { test } from "node:test";
import type { Logger } from "pino";
import { createJoinRuntimeStateMachine } from "../../src/command-line/joinRuntimeStateMachine.js";

const createLogger = (): Logger => ({
  info: () => undefined
} as unknown as Logger);

void test("createJoinRuntimeStateMachine allows valid transition flow", () => {
  const stateMachine = createJoinRuntimeStateMachine(createLogger());
  stateMachine.transitionTo("auth_ready");
  stateMachine.transitionTo("discovering");
  stateMachine.transitionTo("connecting");
  stateMachine.transitionTo("online");
  stateMachine.transitionTo("offline");
  assert.equal(stateMachine.getState(), "offline");
});

void test("createJoinRuntimeStateMachine allows retry transition flow", () => {
  const stateMachine = createJoinRuntimeStateMachine(createLogger());
  stateMachine.transitionTo("auth_ready");
  stateMachine.transitionTo("discovering");
  stateMachine.transitionTo("retry_waiting");
  stateMachine.transitionTo("discovering");
  stateMachine.transitionTo("connecting");
  stateMachine.transitionTo("offline");
  stateMachine.transitionTo("retry_waiting");
  assert.equal(stateMachine.getState(), "retry_waiting");
});

void test("createJoinRuntimeStateMachine rejects invalid transition", () => {
  const stateMachine = createJoinRuntimeStateMachine(createLogger());
  assert.throws(() => stateMachine.transitionTo("online"));
});
