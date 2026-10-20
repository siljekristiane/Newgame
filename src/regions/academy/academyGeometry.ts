import type * as THREE from 'three';
import { ACADEMY } from '../../config/world';
import { BUILDING_PARTS, disc, opening, Part, ring as turned, wallFrame, type BuildingPart, type V3 } from '../buildings/kitParts';
import { academyLayout } from './layout';

/**
 * The academy's shape, built in code in its own frame (layout.ts): origin at
 * the hall's centre on the pad (y = 0), +Z out of the front, X along the hall.
 * One geometry per surface, so each takes its own CC0 texture set: rubble
 * stone walls, slate roofs, dressed stone trim (plinth, quoins, cornices,
 * window and door surrounds, steps), the oak door and the window glass.
 *
 * UVs are in meters divided by ACADEMY.texScale, so the stone keeps one size
 * on every face. Windows and surrounds sit proud of the walls instead of being
 * cut in, which keeps the shape simple and cheap (~15 k triangles).
 */

export type AcademyPart = BuildingPart;
export const ACADEMY_PARTS = BUILDING_PARTS;

export interface AcademyGeometry {
  parts: Record<AcademyPart, THREE.BufferGeometry>;
  triangles: number;
  /** Highest point (tower roof tip), meters above the pad. */
  height: number;
}

