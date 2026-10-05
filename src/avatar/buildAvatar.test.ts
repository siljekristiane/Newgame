import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AVATAR } from '../config/world';
import { CATALOG } from '../wardrobe/catalog';
import { equipInOutfit } from '../wardrobe/unlocks';
import { animateAvatar, createAnimState } from './animate';
import { DEFAULT_APPEARANCE, HAIR_STYLES, type Appearance } from './appearance';
import { buildAvatar } from './buildAvatar';
import { PRESETS } from './presets';

function measure(a: Appearance, detail: 'high' | 'medium' = 'medium') {
  const av = buildAvatar(a, detail);
  av.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(av.group);
  let finite = true;
  av.group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const arr = (o.geometry as THREE.BufferGeometry).attributes.position!.array;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i]!)) finite = false;
  });
  av.dispose();
  return { box, finite, triangles: av.triangles };
}

describe('buildAvatar', () => {
  it('builds every starter look: feet on the ground, about AVATAR.height tall, within the triangle budget', () => {
    for (const p of PRESETS) {
      const { box, finite, triangles } = measure(p.appearance);
      expect(finite, p.id).toBe(true);
      expect(Math.abs(box.min.y), p.id).toBeLessThan(0.005);
      expect(box.max.y, p.id).toBeGreaterThan(AVATAR.height * 0.97);
      expect(box.max.y, p.id).toBeLessThan(AVATAR.height * 1.1);
      expect(triangles, p.id).toBeLessThan(120_000);
    }
  });

  it('stays under half a lamp post (~3,5 m)', () => {
    expect(measure(DEFAULT_APPEARANCE).box.max.y).toBeLessThan(3.5 / 2);
  });

  it('builds every hairstyle and every catalog item', () => {
    for (const h of HAIR_STYLES) expect(measure({ ...DEFAULT_APPEARANCE, hairStyle: h.id }).finite, h.id).toBe(true);
    for (const item of CATALOG) {
      const outfit = equipInOutfit(DEFAULT_APPEARANCE.outfit, item.slot, item);
      expect(measure({ ...DEFAULT_APPEARANCE, outfit }).finite, item.id).toBe(true);
    }
  });

  it('animates idle, walk, run, glide and jump without breaking the rig', () => {
    const av = buildAvatar(PRESETS[2]!.appearance);
    const s = createAnimState(1);
    for (const [speed, air] of [[0, 0], [5, 0], [30, 0], [400, 0], [3, 0.6]] as const) {
      for (let i = 0; i < 30; i++) animateAvatar(av.rig, s, 1 / 60, { speed, air });
      av.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(av.group);
      expect(Number.isFinite(box.max.y)).toBe(true);
    }
    av.dispose();
  });
});
