import { useEffect, useRef } from 'react';
import { spawnLayout } from '../regions/spawn/layout';
import { cameraRig, player } from '../state/runtime';

/** Degrees of view across the compass strip. */
const SPAN = 150;
const WIDTH = 360; // CSS px
const MARKS: Array<[number, string]> = [
  [0, 'N'],
  [45, 'NØ'],
  [90, 'Ø'],
  [135, 'SØ'],
  [180, 'S'],
  [225, 'SV'],
  [270, 'V'],
  [315, 'NV'],
];

/**
 * Compass strip at the top: which way the camera looks, with a marker toward
 * the spawn plaza. Updated every animation frame straight from runtime state
 * (moving a CSS transform), so it never re-renders React.
 */
export function Compass() {
  const strip = useRef<HTMLDivElement>(null);
  const home = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const { plaza } = spawnLayout();
    let raf = 0;
    const pxPerDeg = WIDTH / SPAN;
    const tick = () => {
      // Camera looks along (-sin yaw, -cos yaw): bearing clockwise from north = -yaw.
      const bearing = (((-cameraRig.yaw * 180) / Math.PI) % 360 + 360) % 360;
      if (strip.current) strip.current.style.transform = `translateX(${-bearing * pxPerDeg}px)`;
      if (home.current) {
        const dx = plaza.x - player.x;
        const dz = plaza.z - player.z;
        const toHome = (Math.atan2(dx, -dz) * 180) / Math.PI;
        const rel = ((toHome - bearing + 540) % 360) - 180;
        const near = Math.hypot(dx, dz) < 30;
        home.current.style.transform = `translateX(${rel * pxPerDeg}px)`;
        home.current.style.opacity = near || Math.abs(rel) > SPAN / 2 ? '0' : '1';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Marks for three turns, so the strip can scroll across 0°/360° without a gap.
  const marks = [-360, 0, 360].flatMap((turn) =>
    Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => {
      const label = MARKS.find(([d]) => d === deg)?.[1];
      return (
        <span key={`${turn + deg}`} className={label ? 'dw-compass-mark dw-compass-label' : 'dw-compass-mark'} style={{ left: (turn + deg) * (WIDTH / SPAN) }}>
          {label ?? ''}
        </span>
      );
    }),
  );

  return (
    <div className="dw-compass" style={{ width: WIDTH }} role="img" aria-label="Kompass">
      <div className="dw-compass-strip" ref={strip}>
        {marks}
      </div>
      <div className="dw-compass-home" ref={home} title="Retning til startplassen" />
      <div className="dw-compass-needle" />
    </div>
  );
}
