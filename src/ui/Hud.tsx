import { LOD_LEVELS } from '../config/world';
import { useGameStore } from '../state/useGameStore';
import { compass, km, meters } from './format';
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

      <div className="dw-panel dw-stats">
        <div className="dw-panel-title">Ytelse</div>
        <dl>
          <dt>FPS</dt><dd>{hud.fps}</dd>
          <dt>Chunks lastet</dt><dd>{hud.loadedChunks}</dd>
          <dt>I kø</dt><dd>{hud.pendingChunks}</dd>
          {LOD_LEVELS.map((level, i) => (
            <FragmentRow key={i} label={`LOD ${i} (${level.segments}²)`} value={hud.lodCounts[i] ?? 0} />
          ))}
        </dl>
      </div>

      <div className="dw-panel dw-help">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gå</span>
        <span><kbd>Shift</kbd> løp</span>
        <span><kbd>Q</kbd><kbd>E</kbd> / dra med mus: snu kamera</span>
        <span>Scroll: zoom</span>
        <button type="button" className={travel ? 'dw-btn dw-btn-primary' : 'dw-btn'} onClick={toggleTravel} aria-pressed={travel}>
          <kbd>F</kbd> Hurtigreise {travel ? 'på' : 'av'}
        </button>
      </div>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
