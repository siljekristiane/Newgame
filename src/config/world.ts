/**
 * World-wide constants. 1 world unit = 1 meter.
 * World coordinates run from 0 to WORLD_SIZE on X (east) and Z (south).
 */
export const WORLD_SIZE = 500_000; // 500 km
export const CHUNK_SIZE = 1_000; // 1 km
export const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE; // 500

export const WORLD_SEED = 1337;
export const SEA_LEVEL = 0;

/** Where the player starts: the middle of the world. */
export const SPAWN = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 };

/**
 * Level of detail rings, by Chebyshev distance in chunks from the player's chunk.
 * `segments` is the grid resolution of one 1 km chunk at that level.
 * `props` says whether placeholder objects (cubes, spheres) are shown.
 */
export const LOD_LEVELS = [
  { maxDistance: 1, segments: 64, props: true }, // ~15.6 m per quad
  { maxDistance: 3, segments: 32, props: true }, // ~31 m
  { maxDistance: 6, segments: 16, props: false }, // ~62 m
  { maxDistance: 10, segments: 8, props: false }, // 125 m
] as const;

/** Chunks farther than this (in chunks) are never loaded. */
export const VIEW_RADIUS = LOD_LEVELS[LOD_LEVELS.length - 1]!.maxDistance;
/** Loaded chunks are only unloaded past this, so they don't flicker at the edge. */
export const UNLOAD_RADIUS = VIEW_RADIUS + 1;

/** Re-center the render origin when the player is this far from it (meters). */
export const REBASE_DISTANCE = 2_000;

/** How many chunk builds may be in flight at once, and meshes added per frame. */
export const MAX_INFLIGHT_BUILDS = 8;
export const MAX_MESH_UPLOADS_PER_FRAME = 4;
/** Extra meshes may be added while the frame has spent less than this (ms) on uploads. */
export const UPLOAD_BUDGET_MS = 3;

export const CAMERA = {
  near: 0.5,
  far: 14_000,
  fogNear: 3_000,
  fogFar: 10_500,
} as const;

export const PLAYER = {
  radius: 1,
  walkSpeed: 8, // m/s
  runSpeed: 40, // m/s with Shift
  travelSpeed: 1_500, // m/s in fast-travel mode (F), to cross 500 km in ~6 minutes
} as const;

export const MINIMAP_RESOLUTION = 256;
