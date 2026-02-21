type ReconnectDelayOptions = {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  random: () => number;
};

export const calculateReconnectDelayMs = (options: ReconnectDelayOptions): number => {
  const boundedAttempt = Math.max(0, options.attempt);
  const exponentialDelay = Math.min(options.maxDelayMs, options.baseDelayMs * (2 ** boundedAttempt));
  const jitter = Math.floor(exponentialDelay * Math.max(0, options.jitterRatio) * options.random());
  return exponentialDelay + jitter;
};
