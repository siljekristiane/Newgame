import { useEffect, useRef, useState } from 'react';
import { CHUNK_SIZE, VIEW_RADIUS, WORLD_SIZE } from '../config/world';
import { mapPalette } from '../design/tokens';
import { spawnLayout } from '../regions/spawn/layout';
import { useGameStore } from '../state/useGameStore';
import { km } from './format';

/** Grid line spacing on the big map, meters. */
const GRID = 10_000;

/**
 * The big world map (M): the whole 100 km with a 10 km grid, the player, the
 * loaded area and the spawn plaza. Hover shows coordinates; click teleports
 * there and closes the map. Esc or M closes it.
 */
export function BigMap() {
  const open = useGameStore((s) => s.bigMapOpen);
  const image = useGameStore((s) => s.bigMap ?? s.minimap);
  const sharp = useGameStore((s) => s.bigMap !== null);
  const hud = useGameStore((s) => s.hud);
  const teleport = useGameStore((s) => s.teleport);
  const setOpen = useGameStore((s) => s.setBigMapOpen);
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [size, setSize] = useState(600);

  useEffect(() => {
    if (!open) return;
    const fit = () => setSize(Math.floor(Math.min(window.innerHeight * 0.8, window.innerWidth * 0.8, 900)));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [open]);

  useEffect(() => {
    if (!image) return;
    const c = document.createElement('canvas');
    c.width = image.width;
    c.height = image.height;
    c.getContext('2d')!.putImageData(image, 0, 0);
    base.current = c;
  }, [image]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!open || !el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== size * dpr) el.width = el.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, size, size);
    if (base.current) ctx.drawImage(base.current, 0, 0, size, size);
    const s = size / WORLD_SIZE;

    // 10 km grid with labels along the top and left edges.
    ctx.strokeStyle = mapPalette.grid;
    ctx.fillStyle = mapPalette.label;
    ctx.lineWidth = 1;
    ctx.font = '600 11px Fredoka, sans-serif';
    for (let m = GRID; m < WORLD_SIZE; m += GRID) {
      const p = Math.round(m * s) + 0.5;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
      ctx.fillText(`${m / 1000}`, p + 3, 12);
      ctx.fillText(`${m / 1000}`, 3, p - 3);
    }

    // The spawn plaza.
    const { plaza } = spawnLayout();
    ctx.fillStyle = mapPalette.place;
    ctx.strokeStyle = mapPalette.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const hx = plaza.x * s;
    const hz = plaza.z * s;
    ctx.moveTo(hx, hz - 6);
    ctx.lineTo(hx + 6, hz);
    ctx.lineTo(hx, hz + 6);
    ctx.lineTo(hx - 6, hz);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Loaded area and the player.
    const px = hud.x * s;
    const pz = hud.z * s;
    ctx.strokeStyle = mapPalette.loaded;
    ctx.beginPath();
    ctx.arc(px, pz, (VIEW_RADIUS + 0.5) * CHUNK_SIZE * s, 0, Math.PI * 2);
    ctx.stroke();
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-hud.heading + Math.PI);
    ctx.fillStyle = mapPalette.marker;
    ctx.strokeStyle = mapPalette.ink;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [open, image, hud, size]);

  if (!open) return null;

  const toWorld = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * WORLD_SIZE, z: ((e.clientY - rect.top) / rect.height) * WORLD_SIZE };
  };

  return (
    <div className="dw-bigmap-backdrop" onClick={() => setOpen(false)}>
      <div className="dw-panel dw-bigmap" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Stort kart">
        <div className="dw-bigmap-title">
          <span className="dw-panel-title">Kart over verdenen</span>
          <button type="button" className="dw-btn dw-btn-sm" onClick={() => setOpen(false)}>
            <kbd>M</kbd> Lukk
          </button>
        </div>
        <canvas
          ref={canvas}
          style={{ width: size, height: size }}
          onMouseMove={(e) => setHover(toWorld(e))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => {
            const p = toWorld(e);
            teleport(p.x, p.z);
            setOpen(false);
          }}
          role="img"
          aria-label="Stort kart over hele verdenen. Klikk for å teleportere."
        />
        <div className="dw-caption">
          {hover ? `${km(hover.x, 1)} Ø · ${km(hover.z, 1)} S · klikk for å teleportere` : `Du er på ${km(hud.x, 1)} Ø · ${km(hud.z, 1)} S · lilla markør: startplassen`}
          {!sharp && ' · tegner skarpere kart …'}
        </div>
      </div>
    </div>
  );
}
