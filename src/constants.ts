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
export const DEFAULT_MOVEMENT_LOOP_INTERVAL_MS = 50; // 20Hz matches Bedrock server tick cadence and avoids stale input tick progression on authoritative servers.
export const DEFAULT_MOVEMENT_PACKET_MODE_SWITCH_DELAY_MS = 600000; // Keep auto fallback effectively disabled during diagnostics so player_auth_input behavior is isolated.
export const DEFAULT_MOVEMENT_PACKET_MODE_SWITCH_MIN_PACKETS = 1000000; // Keep auto fallback effectively disabled during diagnostics so player_auth_input behavior is isolated.
export const DEFAULT_WALK_SPEED_BLOCKS_PER_SECOND = 1.1; // Conservative walking speed below sprint speed to reduce server corrections and anti-cheat risk.
export const DEFAULT_MOVEMENT_AUTOTUNE_MIN_SPEED_BLOCKS_PER_SECOND = 0.8; // Keep a floor above full stop so the bot can still recover direction after backoff.
export const DEFAULT_MOVEMENT_AUTOTUNE_MAX_SPEED_BLOCKS_PER_SECOND = 2.4; // Upper bound stays far below sprint-like movement to limit correction spikes and anti-cheat risk.
export const DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_STEP_BLOCKS_PER_SECOND = 0.1; // Small step size keeps speed probing gradual and observable.
export const DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_INTERVAL_MS = 3000; // Require at least 3s between speed increases to gather enough correction feedback.
export const DEFAULT_MOVEMENT_AUTOTUNE_INCREASE_QUIET_WINDOW_MS = 4000; // Demand a correction-free quiet window before probing a faster speed.
export const DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_THRESHOLD_BLOCKS = 0.6; // Treat >=0.6 block delta between predicted and authoritative local position as a meaningful correction.
export const DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_WINDOW_MS = 5000; // Aggregate correction strikes over 5s to distinguish jitter from persistent speed mismatch.
export const DEFAULT_MOVEMENT_AUTOTUNE_CORRECTION_STRIKE_LIMIT = 2; // Two meaningful corrections in-window trigger immediate speed backoff.
export const DEFAULT_MOVEMENT_AUTOTUNE_BACKOFF_RATIO = 0.9; // Reduce speed by 10% on correction strike limit so calibration converges near the server limit instead of over-dropping.
export const DEFAULT_MOVEMENT_AUTOTUNE_PREDICTION_MAX_AGE_MS = 2000; // Ignore stale prediction snapshots older than 2s when evaluating server correction distance.
export const DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_MAX_SPEED_BLOCKS_PER_SECOND = 5; // Calibration-only ceiling probes well above normal walk speed to force at least one authoritative correction on most servers.
export const DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_CORRECTION_THRESHOLD_BLOCKS = 0.25; // Calibration reacts to smaller server corrections to detect the first overspeed boundary earlier.
export const DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_CORRECTION_STRIKE_LIMIT = 1; // One meaningful correction is enough to mark the first boundary crossing during calibration.
export const DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_INCREASE_INTERVAL_MS = 1500; // Calibration ramps faster than runtime mode to converge in a practical amount of time.
export const DEFAULT_MOVEMENT_AUTOTUNE_CALIBRATION_STABILITY_WINDOW_MS = 8000; // After reaching correction ceiling, hold speed for 8s without further corrections before accepting calibrated limit.
export const MOVEMENT_SPEED_MODE_FIXED = "fixed"; // Default runtime mode uses persisted/manual speed and avoids continuous probing.
export const MOVEMENT_SPEED_MODE_CALIBRATE = "calibrate"; // Calibration mode probes upward until correction ceiling, then verifies stable fallback speed.
export type MovementSpeedMode = typeof MOVEMENT_SPEED_MODE_FIXED | typeof MOVEMENT_SPEED_MODE_CALIBRATE;
export const DEFAULT_MOVEMENT_SPEED_MODE: MovementSpeedMode = MOVEMENT_SPEED_MODE_FIXED; // Keep default behavior deterministic and safe; run calibration only on explicit request.
export const MOVEMENT_SPEED_PROFILE_FILE_NAME = "movement-speed-profiles.json"; // Persisted per-server movement speed recommendations.
export const DEFAULT_FOLLOW_PLAYER_STOP_DISTANCE_BLOCKS = 1.75; // Keep a small offset from the target player to avoid collision jitter and repeated server corrections.
export const DEFAULT_FOLLOW_PLAYER_WAIT_LOG_INTERVAL_MS = 5000; // Waiting logs are throttled to once every 5s to keep diagnostics useful without flooding output.
export const DEFAULT_FOLLOW_PLAYER_TARGET_ACQUIRE_TIMEOUT_MS = 3000; // Fail fast if requested follow target is not seen in tracked entity packets shortly after movement starts.
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
export const DEFAULT_MOVEMENT_STUCK_PROGRESS_DISTANCE_BLOCKS = 0.35; // Treat less than 0.35 blocks horizontal movement as no progress when trying to walk.
export const DEFAULT_MOVEMENT_STUCK_TIMEOUT_MS = 2200; // Trigger obstacle recovery after 2.2s without measurable progress while movement is requested.
export const DEFAULT_MOVEMENT_STUCK_CORRECTION_WINDOW_MS = 3200; // Evaluate correction bursts over a short window to detect wall collisions quickly.
export const DEFAULT_MOVEMENT_STUCK_CORRECTION_STRIKES = 3; // Three corrections in-window indicate repeated blocked movement.
export const DEFAULT_MOVEMENT_STUCK_RECOVERY_DURATION_MS = 1600; // Keep a single recovery maneuver short to avoid over-rotating away from goal.
export const DEFAULT_MOVEMENT_STUCK_RECOVERY_TURN_DEGREES = 70; // Turn around obstacle edges with a strong but not full side angle.
export const DEFAULT_MOVEMENT_DOOR_INTERACT_COOLDOWN_MS = 2200; // Limit block interaction probes to once per recovery window to avoid packet spam.
export const DEFAULT_MOVEMENT_DOOR_INTERACT_DISTANCE_BLOCKS = 1.1; // Probe the block directly ahead at typical interaction range.
export const DEFAULT_MOVEMENT_DOOR_INTERACT_HEIGHT_OFFSET_BLOCKS = 1; // Doors/trapdoors are commonly interacted at torso height.
export const DEFAULT_NAVIGATION_REPLAN_INTERVAL_MS = 400; // Replan at most every 400ms to react quickly while keeping CPU cost bounded on older laptops.
export const DEFAULT_NAVIGATION_MAX_SEARCH_RADIUS_BLOCKS = 48; // Limit A* search to nearby terrain to avoid expensive scans over unloaded distant chunks.
export const DEFAULT_NAVIGATION_MAX_EXPANDED_NODES = 2500; // Hard cap for A* node expansions to guarantee deterministic runtime per planning step.
export const DEFAULT_NAVIGATION_MAX_STEP_UP_BLOCKS = 1; // A standing player can step up one full block without jumping.
export const DEFAULT_NAVIGATION_MAX_STEP_DOWN_BLOCKS = 3; // Permit short drops while still avoiding deep falls during regular path traversal.
export const DEFAULT_NAVIGATION_GOAL_PROBE_RADIUS_BLOCKS = 2; // Probe around target for nearest standable cell when target itself is not standable.
export const DEFAULT_NAVIGATION_WAYPOINT_REACHED_DISTANCE_BLOCKS = 0.7; // Advance to next waypoint when close enough to prevent oscillation near cell centers.
export const DEFAULT_NAVIGATION_CHUNK_CACHE_LIMIT = 1024; // Keep at most 1024 decoded chunk columns (~16M blocks footprint before object overhead).
export const DEFAULT_NAVIGATION_CHUNK_READY_TIMEOUT_MS = 2000; // Fail fast if movement goal is active but chunk decoding never becomes ready within two seconds.
export const DEFAULT_NAVIGATION_SUBCHUNK_REQUEST_COLUMN_LIMIT = 96; // Request decoded subchunks for at most 96 columns per session to avoid network flooding while still covering nearby traversal space.
export const DEFAULT_NAVIGATION_SUBCHUNK_SECTION_COUNT_FALLBACK = 24; // Overworld height usually spans 24 sections (-64..319), used when server omits highest_subchunk_count.
export const DEFAULT_NAVIGATION_SUBCHUNK_MIN_SECTION_Y = 0; // Subchunk request origin uses section offsets from zero in current Bedrock packet format used by local worlds.
export const DEFAULT_NAVIGATION_SUBCHUNK_SECTION_COUNT_LIMIT = 32; // Protocol uses i8 offsets; cap section request count to a sane upper bound for current Bedrock world heights.
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
