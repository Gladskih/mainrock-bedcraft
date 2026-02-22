import type { Logger } from "pino";
import { toChunkPublisherUpdateLogFields } from "./sessionWorldLogging.js";

export const createChunkPublisherUpdateLogger = (logger: Logger): ((packet: unknown) => void) => {
  let chunkPublisherUpdateLogged = false;
  return (packet: unknown): void => {
    const payload = toChunkPublisherUpdateLogFields(packet);
    if (chunkPublisherUpdateLogged) {
      logger.debug(payload, "Updated chunk publisher");
      return;
    }
    chunkPublisherUpdateLogged = true;
    logger.info(payload, "Received network chunk publisher update");
  };
};
