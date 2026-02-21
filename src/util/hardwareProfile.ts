import { totalmem } from "node:os";

const GIGABYTE_BYTES = 1024 ** 3;

export const resolveDefaultChunkRadiusSoftCap = (systemMemoryBytes = totalmem()): number => {
  if (systemMemoryBytes <= 4 * GIGABYTE_BYTES) return 8;
  if (systemMemoryBytes <= 8 * GIGABYTE_BYTES) return 10;
  if (systemMemoryBytes <= 12 * GIGABYTE_BYTES) return 12;
  if (systemMemoryBytes <= 16 * GIGABYTE_BYTES) return 14;
  return 16;
};
