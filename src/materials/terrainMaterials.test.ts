import { describe, expect, it } from 'vitest';
import { CHUNK_SIZE, LOD_LEVELS, TERRAIN_TEXTURE } from '../config/world';
import { lodHasDetail } from './terrainMaterials';

describe('terrain detail budget', () => {
  it('only the nearest LOD runs the detail-texture shader', () => {
    expect(lodHasDetail(0)).toBe(true);
    for (let lod = 1; lod < LOD_LEVELS.length; lod++) expect(lodHasDetail(lod)).toBe(false);
  });

  it('fades out before the LOD 0 ring ends', () => {
    expect(TERRAIN_TEXTURE.fadeEnd).toBeLessThanOrEqual(LOD_LEVELS[0].maxDistance * CHUNK_SIZE);
    expect(TERRAIN_TEXTURE.fadeStart).toBeLessThan(TERRAIN_TEXTURE.fadeEnd);
  });

  it('tile sizes divide the UV wrap, so the floating-origin offset is exact', () => {
    for (const t of TERRAIN_TEXTURE.tileMeters) {
      expect(TERRAIN_TEXTURE.uvWrap % t).toBe(0);
      expect(TERRAIN_TEXTURE.uvWrap % (t * TERRAIN_TEXTURE.macroScale)).toBe(0);
    }
  });
});
