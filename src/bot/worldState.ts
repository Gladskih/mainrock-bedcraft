import type { Vector3 } from "../bedrock/joinClientHelpers.js";

export type BotWorldEntitySnapshot = {
  runtimeEntityId: string;
  username: string | null;
  position: Vector3 | null;
  updatedAtMs: number;
};

export type BotWorldLocalPlayerSnapshot = {
  runtimeEntityId: string | null;
  username: string | null;
  dimension: string | null;
  position: Vector3 | null;
};

export type BotWorldSnapshot = {
  updatedAtMs: number;
  localPlayer: BotWorldLocalPlayerSnapshot;
  entities: Record<string, BotWorldEntitySnapshot>;
};

export type BotWorldState = {
  getSnapshot: () => BotWorldSnapshot;
  setLocalIdentity: (runtimeEntityId: string | null, username: string | null) => void;
  setLocalPose: (dimension: string | null, position: Vector3 | null) => void;
  upsertEntity: (runtimeEntityId: string, username: string | null, position: Vector3 | null) => void;
  updateEntityPosition: (runtimeEntityId: string, position: Vector3) => void;
  removeEntity: (runtimeEntityId: string) => void;
};

type NowProvider = () => number;

const clonePosition = (position: Vector3 | null): Vector3 | null => {
  return position ? { x: position.x, y: position.y, z: position.z } : null;
};

const freezeSnapshot = (snapshot: BotWorldSnapshot): BotWorldSnapshot => {
  const frozenEntities = Object.fromEntries(Object.entries(snapshot.entities).map(([runtimeEntityId, entity]) => [
    runtimeEntityId,
    Object.freeze({
      runtimeEntityId: entity.runtimeEntityId,
      username: entity.username,
      position: clonePosition(entity.position),
      updatedAtMs: entity.updatedAtMs
    })
  ]));
  return Object.freeze({
    updatedAtMs: snapshot.updatedAtMs,
    localPlayer: Object.freeze({
      runtimeEntityId: snapshot.localPlayer.runtimeEntityId,
      username: snapshot.localPlayer.username,
      dimension: snapshot.localPlayer.dimension,
      position: clonePosition(snapshot.localPlayer.position)
    }),
    entities: Object.freeze(frozenEntities)
  });
};

const createEmptySnapshot = (updatedAtMs: number): BotWorldSnapshot => {
  return freezeSnapshot({
    updatedAtMs,
    localPlayer: {
      runtimeEntityId: null,
      username: null,
      dimension: null,
      position: null
    },
    entities: {}
  });
};

export const createBotWorldState = (now: NowProvider = () => Date.now()): BotWorldState => {
  let snapshot = createEmptySnapshot(now());
  return {
    getSnapshot: () => snapshot,
    setLocalIdentity: (runtimeEntityId, username) => {
      snapshot = freezeSnapshot({
        updatedAtMs: now(),
        localPlayer: {
          runtimeEntityId,
          username,
          dimension: snapshot.localPlayer.dimension,
          position: clonePosition(snapshot.localPlayer.position)
        },
        entities: snapshot.entities
      });
    },
    setLocalPose: (dimension, position) => {
      snapshot = freezeSnapshot({
        updatedAtMs: now(),
        localPlayer: {
          runtimeEntityId: snapshot.localPlayer.runtimeEntityId,
          username: snapshot.localPlayer.username,
          dimension,
          position: clonePosition(position)
        },
        entities: snapshot.entities
      });
    },
    upsertEntity: (runtimeEntityId, username, position) => {
      snapshot = freezeSnapshot({
        updatedAtMs: now(),
        localPlayer: snapshot.localPlayer,
        entities: {
          ...snapshot.entities,
          [runtimeEntityId]: {
            runtimeEntityId,
            username,
            position: clonePosition(position),
            updatedAtMs: now()
          }
        }
      });
    },
    updateEntityPosition: (runtimeEntityId, position) => {
      const existingEntity = snapshot.entities[runtimeEntityId];
      if (!existingEntity) return;
      snapshot = freezeSnapshot({
        updatedAtMs: now(),
        localPlayer: snapshot.localPlayer,
        entities: {
          ...snapshot.entities,
          [runtimeEntityId]: {
            runtimeEntityId: existingEntity.runtimeEntityId,
            username: existingEntity.username,
            position: clonePosition(position),
            updatedAtMs: now()
          }
        }
      });
    },
    removeEntity: (runtimeEntityId) => {
      if (!(runtimeEntityId in snapshot.entities)) return;
      const entities = { ...snapshot.entities };
      delete entities[runtimeEntityId];
      snapshot = freezeSnapshot({
        updatedAtMs: now(),
        localPlayer: snapshot.localPlayer,
        entities
      });
    }
  };
};
