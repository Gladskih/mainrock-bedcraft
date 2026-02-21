import type { ClientLike } from "./clientTypes.js";

type ErrorWithMessage = { message?: string };
type ConnectionWithClose = {
  close?: () => void;
  raknet?: {
    close?: () => void;
    client?: {
      close?: () => void;
    };
  };
};

const closeIfPossible = (value: unknown): void => {
  if (!value || typeof value !== "object") return;
  if (!("close" in value)) return;
  const close = (value as { close?: unknown }).close;
  if (typeof close !== "function") return;
  close.call(value);
};

export const disconnectClient = (client: ClientLike): void => {
  try {
    client.disconnect();
  } catch {
    // Best-effort cleanup; close fallback handles partially initialized transports.
  }
  const connection = "connection" in client ? (client as { connection?: ConnectionWithClose }).connection : undefined;
  try {
    closeIfPossible(connection);
  } catch {
    // Best-effort cleanup to avoid hung sockets on backend-specific failures.
  }
  try {
    closeIfPossible(connection?.raknet);
  } catch {
    // Best-effort cleanup for raknet-node wrapper.
  }
  try {
    closeIfPossible(connection?.raknet?.client);
  } catch {
    // Best-effort cleanup for wrapped native/js clients.
  }
};

export const isRecoverableReadError = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const message = (value as ErrorWithMessage).message;
  if (typeof message !== "string") return false;
  return /^Read error for /u.test(message);
};
