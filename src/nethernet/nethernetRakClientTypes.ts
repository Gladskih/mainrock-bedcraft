import type { Socket } from "node:dgram";
import type { PeerConnection } from "node-datachannel";

export type DatagramRemoteInfo = { address: string; port: number };

export type EncapsulatedPacketLike = { buffer: Uint8Array };

export type PeerConnectionLike = Pick<
PeerConnection,
  "close"
  | "setLocalDescription"
  | "setRemoteDescription"
  | "addRemoteCandidate"
  | "createDataChannel"
  | "onLocalDescription"
  | "onLocalCandidate"
  | "onStateChange"
>;

export type DataChannelLike = {
  getLabel: () => string;
  close: () => void;
  sendMessageBinary: (buffer: Buffer | Uint8Array) => boolean;
  onOpen: (cb: () => void) => void;
  onClosed: (cb: () => void) => void;
  onError: (cb: (err: string) => void) => void;
  onMessage: (cb: (msg: string | Buffer | ArrayBuffer) => void) => void;
  isOpen: () => boolean;
  maxMessageSize: () => number;
};

export type DatagramSocketLike = Pick<Socket, "bind" | "close" | "send" | "on" | "once">;

