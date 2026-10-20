import type { BuildingSpec } from './buildingKit';

/**
 * Building designs made with the kit (buildingKit.ts), placed round the spawn
 * plaza by BUILDINGS.sites (placements.ts). Sizes in meters; a lamp post is
 * ~3.7 m and the avatar 1.6 m.
 */
export interface BuildingDesign {
  id: string;
  name: string;
  spec: BuildingSpec;
}

/** The academy's original hall (24 × 12 m, ridge 14.5 m), as first built. */
const ACADEMY_HALL = { x: 0, z: 0, length: 24, width: 12, floors: 2, floorHeight: 4.05, pitch: 5.5 / 6, door: { side: 'front' as const } };

export const DESIGNS: readonly BuildingDesign[] = [
  {
    id: 'academy-extended',
    name: 'Akademiet, utbygd',
    spec: {
      wings: [
        { ...ACADEMY_HALL, windows: { front: [-4.5, 4.5, 8.5], back: [-8.5, -4.5, 0, 4.5, 8.5], left: [-2.5], right: [0] } },
        // New three-storey wing running back from the east end: an L round a yard.
        { x: 7.5, z: -14.5, angle: Math.PI / 2, length: 19, width: 9, floors: 3, floorHeight: 3.6, pitch: 0.95, dormers: { sides: ['front'], at: [-5, 0, 5] } },
      ],
      // The tower climbs a storey higher and gets a steeper spire.
      towers: [{ x: -12, z: 6, shape: 'round', size: 3.6, height: 21, roof: 'cone', roofHeight: 8.5 }],
    },
  },
  {
    id: 'library',
    name: 'Biblioteket',
    spec: {
      wings: [{ x: 0, z: 0, length: 18, width: 13, floors: 3, floorHeight: 4.2, roof: 'hip', pitch: 0.75, door: { side: 'front' }, dormers: { sides: ['front', 'back'], at: [-4, 4] } }],
      towers: [{ x: 9, z: 6.5, shape: 'round', size: 2.3, height: 17.5, roof: 'cone', roofHeight: 5.5 }],
    },
  },
  {
    id: 'dormitory',
    name: 'Sovesalen',
    spec: {
      wings: [{ x: 0, z: 0, length: 34, width: 10, floors: 4, floorHeight: 3.3, pitch: 1.0, door: { side: 'front' }, dormers: { sides: ['front', 'back'], at: [-12, -6, 6, 12] } }],
      towers: [
        { x: -17, z: 5, shape: 'square', size: 2.6, height: 18, roof: 'pyramid', roofHeight: 5 },
        { x: 17, z: 5, shape: 'square', size: 2.6, height: 18, roof: 'pyramid', roofHeight: 5 },
      ],
    },
  },
  {
    id: 'belltower',
    name: 'Klokketårnet',
    spec: {
      wings: [
        { x: -6.1, z: 0, length: 6, width: 5, floors: 1, floorHeight: 3.4, pitch: 1.0 },
        { x: 6.1, z: 0, length: 6, width: 5, floors: 1, floorHeight: 3.4, pitch: 1.0 },
      ],
      towers: [{ x: 0, z: 0, shape: 'square', size: 3.2, height: 24, roof: 'pyramid', roofHeight: 7, belfry: true, passage: 'z' }],
    },
  },
  {
    id: 'cottage',
    name: 'Småhus (1 etasje)',
    spec: { wings: [{ x: 0, z: 0, length: 10, width: 7, floors: 1, floorHeight: 3.4, pitch: 1.05, door: { side: 'front', width: 1.6, height: 2.8, steps: 2 } }] },
  },
  {
    id: 'house',
    name: 'Småhus (2 etasjer)',
    spec: { wings: [{ x: 0, z: 0, length: 9, width: 8, floors: 2, floorHeight: 3.3, pitch: 1.0, door: { side: 'front', u: -1.5, width: 1.6, height: 2.8, steps: 2 }, dormers: { sides: ['front'], at: [1.8] } }] },
  },
  {
    id: 'workshop',
    name: 'Verksted (L-form)',
    spec: {
      wings: [
        { x: 0, z: 0, length: 12, width: 7, floors: 1, floorHeight: 3.6, pitch: 1.0, door: { side: 'front', u: 2, width: 2.2, height: 3, steps: 2 } },
        { x: -4.5, z: -6.5, angle: Math.PI / 2, length: 7, width: 6, floors: 2, floorHeight: 3.2, pitch: 1.0 },
      ],
    },
  },
];