export function createAcademyGeometry(): AcademyGeometry {
  const { hall, tower, door, texScale } = ACADEMY;
  const P: Record<AcademyPart, Part> = {
    wall: new Part(texScale.wall),
    roof: new Part(texScale.roof),
    trim: new Part(texScale.trim),
    door: new Part(texScale.door),
    glass: new Part(1),
  };
  const W = hall.width / 2;
  const D = hall.depth / 2;
  const top = hall.wallHeight;
  const base = hall.plinth;
  const sink = -1.5; // below the pad, so the blend never shows a gap

  // Plinth: dressed stone around the hall, a little proud of the walls.
  P.trim.box([-W - 0.25, sink, -D - 0.25], [W + 0.25, base, D + 0.25], ['-y']);

  // Hall walls (from the plinth up) and gables under the ridge along X.
  P.wall.quad([-W, base, D], [W, base, D], [W, top, D], [-W, top, D], [0, 0, 1]);
  P.wall.quad([W, base, -D], [-W, base, -D], [-W, top, -D], [W, top, -D], [0, 0, -1]);
  for (const s of [1, -1] as const) {
    const n: V3 = [s, 0, 0];
    P.wall.quad([s * W, base, -D], [s * W, base, D], [s * W, top, D], [s * W, top, -D], n);
    P.wall.flat([[s * W, top, -D], [s * W, top, D], [s * W, hall.ridge, 0]], n);
  }

  // Quoins: dressed blocks up each hall corner, alternately long and short on each face.
  // Trim under the eaves stops below the roof's underside (thickness + slope over its depth).
  const pitch = (hall.ridge - top) / D;
  const underEave = (out: number) => top - 0.25 - out * pitch - 0.02;
  const course = 0.55;
  const quoinTop = underEave(0.1);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const x = sx * W;
      const z = sz * D;
      for (let k = 0, y = base; y < quoinTop - 0.01; k++, y += course) {
        const y1 = Math.min(quoinTop, y + course - 0.04);
        const along = k % 2 === 0 ? 0.95 : 0.5;
        const across = k % 2 === 0 ? 0.5 : 0.95;
        // On the long wall (z face) and on the end wall (x face), standing 0.1 m proud.
        P.trim.box([Math.min(x, x - sx * along), y, Math.min(z, z + sz * 0.1)], [Math.max(x, x - sx * along), y1, Math.max(z, z + sz * 0.1)]);
        P.trim.box([Math.min(x, x + sx * 0.1), y, Math.min(z, z - sz * across)], [Math.max(x, x + sx * 0.1), y1, Math.max(z, z - sz * across)]);
      }
    }
  }

  // Cornice under the eaves on the long sides.
  const cornice = underEave(0.22);
  P.trim.box([-W - 0.2, cornice - 0.45, D - 0.05], [W + 0.2, cornice, D + 0.22], ['-z']);
  P.trim.box([-W - 0.2, cornice - 0.45, -D - 0.22], [W + 0.2, cornice, -D + 0.05], ['+z']);

  // Roof: two slate slopes with some thickness, the ridge along X.
  const o = hall.overhang;
  const rise = hall.ridge - top;
  const run = D;
  const drop = (o * rise) / run;
  const eaveY = top - drop;
  const thick = 0.25;
  const RX = W + o;
  for (const s of [1, -1] as const) {
    const slope = Math.hypot(rise, run);
    const n: V3 = [0, run / slope, (s * rise) / slope];
    const eave = s * (D + o);
    P.roof.quad([-RX, eaveY, eave], [RX, eaveY, eave], [RX, hall.ridge, 0], [-RX, hall.ridge, 0], n);
    // Underside and the eave's edge.
    P.roof.quad([-RX, eaveY - thick, eave], [-RX, hall.ridge - thick, 0], [RX, hall.ridge - thick, 0], [RX, eaveY - thick, eave], [-n[0], -n[1], -n[2]]);
    P.roof.quad([-RX, eaveY - thick, eave], [RX, eaveY - thick, eave], [RX, eaveY, eave], [-RX, eaveY, eave], [0, 0, s]);
    // Gable edges (verge).
    for (const sx of [1, -1] as const) {
      P.roof.quad([sx * RX, eaveY - thick, eave], [sx * RX, eaveY, eave], [sx * RX, hall.ridge, 0], [sx * RX, hall.ridge - thick, 0], [sx, 0, 0]);
    }
  }
  // Ridge cap.
  P.trim.box([-RX - 0.05, hall.ridge - 0.1, -0.22], [RX + 0.05, hall.ridge + 0.18, 0.22]);

  // Round tower on the front corner, with a cornice and a slate cone.
  const layout = academyLayout();
  const tx = layout.tower.x;
  const tz = layout.tower.z;
  const R = tower.radius;
  const seg = tower.segments;
  const ring = (part: Part, r0: number, r1: number, y0: number, y1: number) => turned(part, tx, tz, r0, r1, y0, y1, seg, R);
  ring(P.trim, R + 0.25, R + 0.25, sink, base);
  ring(P.wall, R, R, base, tower.wallHeight);
  ring(P.trim, R + 0.3, R + 0.3, tower.wallHeight, tower.wallHeight + 0.6);
  ring(P.trim, R, R + 0.3, tower.wallHeight - 0.3, tower.wallHeight);
  const coneBase = tower.wallHeight + 0.6;
  ring(P.roof, R + 0.55, 0.001, coneBase - 0.25, tower.top);
  ring(P.roof, R + 0.55, R + 0.55, coneBase - 0.45, coneBase - 0.25);
  // Flat soffit under the cone's overhang.
  disc(P.roof, tx, tz, R + 0.55, coneBase - 0.45, seg, false);
  // Finial.
  P.trim.box([tx - 0.08, tower.top - 0.2, tz - 0.08], [tx + 0.08, tower.top + 0.9, tz + 0.08]);

  // Windows: two rows on the long sides, one on each gable end, slits in the tower.
  const front = wallFrame([0, 0, D], [0, 0, 1]);
  const back = wallFrame([0, 0, -D], [0, 0, -1]);
  const right = wallFrame([W, 0, 0], [1, 0, 0]);
  const left = wallFrame([-W, 0, 0], [-1, 0, 0]);
  const rows = [
    { v: base + 1.4, w: 1.3, h: 2.6 },
    { v: base + 5.0, w: 1.2, h: 2.3 },
  ];
  for (const r of rows) {
    for (const u of [-4.5, 4.5, 8.5]) opening(P.glass, P.trim, front, u, r.v, r.w, r.h, 0.32);
    for (const u of [-8.5, -4.5, 0, 4.5, 8.5]) opening(P.glass, P.trim, back, u, r.v, r.w, r.h, 0.32);
    opening(P.glass, P.trim, right, 0, r.v, r.w, r.h, 0.32);
  }
  // A tall window in each gable, and one on the end behind the tower.
  opening(P.glass, P.trim, right, 0, top + 0.6, 1.1, 2.6, 0.3);
  opening(P.glass, P.trim, left, -2.5, base + 1.4, 1.3, 2.6, 0.32);
  opening(P.glass, P.trim, left, 0, top + 0.6, 1.1, 2.6, 0.3);
  // Tower slits facing away from the hall (angles in the tower's own ring).
  for (const [a, v] of [[Math.PI * 0.75, base + 2.2], [Math.PI * 0.35, base + 6.5], [Math.PI * 1.0, base + 10.5], [Math.PI * 0.6, base + 13]] as const) {
    const n: V3 = [Math.cos(a), 0, Math.sin(a)];
    opening(P.glass, P.trim, wallFrame([tx + n[0] * R, 0, tz + n[2] * R], n), 0, v, 0.55, 1.7, 0.22);
  }

  // Door: an arched oak door in a deep stone surround, with steps down to the pad.
  opening(P.door, P.trim, front, 0, base, door.width, door.height, 0.55, false);
  const stepDepth = 0.45;
  const stepRise = base / door.steps;
  for (let i = 0; i < door.steps; i++) {
    const zIn = D + 0.12 + (door.steps - 1 - i) * stepDepth;
    P.trim.box([-door.width / 2 - 0.8, sink, D], [door.width / 2 + 0.8, stepRise * (i + 1), zIn + stepDepth], ['-y']);
  }

  const parts = {} as Record<AcademyPart, THREE.BufferGeometry>;
  let triangles = 0;
  for (const k of ACADEMY_PARTS) {
    parts[k] = P[k].geometry();
    triangles += P[k].triangles;
  }
  return { parts, triangles, height: tower.top + 0.9 };
}
