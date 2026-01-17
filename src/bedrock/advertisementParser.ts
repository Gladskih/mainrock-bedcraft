export type LanServerAdvertisement = {
  motd: string;
  levelName: string;
  protocol: number;
  version: string;
  playersOnline: number;
  playersMax: number;
  serverId: string;
  gamemode: string;
  gamemodeId: number | null;
  portV4: number | null;
  portV6: number | null;
};

const ADVERTISEMENT_HEADER = "MCPE"; // Bedrock LAN advertisement header prefix.
const ADVERTISEMENT_INDEX = {
  header: 0,
  motd: 1,
  protocol: 2,
  version: 3,
  playersOnline: 4,
  playersMax: 5,
  serverId: 6,
  levelName: 7,
  gamemode: 8,
  gamemodeId: 9,
  portV4: 10,
  portV6: 11
};
const MIN_ADVERTISEMENT_SEGMENTS = 11; // Minimum segments before optional IPv6 port.

const parseRequiredNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const parseOptionalNumber = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const parseAdvertisementString = (advertisement: string): LanServerAdvertisement | null => {
  const segments = advertisement.split(";");
  if (segments.length < MIN_ADVERTISEMENT_SEGMENTS) return null;
  if (segments[ADVERTISEMENT_INDEX.header] !== ADVERTISEMENT_HEADER) return null;
  const protocol = parseRequiredNumber(segments[ADVERTISEMENT_INDEX.protocol]);
  const playersOnline = parseRequiredNumber(segments[ADVERTISEMENT_INDEX.playersOnline]);
  const playersMax = parseRequiredNumber(segments[ADVERTISEMENT_INDEX.playersMax]);
  if (protocol === null || playersOnline === null || playersMax === null) return null;
  const serverId = segments[ADVERTISEMENT_INDEX.serverId];
  if (!serverId) return null;
  const version = segments[ADVERTISEMENT_INDEX.version] as string;
  if (!version) return null;
  return {
    motd: segments[ADVERTISEMENT_INDEX.motd] as string,
    levelName: segments[ADVERTISEMENT_INDEX.levelName] as string,
    protocol,
    version,
    playersOnline,
    playersMax,
    serverId,
    gamemode: segments[ADVERTISEMENT_INDEX.gamemode] as string,
    gamemodeId: parseOptionalNumber(segments[ADVERTISEMENT_INDEX.gamemodeId]),
    portV4: parseOptionalNumber(segments[ADVERTISEMENT_INDEX.portV4]),
    portV6: parseOptionalNumber(segments[ADVERTISEMENT_INDEX.portV6])
  };
};
