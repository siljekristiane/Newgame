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
  /** Domain warp: continents and ranges are bent by up to warpStrength meters, so they don't look like noise blobs. */
  warpScale: 12_000,
  warpStrength: 4_000,
  /** Height of the tallest ridges above the continent. */
  mountainHeight: 1_000,
  /** Land fades into ocean over this distance from the world edge. */
  coastWidth: 6_000,
  oceanFloor: -120,
} as const;

/**
 * Climate, which decides the biome and the surface materials.
 * Temperature is °C at sea level, falling LAPSE_RATE per meter of height.
 */
export const CLIMATE = {
  seaLevelTemperature: 6,
  /** Extra warmth toward the south (+Z), across the whole world. */
  northSouthGradient: 8,
  temperatureVariation: 3,
  temperatureScale: 40_000,
  lapseRate: 0.0065,
  moistureScale: 14_000,
  /** Snow lies below this temperature (fades over ±1.5 °C). */
  snowTemperature: 0,
  /** Slope (1 - normal.y) where bare rock takes over from soil. */
  rockSlope: 0.3,
  beachHeight: 5,
} as const;

/**
 * Day–night cycle. The sun rises in the east (+X) at 6, peaks in the south
 * (+Z) at 12 and sets in the west at 18.
 */
export const TIME = {
  startHour: 15,
  /** Real seconds per in-game hour: 60 = a full day in 24 minutes. */
  secondsPerHour: 60,
  /** Highest sun elevation at noon, degrees. */
  maxSunElevation: 55,
  sunIntensity: 3.2,
  moonIntensity: 0.25,
  /** Tone-mapping exposure at noon and at night. */
  exposureDay: 0.65,
  exposureNight: 0.9,
} as const;

/**
 * Water (step 4). A seabed depth map (depthTextureRes² texels over
 * depthTextureSize meters) is baked around the player in a worker and rebuilt
 * when the player moves rebuildDistance away from its centre.
 */
export const WATER = {
  depthTextureSize: 8_000,
  depthTextureRes: 512,
  rebuildDistance: 2_000,
  /** Depth is stored in one byte: 0.1 m steps up to 25.5 m. */
  maxDepth: 25.5,
  normalTextureSize: 256,
  /** Wave normal tiles, meters (powers of two, so the origin UV offset stays exact). */
  waveTiles: [32, 16] as const,
} as const;

/**
 * Trees, bushes and boulders (step 5). Candidates on a jittered grid of `cell`
 * meters; the densities are probabilities per cell (see world/vegetation.ts).
 * Kinds in order: conifer, broadleaf, bush, rock.
 */
export const VEGETATION = {
  cell: 10,
  /** Nothing grows below this height above sea level (beach, surf). */
  minHeight: 2.5,
  /** °C where trees stop (≈ 400 m up at the latitude of the spawn). */
  treeLineTemperature: 3.5,
  /** Tree probability per cell in open land and extra in forest. */
  openTrees: 0.012,
  forestTrees: 0.25,
  bushes: 0.03,
  rocks: 0.03,
  /** Share of each kind still shown at LOD 1 (the rest shrink away before the switch). */
  coarseKeep: [0.2, 0.2, 0.08, 0.2] as const,
  /** Radius around the spawn kept clear, so the player never starts inside a tree. */
  spawnClearing: 30,
  /** Size multiplier per kind (the meshes are ~13 m, ~11 m, ~1.5 m and ~2 m). */
  scale: [1, 1, 1, 1.3] as const,
  /** Light through leaves: extra sky light on all sides, and sun from behind. */
  foliageSkyLight: 0.6,
  foliageTransmission: 0.5,
  windSpeed: 0.9,
  /** Sway at the tip of a plant, meters (before its own scale). */
  windStrength: 0.12,
} as const;

/**
 * Grass tufts around the player (step 5b), placed on the GPU on a world grid of
 * `cell` meters out to `radius`, thinning out over the last 45 %.
 */
export const GRASS = {
  cell: 0.7,
  radius: 45,
  /** Tuft height before the per-tuft size variation, meters. */
  height: 0.55,
  /** Sway at the blade tips, meters. */
  windStrength: 0.12,
} as const;

/**
 * Weather (step 8): cloud cover drifts over `changeHours` of game time; rain
 * starts above `rainCover`; wind speed in m/s from calm to stormy.
 */
export const WEATHER = {
  changeHours: 8,
  rainCover: 0.8,
  windCalm: 1.5,
  windStorm: 14,
  /** Cloud layer height, the noise tile size on it, and how much faster than the wind it drifts (it is high up). */
  cloudHeight: 2_500,
  cloudTile: 12_000,
  cloudDriftScale: 3,
  /** Fog distances in heavy rain (clear weather uses CAMERA.fogNear/fogFar). */
  rainFogNear: 400,
  rainFogFar: 3_500,
} as const;

