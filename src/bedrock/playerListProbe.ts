type PlayerListProbe = {
  start: () => void;
  notePlayersObserved: () => void;
  completeNow: () => void;
  clear: () => void;
};

type PlayerListProbeOptions = {
  enabled: boolean;
  maxWaitMs: number;
  settleWaitMs: number;
  onElapsed: () => void;
};

export const createPlayerListProbe = (options: PlayerListProbeOptions): PlayerListProbe => {
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  const clear = (): void => {
    if (maxTimeoutId) {
      clearTimeout(maxTimeoutId);
      maxTimeoutId = null;
    }
    if (!settleTimeoutId) return;
    clearTimeout(settleTimeoutId);
    settleTimeoutId = null;
  };
  const finalize = (): void => {
    clear();
    options.onElapsed();
  };
  const start = (): void => {
    if (!options.enabled || maxTimeoutId) return;
    maxTimeoutId = setTimeout(() => {
      finalize();
    }, options.maxWaitMs);
  };
  const notePlayersObserved = (): void => {
    if (!options.enabled) return;
    if (settleTimeoutId) clearTimeout(settleTimeoutId);
    settleTimeoutId = setTimeout(() => {
      finalize();
    }, options.settleWaitMs);
  };
  return {
    start,
    notePlayersObserved,
    completeNow: finalize,
    clear
  };
};
