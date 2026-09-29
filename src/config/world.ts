/**
 * World-wide constants. 1 world unit = 1 meter.
 * World coordinates run from 0 to WORLD_SIZE on X (east) and Z (south).
 */
export const WORLD_SIZE = 100_000; // 100 km
export const CHUNK_SIZE = 1_000; // 1 km
export const CHUNKS_PER_SIDE = WORLD_SIZE / CHUNK_SIZE; // 100

export const WORLD_SEED = 1337;
export const SEA_LEVEL = 0;

/**
 * Terrain shape, in meters. Scales are the size of one noise "feature"; they are
 * tuned to the world size so a 100 km world still holds several landmasses.
 */
export const TERRAIN = {
  continentScale: 30_000,
  mountainScale: 7_000,
  hillScale: 2_500,
  detailScale: 180,
  /** Land fades into ocean over this distance from the world edge. */
  coastWidth: 6_000,
  oceanFloor: -120,
} as const;

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

/**
 * Geomorphing: over the last MORPH_RANGE meters of a LOD's ring, vertices glide
 * to the next coarser LOD's shape, so the swap itself changes nothing visible.
 */
export const MORPH_RANGE = 400;

/** Normals sample heightAt() at this spacing for every LOD (the LOD 0 grid step), so shading doesn't pop. */
export const NORMAL_SAMPLE_STEP = 1_000 / 64;

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
  travelSpeed: 500, // m/s in fast-travel mode (F), to cross 100 km in ~3 minutes
} as const;

export const MINIMAP_RESOLUTION = 256;