/** Rain and snow particles in a box around the camera (step 8). */
export const PRECIPITATION = {
  box: 40,
  count: 8_000,
  rainSpeed: 9, // m/s
  snowSpeed: 1.2,
  /** Snow flake size, meters. */
  snowSize: 0.12,
  /** °C at the player below which it snows instead of rains. */
  snowBelow: 0,
} as const;

export const SHADOWS = {
  /** Half-size of the sun's shadow box around the player, meters. */
  radius: 150,
  mapSize: 2048,
} as const;

/** Where the player starts: the middle of the world. */
export const SPAWN = { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 };

/**
 * The spawn area (step 6): a round plaza just north of the spawn point and
 * paths that wind out from it, following the gentlest ground. The terrain is
 * flattened under them (regions/stamps.ts); lengths in meters.
 */
export const SPAWN_AREA = {
  plaza: { x: WORLD_SIZE / 2, z: WORLD_SIZE / 2 - 28, radius: 22, blend: 30 },
  /** Start direction of each path, radians from north (−Z) clockwise. */
  pathHeadings: [0.35, 2.2, 4.1],
  pathLength: 1_400,
  /** Route-finding step and the spacing of the smoothed path points. */
  pathStep: 12,
  pathSpacing: 4,
  pathWidth: 3,
  /** Terrain eased toward the path level this far beyond its edge. */
  pathShoulder: 10,
  /** Plants keep this far from a path edge or the plaza. */
  plantClearance: 3,
  /** Lamps along the paths (meters apart, meters from the centre line) and round the plaza. */
  lampSpacing: 32,
  lampOffset: 2.3,
  plazaLamps: 10,
  /** Lamps are drawn within this distance of the player. */
  lampDrawDistance: 900,
} as const;

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

/**
 * Terrain detail textures (step 2c): one tile per material, in meters, all
 * powers of two so the floating-origin UV offset (origin mod 1024) stays exact.
 * MACRO_SCALE samples the same texture again at a larger scale to hide tiling.
 */
export const TERRAIN_TEXTURE = {
  size: 256,
  /** grass, dirt, rock, sand, snow */
  tileMeters: [4, 4, 8, 4, 8],
  macroScale: 8,
  /** Detail fades out between these distances (m); beyond, only the biome colour remains. Must stay inside the LOD 0 ring, so only LOD 0 pays for it. */
  fadeStart: 250,
  fadeEnd: 900,
  uvWrap: 1_024,
} as const;

/** Chunks farther than this (in chunks) are never loaded. */
export const VIEW_RADIUS = LOD_LEVELS[LOD_LEVELS.length - 1]!.maxDistance;
/** Loaded chunks are only unloaded past this, so they don't flicker at the edge. */
export const UNLOAD_RADIUS = VIEW_RADIUS + 1;

/** Re-center the render origin when the player is this far from it (meters). */
export const REBASE_DISTANCE = 2_000;

/** How many chunk builds may be in flight at once, and meshes added per frame. */
/** Chunks kept (with their GPU geometry) after they leave, for a quick return. */
export const CHUNK_CACHE_SIZE = 96;

export const MAX_INFLIGHT_BUILDS = 8;
export const MAX_MESH_UPLOADS_PER_FRAME = 4;
/** Extra meshes may be added while the frame has spent less than this (ms) on uploads. */
export const UPLOAD_BUDGET_MS = 3;

export const CAMERA = {
  near: 0.5,
  far: 14_000,
  fogNear: 2_000,
  fogFar: 10_500,
  /** How far the line of sight to the player stays above the ground, meters. */
  clearance: 1.2,
} as const;

export const PLAYER = {
  radius: 1,
  walkSpeed: 8, // m/s
  runSpeed: 40, // m/s with Shift
  travelSpeed: 500, // m/s in fast-travel mode (F), to cross 100 km in ~3 minutes
  /** How fast velocity approaches the wanted one (1/s): moving, and stopping. */
  acceleration: 10,
  deceleration: 14,
  /** Max turn toward the direction of travel, radians per second. */
  turnRate: 10,
  jumpSpeed: 6.5, // m/s up
  gravity: 20, // m/s², a bit more than real for a snappy jump
  /** Mouse look: radians per pixel of movement. */
  mouseSensitivity: 0.0025,
} as const;

/**
 * Quality presets (step 10, F3). `dprMax` caps the pixel ratio; the rest
 * switch features on. The first choice is detected from the GPU name.
 */
export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY: Record<QualityLevel, { dprMax: number; shadows: boolean; textures: boolean; vegetation: boolean; grass: boolean }> = {
  low: { dprMax: 1, shadows: false, textures: false, vegetation: true, grass: false },
  medium: { dprMax: 1.25, shadows: true, textures: true, vegetation: true, grass: false },
  high: { dprMax: 1.75, shadows: true, textures: true, vegetation: true, grass: true },
};

export const MINIMAP_RESOLUTION = 256;
/** The big map (M): 512² texels over 100 km, ~200 m each. */
export const BIG_MAP_RESOLUTION = 512;
