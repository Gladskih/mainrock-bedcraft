import type { EventEmitter } from "node:events";

export type PacketSenderLike = {
  write?: (name: string, params: object) => void;
  queue?: (name: string, params: object) => void;
  viewDistance?: number;
  versionLessThanOrEqualTo?: (version: string | number) => boolean;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  once?: (event: string, listener: (...args: unknown[]) => void) => void;
};

export type ClientLike = EventEmitter & PacketSenderLike & {
  disconnect: () => void;
};

