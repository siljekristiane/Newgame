import { useGameStore } from '../state/useGameStore';
import { compass, km, meters } from './format';
import { DebugPanel } from './DebugPanel';
import { Minimap } from './Minimap';

export function Hud() {
  const hud = useGameStore((s) => s.hud);
  const travel = useGameStore((s) => s.travelMode);
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
        </dl>
      </div>

      <Minimap />

      <DebugPanel />

      <div className="dw-panel dw-help">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gå</span>
        <span><kbd>Shift</kbd> løp</span>
        <span><kbd>Q</kbd><kbd>E</kbd> / dra med mus: snu kamera</span>
        <span>Scroll: zoom</span>
        <span><kbd>F3</kbd> ytelse</span>
        <button type="button" className={travel ? 'dw-btn dw-btn-primary' : 'dw-btn'} onClick={toggleTravel} aria-pressed={travel}>
          <kbd>F</kbd> Hurtigreise {travel ? 'på' : 'av'}
        </button>
      </div>
    </div>
  );
}
