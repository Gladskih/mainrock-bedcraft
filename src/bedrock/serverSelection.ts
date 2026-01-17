export type ServerWithAdvertisement = {
  advertisement: {
    motd: string;
  };
};

export type ServerSelectionResult<T> = {
  selected: T | null;
  matches: T[];
};

export const normalizeServerName = (name: string): string => name
  .replace(/\u00a7[0-9A-FK-OR]/gi, "")
  .trim()
  .toLowerCase();

export const selectServerByName = <T extends ServerWithAdvertisement>(
  servers: T[],
  name: string
): ServerSelectionResult<T> => {
  const normalizedTarget = normalizeServerName(name);
  const matches = servers.filter((server) => {
    return normalizeServerName(server.advertisement.motd).includes(normalizedTarget);
  });
  return { selected: matches.length === 1 ? matches[0] as T : null, matches };
};
