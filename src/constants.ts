export const APPLICATION_ID = "mainrock-bedcraft"; // Canonical project identifier for CLI name, logging, cache namespace, and runtime labels.
export const DEFAULT_BEDROCK_PORT = 19132; // Default Bedrock UDP port used by servers.
export const DEFAULT_LAN_DISCOVERY_PORT = 4445; // Bedrock LAN discovery UDP port for MCPE advertisements (multicast to 224.0.2.60).
export const DEFAULT_NETHERNET_PORT = 7551; // NetherNet LAN discovery/signaling UDP port.
export const DEFAULT_DISCOVERY_TIMEOUT_MS = 5000; // LAN broadcasts are frequent; 5s captures multiple announcements.
export const DEFAULT_NETHERNET_DISCOVERY_REQUEST_INTERVAL_MS = 1000; // Resend NetherNet discovery once per second to mitigate UDP loss without flooding.
export const DEFAULT_PING_THROTTLE_MS = 200; // Small delay to avoid ping bursts across multiple servers.
export const DEFAULT_PING_TIMEOUT_MS = 1500; // Slightly above RakNet default to reduce false timeouts.
export const DEFAULT_JOIN_TIMEOUT_MS = 90000; // Prevent CLI join from hanging forever; 90s is ample for LAN login + resource pack handshake + first chunk on typical hardware.
export const DEFAULT_BOT_HEARTBEAT_INTERVAL_MS = 10000; // Runtime heartbeat every 10s confirms live connection without log flooding.
export const DEFAULT_CHUNK_PROGRESS_LOG_INTERVAL = 64; // Log every 64 chunk packets to observe world streaming progress with bounded log volume.
export const DEFAULT_MOVEMENT_LOOP_INTERVAL_MS = 100; // 10Hz movement updates are frequent enough for smooth server-side motion and low enough to avoid packet floods.
export const DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND = 1.1; // Conservative walking speed below sprint speed to reduce server corrections and anti-cheat risk.
export const DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS = 1.75; // Keep a small offset from the target player to avoid collision jitter and repeated server corrections.
export const DEFAULT_FOLLOW_PLAYER_WAIT_LOG_INTERVAL_MS = 5000; // Waiting logs are throttled to once every 5s to keep diagnostics useful without flooding output.
export const DEFAULT_MOVEMENT_SAFETY_DROP_TRIGGER_BLOCKS = 1.5; // A drop larger than normal walking jitter indicates possible cliff/ledge descent and triggers emergency recovery.
export const DEFAULT_MOVEMENT_SAFETY_DESCENT_STEP_BLOCKS = 0.2; // Repeated small downward deltas suggest sliding into water/lava/slope and should trigger conservative recovery.
export const DEFAULT_MOVEMENT_SAFETY_DESCENT_TICKS = 3; // Three consecutive descent ticks (~300ms at 10Hz) balance responsiveness and false-positive resistance.
export const DEFAULT_MOVEMENT_SAFETY_TERRAIN_RECOVERY_MS = 1800; // Hold/reverse movement for ~1.8s after terrain danger to avoid repeatedly stepping into the same hazard.
export const DEFAULT_MOVEMENT_SAFETY_LOW_AIR_THRESHOLD = 6; // Air below six ticks means urgent breathing risk, so force upward recovery behavior.
export const DEFAULT_MOVEMENT_SAFETY_HEALTH_LOSS_TRIGGER = 2; // Two health points lost in one update is treated as meaningful danger (lava/fall/combat) for emergency handling.
export const DEFAULT_MOVEMENT_SAFETY_AIR_RECOVERY_MS = 2000; // Emergency jump/hold window after low-air or damage to stabilize before resuming pursuit.
export const DEFAULT_MOVEMENT_SAFETY_PANIC_STRIKE_WINDOW_MS = 15000; // Danger strikes are aggregated over 15s to detect repeated exposure to lava/water/cliffs.
export const DEFAULT_MOVEMENT_SAFETY_PANIC_STRIKE_LIMIT = 3; // Three strikes inside the window trigger a stronger safety circuit-breaker mode.
export const DEFAULT_MOVEMENT_SAFETY_PANIC_RECOVERY_MS = 4000; // During panic recovery the bot stops pursuit and focuses on escaping immediate danger.
export const DEFAULT_MOVEMENT_SAFETY_LOG_INTERVAL_MS = 2000; // Safety logs are throttled to once per two seconds to stay informative without flooding.
export const DEFAULT_PLAYER_LIST_WAIT_MS = 8000; // Player-list probe waits 8s after login so server has enough time to send add/remove records.
export const DEFAULT_PLAYER_LIST_SETTLE_MS = 100; // After at least one player-list update, wait briefly for follow-up add/remove packets before finishing probe mode while aiming to exit before chunk stream starts.
export const MOVEMENT_GOAL_SAFE_WALK = "safe_walk"; // Default runtime goal keeps the bot moving for connectivity and packet-flow validation.
export const MOVEMENT_GOAL_FOLLOW_PLAYER = "follow_player"; // Follow a specific online player using server-reported entity positions.
export const MOVEMENT_GOAL_FOLLOW_COORDINATES = "follow_coordinates"; // Move toward explicit world coordinates and hold position on arrival.
export const DEFAULT_FOLLOW_COORDINATES_STOP_DISTANCE_BLOCKS = 1.5; // Stop close to target coordinate to reduce oscillation from server corrections.
export type MovementGoal =
  | typeof MOVEMENT_GOAL_SAFE_WALK
  | typeof MOVEMENT_GOAL_FOLLOW_PLAYER
  | typeof MOVEMENT_GOAL_FOLLOW_COORDINATES;
export const DEFAULT_MOVEMENT_GOAL: MovementGoal = MOVEMENT_GOAL_SAFE_WALK; // Safe walk remains default behavior when no explicit gameplay goal is selected.
export const DEFAULT_VIEW_DISTANCE_CHUNKS = 10; // Bedrock-protocol createClient default; used when requesting initial chunk radius.
export const MAX_CHUNK_RADIUS_REQUEST_CHUNKS = 255; // Protocol-level upper bound for request_chunk_radius max_radius (u8).
export const DEFAULT_REQUEST_CHUNK_RADIUS_DELAY_MS = 500; // Bedrock-protocol waits briefly before requesting chunk radius to allow server init packets to land first.
export const DEFAULT_RECONNECT_MAX_RETRIES = 2; // Two retries (three total attempts) balance resilience against transient LAN issues and anti-flood safety.
export const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000; // First reconnect delay is one second to avoid immediate reconnect bursts.
export const DEFAULT_RECONNECT_MAX_DELAY_MS = 8000; // Cap exponential backoff at eight seconds to keep retries bounded.
export const DEFAULT_RECONNECT_JITTER_RATIO = 0.2; // Add up to 20% random jitter to avoid synchronized reconnect storms.
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
