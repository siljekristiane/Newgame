import { useGameStore } from '../state/useGameStore';
import { clockTime, compass, km, meters } from './format';
import { DebugPanel } from './DebugPanel';
import { BigMap } from './BigMap';
import { Compass } from './Compass';
import { Minimap } from './Minimap';

export function Hud() {
  const hud = useGameStore((s) => s.hud);
  const travel = useGameStore((s) => s.travelMode);
  const pointerLocked = useGameStore((s) => s.pointerLocked);
  const muted = useGameStore((s) => s.audio.muted);
  const toggleTravel = useGameStore((s) => s.toggleTravelMode);

  return (
    <div className="dw-hud">
      <div className="dw-panel dw-coords" aria-live="off">
        <div className="dw-panel-title">Posisjon</div>
        <dl>
          <dt>Øst (X)</dt><dd>{km(hud.x)}</dd>
          <dt>Sør (Z)</dt><dd>{km(hud.z)}</dd>
          <dt>Høyde</dt><dd>{meters(hud.y)}</dd>
          <dt>Retning</dt><dd>{compass(hud.heading)}</dd>
          <dt>Fart</dt><dd>{Math.round(hud.speed * 3.6).toLocaleString('nb-NO')} km/t</dd>
          <dt>Chunk</dt><dd>{hud.cx}, {hud.cz}</dd>
          <dt>Klokka</dt><dd>{clockTime(hud.hours)}</dd>
        </dl>
      </div>

      <Compass />

      <Minimap />

      <BigMap />

      <DebugPanel />

      <div className="dw-panel dw-help">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gå</span>
        <span><kbd>Shift</kbd> løp</span>
        <span><kbd>Mellomrom</kbd> hopp</span>
        <span>{pointerLocked ? <><kbd>Esc</kbd> slipp musa</> : <>Klikk: styr kamera med musa · <kbd>Q</kbd><kbd>E</kbd> snu</>}</span>
        <span>Scroll: zoom</span>
        <span><kbd>M</kbd> kart</span>
        <span><kbd>U</kbd> lyd {muted ? 'av' : 'på'}</span>
        <span><kbd>F3</kbd> ytelse</span>
        <button type="button" className={travel ? 'dw-btn dw-btn-primary' : 'dw-btn'} onClick={toggleTravel} aria-pressed={travel}>
          <kbd>F</kbd> Hurtigreise {travel ? 'på' : 'av'}
        </button>
      </div>
    </div>
  );
}
