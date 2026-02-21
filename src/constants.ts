export const DEFAULT_BEDROCK_PORT = 19132; // Default Bedrock UDP port used by servers.
export const DEFAULT_LAN_DISCOVERY_PORT = 4445; // Bedrock LAN discovery UDP port for MCPE advertisements (multicast to 224.0.2.60).
export const DEFAULT_NETHERNET_PORT = 7551; // NetherNet LAN discovery/signaling UDP port.
export const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000; // LAN broadcasts are frequent; 5s captures multiple announcements.
export const DEFAULT_NETHERNET_DISCOVERY_REQUEST_INTERVAL_MS = 1000; // Resend NetherNet discovery once per second to mitigate UDP loss without flooding.
export const DEFAULT_PING_THROTTLE_MS = 200; // Small delay to avoid ping bursts across multiple servers.
export const DEFAULT_PING_TIMEOUT_MS = 1500; // Slightly above RakNet default to reduce false timeouts.
export const DEFAULT_JOIN_TIMEOUT_MS = 90000; // Prevent CLI join from hanging forever; 90s is ample for LAN login + resource pack handshake + first chunk on typical hardware.
export const DEFAULT_VIEW_DISTANCE_CHUNKS = 10; // Bedrock-protocol createClient default; used when requesting initial chunk radius.
export const DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS = 500; // Bedrock-protocol waits briefly before requesting chunk radius to allow server init packets to land first.
export type RaknetBackend = "raknet-native" | "raknet-node";
export const RAKNET_BACKEND_NATIVE: RaknetBackend = "raknet-native"; // Native RakNet backend used by bedrock-protocol.
export const RAKNET_BACKEND_NODE: RaknetBackend = "raknet-node"; // Rust RakNet backend shipped as prebuilt binary.
export const DEFAULT_RAKNET_BACKEND: RaknetBackend = RAKNET_BACKEND_NATIVE; // Native backend is the most reliable option with current public Bedrock servers.
export const BEDROCK_LAN_MULTICAST_ADDRESS_V4 = "224.0.2.60"; // Bedrock LAN discovery multicast group (IPv4).
export const NETHERNET_DISCOVERY_KEY_SEED = 0xdeadbeefn; // NetherNet discovery key seed from spec; used as LE uint64 for SHA-256 key derivation.
export const NETHERNET_MAX_SEGMENT_BYTES = 10000; // NetherNet spec: split packets larger than 10,000 bytes for SCTP messages.
export const RAKNET_UNCONNECTED_PING_ID = 0x01; // RakNet ID_UNCONNECTED_PING.
export const RAKNET_UNCONNECTED_PONG_ID = 0x1c; // RakNet ID_UNCONNECTED_PONG.
export const RAKNET_MAGIC = Buffer.from([
  0x00,
  0xff,
  0xff,
  0x00,
  0xfe,
  0xfe,
  0xfe,
  0xfe,
  0xfd,
  0xfd,
  0xfd,
  0xfd,
  0x12,
  0x34,
  0x56,
  0x78
]); // RakNet offline magic constant.
export const RAKNET_MAGIC_LENGTH_BYTES = 16; // Magic length per RakNet offline packet spec.
export const RAKNET_LONG_LENGTH_BYTES = 8; // 64-bit integer size in bytes.
export const IPV4_OCTET_COUNT = 4; // IPv4 addresses are four octets.
export const IPV4_OCTET_MAX = 255; // Maximum value for a single IPv4 octet.
export const IPV4_BITS_PER_OCTET = 8; // IPv4 uses 8 bits per octet.
export const GLOBAL_BROADCAST_ADDRESS = "255.255.255.255"; // IPv4 limited broadcast address.
export const AES_GCM_KEY_LENGTH_BYTES = 32; // AES-256 key size in bytes.
export const AES_GCM_IV_LENGTH_BYTES = 12; // 96-bit IV recommended for AES-GCM.
export const AES_GCM_TAG_LENGTH_BYTES = 16; // 128-bit authentication tag size.
export const CACHE_KEY_FILE_NAME = "cache-key.bin"; // Stored per-user encryption key filename.
export const CACHE_FILE_SUFFIX = "-cache.bin"; // Suffix for encrypted cache files.
export const CACHE_HASH_ALGORITHM = "sha256"; // Stable hash to avoid exposing account identifiers in filenames.
export const DEVICE_CODE_POLL_INTERVAL_MS = 1000; // Device code flow poll hint default if not provided.
