import { describe, expect, it } from 'vitest';
import { SPAWN_AREA } from '../../config/world';
import { groundHeightAt } from '../../world/ground';
import { nearestPath, plazaDistance } from '../stamps';
import { placeLamps } from './furniture';
import { spawnLayout } from './layout';

describe('spawn area lamps', () => {
  const layout = spawnLayout();
  const lamps = placeLamps(layout);

  it('line the paths and ring the plaza', () => {
    const onPlaza = lamps.filter((l) => plazaDistance(l.x, l.z) < 0);
    expect(onPlaza.length).toBeGreaterThan(4);
    expect(onPlaza.length).toBeLessThanOrEqual(SPAWN_AREA.plazaLamps);
    expect(lamps.length - onPlaza.length).toBeGreaterThan(50);
  });

  it('stand beside the path, not on it, on the rendered ground', () => {
    for (const l of lamps) {
      if (plazaDistance(l.x, l.z) < 0) continue;
      const d = nearestPath(l.x, l.z).distance;
      expect(d).toBeGreaterThan(SPAWN_AREA.pathWidth / 2);
      expect(d).toBeLessThan(SPAWN_AREA.lampOffset + 0.5);
      expect(l.y).toBeCloseTo(groundHeightAt(l.x, l.z), 6);
    }
  });
});
