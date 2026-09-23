import { useEffect, useRef } from 'react';
import { CHUNK_SIZE, MINIMAP_RESOLUTION, VIEW_RADIUS, WORLD_SIZE } from '../config/world';
import { useGameStore } from '../state/useGameStore';
import { km } from './format';

const SIZE = 200; // CSS px

/** The whole 500 km world. Click anywhere to teleport there. */
export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);
  const image = useGameStore((s) => s.minimap);
  const hud = useGameStore((s) => s.hud);
  const teleport = useGameStore((s) => s.teleport);

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
    ctx.strokeStyle = 'rgba(31, 26, 42, 0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, pz, Math.max(r, 3), 0, Math.PI * 2);
    ctx.stroke();

    // Player marker with heading.
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-hud.heading + Math.PI);
    ctx.fillStyle = '#f5d83a';
    ctx.strokeStyle = '#1f1a2a';
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
  }, [hud, image]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    teleport(((e.clientX - rect.left) / rect.width) * WORLD_SIZE, ((e.clientY - rect.top) / rect.height) * WORLD_SIZE);
  };

  return (
    <div className="dw-panel dw-minimap">
      <div className="dw-panel-title">Verdenskart</div>
      <canvas
        ref={canvas}
        style={{ width: SIZE, height: SIZE }}
        onClick={onClick}
        aria-label="Kart over hele verdenen. Klikk for å teleportere."
        role="img"
      />
      <div className="dw-caption">
        {image ? `500 × 500 km · klikk for å teleportere` : 'Tegner kart …'}
      </div>
      <div className="dw-caption">{km(hud.x, 1)} Ø · {km(hud.z, 1)} S</div>
    </div>
  );
}
