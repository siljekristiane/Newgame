import { it } from 'vitest';
import { heightAt } from './world/terrain';
it('bench', () => { let s = 0; const t = performance.now(); for (let i = 0; i < 200000; i++) s += heightAt(30000 + i * 0.37, 50000 + i * 0.11); console.log('heightAt us/call', ((performance.now() - t) * 1000 / 200000).toFixed(3), s > 0); });
