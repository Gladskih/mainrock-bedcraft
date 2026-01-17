import { NETHERNET_MAX_SEGMENT_BYTES } from "../constants.js";

const SEGMENT_HEADER_BYTES = 1;
const MAX_SEGMENT_COUNT = 255;

export const splitNethernetPayload = (
  payload: Buffer,
  maxSegmentBytes: number = NETHERNET_MAX_SEGMENT_BYTES
): Buffer[] => {
  if (maxSegmentBytes <= 0) throw new Error("NetherNet segment size must be positive");
  const segmentCount = Math.ceil(payload.length / maxSegmentBytes) || 1;
  if (segmentCount - 1 > MAX_SEGMENT_COUNT) throw new Error("NetherNet payload requires too many segments");
  const segments: Buffer[] = [];
  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * maxSegmentBytes;
    const end = Math.min(payload.length, start + maxSegmentBytes);
    const remaining = segmentCount - index - 1;
    segments.push(Buffer.concat([Buffer.from([remaining]), payload.subarray(start, end)]));
  }
  return segments;
};

export class NethernetSegmentReassembler {
  private expectedRemainingSegments: number | null = null;
  private buffer: Buffer | null = null;

  consume(message: Buffer): Buffer | null {
    if (message.length < SEGMENT_HEADER_BYTES) throw new Error("NetherNet segment missing header");
    const remainingSegments = message.readUInt8(0);
    if (
      this.expectedRemainingSegments !== null
      && this.expectedRemainingSegments > 0
      && this.expectedRemainingSegments - 1 !== remainingSegments
    ) throw new Error("NetherNet segment order mismatch");
    this.expectedRemainingSegments = remainingSegments;
    this.buffer = this.buffer
      ? Buffer.concat([this.buffer, message.subarray(SEGMENT_HEADER_BYTES)])
      : message.subarray(SEGMENT_HEADER_BYTES);
    if (remainingSegments > 0) return null;
    const completed = this.buffer;
    this.expectedRemainingSegments = null;
    this.buffer = null;
    return completed;
  }
}
