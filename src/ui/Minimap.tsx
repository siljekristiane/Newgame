import { useEffect, useRef } from 'react';
import { CHUNK_SIZE, MINIMAP_RESOLUTION, VIEW_RADIUS, WORLD_SIZE } from '../config/world';
import { mapPalette } from '../design/tokens';
import { useGameStore } from '../state/useGameStore';
import { km } from './format';

const SIZE = 200; // CSS px

/** The whole world. Click anywhere to teleport there. */
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const image = useGameStore((s) => s.minimap);
  const hud = useGameStore((s) => s.hud);
  const teleport = useGameStore((s) => s.teleport);
  const open = useGameStore((s) => s.minimapOpen);
  const toggle = useGameStore((s) => s.toggleMinimap);
  const openBig = useGameStore((s) => s.setBigMapOpen);

  useEffect(() => {
    if (!image) return;
    const c = document.createElement('canvas');
    c.width = c.height = MINIMAP_RESOLUTION;
    c.getContext('2d')!.putImageData(image, 0, 0);
    base.current = c;
  }, [image]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== SIZE * dpr) {
      el.width = el.height = SIZE * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (base.current) ctx.drawImage(base.current, 0, 0, SIZE, SIZE);

    const scale = SIZE / WORLD_SIZE;
    const px = hud.x * scale;
    const pz = hud.z * scale;

    // Loaded area (view radius).
    const r = (VIEW_RADIUS + 0.5) * CHUNK_SIZE * scale;
    ctx.strokeStyle = mapPalette.loaded;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, pz, Math.max(r, 3), 0, Math.PI * 2);
    ctx.stroke();

    // Player marker with heading.
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-hud.heading + Math.PI);
    ctx.fillStyle = mapPalette.marker;
    ctx.strokeStyle = mapPalette.ink;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [hud, image, open]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    teleport(((e.clientX - rect.left) / rect.width) * WORLD_SIZE, ((e.clientY - rect.top) / rect.height) * WORLD_SIZE);
  };

  // Hidden: gone completely; the help line offers to bring it back.
  if (!open) return null;

  return (
    <div className="dw-panel dw-minimap">
      <div className="dw-minimap-title">
        <span className="dw-panel-title">Verdenskart</span>
        <span className="dw-minimap-actions">
          <button type="button" className="dw-btn dw-btn-sm" onClick={() => openBig(true)} title="Stort kart">
            <kbd>M</kbd>
          </button>
          <button type="button" className="dw-btn dw-btn-sm" onClick={toggle} title="Skjul kartet">
            <kbd>N</kbd> Skjul
          </button>
        </span>
      </div>
      <canvas
        ref={canvas}
        style={{ width: SIZE, height: SIZE }}
        onClick={onClick}
        aria-label="Kart over hele verdenen. Klikk for å teleportere."
        role="img"
      />
      <div className="dw-caption">
        {image ? `${WORLD_SIZE / 1000} × ${WORLD_SIZE / 1000} km · klikk for å teleportere` : 'Tegner kart …'}
      </div>
      <div className="dw-caption">{km(hud.x, 1)} Ø · {km(hud.z, 1)} S</div>
    </div>
  );
}
