import { useGameStore } from '../state/useGameStore';
import { clockTime, compass, km, meters } from './format';
import { DebugPanel } from './DebugPanel';
import { BigMap } from './BigMap';
import { Compass } from './Compass';
import { Minimap } from './Minimap';
import { Wardrobe } from '../wardrobe/Wardrobe';
import { useWardrobeStore } from '../wardrobe/useWardrobeStore';

export function Hud() {
  const hud = useGameStore((s) => s.hud);
  const travel = useGameStore((s) => s.travelMode);
  const pointerLocked = useGameStore((s) => s.pointerLocked);
  const muted = useGameStore((s) => s.audio.muted);
  const toggleTravel = useGameStore((s) => s.toggleTravelMode);
  const minimapOpen = useGameStore((s) => s.minimapOpen);
  const positionOpen = useGameStore((s) => s.positionOpen);
  const toggleMinimap = useGameStore((s) => s.toggleMinimap);
  const togglePosition = useGameStore((s) => s.togglePosition);
  const toggleWardrobe = useWardrobeStore((s) => s.toggle);

  return (
    <div className="dw-hud">
      {positionOpen && (
        <div className="dw-panel dw-coords" aria-live="off">
          <div className="dw-panel-title dw-coords-title">
            <span>Posisjon</span>
            <button type="button" className="dw-btn dw-btn-sm" onClick={togglePosition} title="Skjul posisjonen">
              <kbd>P</kbd> Skjul
            </button>
          </div>
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
      )}

      <Compass />

      <Minimap />

      <BigMap />

      <DebugPanel />

      <Wardrobe />

      <div className="dw-panel dw-help">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gå</span>
        <span><kbd>Shift</kbd> løp</span>
        <span><kbd>Mellomrom</kbd> hopp</span>
        <span>{pointerLocked ? <><kbd>Esc</kbd> slipp musa</> : <>Klikk: styr kamera med musa · <kbd>Q</kbd><kbd>E</kbd> snu</>}</span>
        <span>Scroll: zoom</span>
        <span><kbd>M</kbd> kart</span>
        <button type="button" className="dw-btn dw-btn-sm" onClick={toggleWardrobe}>
          <kbd>K</kbd> Klesskap
        </button>
        <span><kbd>H</kbd> skjul paneler</span>
        {!minimapOpen && (
          <button type="button" className="dw-btn dw-btn-sm" onClick={toggleMinimap}>
            <kbd>N</kbd> Vis kart
          </button>
        )}
        {!positionOpen && (
          <button type="button" className="dw-btn dw-btn-sm" onClick={togglePosition}>
            <kbd>P</kbd> Vis posisjon
          </button>
        )}
        <span><kbd>U</kbd> lyd {muted ? 'av' : 'på'}</span>
        <span><kbd>T</kbd> si noe</span>
        <span><kbd>F3</kbd> ytelse</span>
        <button type="button" className={travel ? 'dw-btn dw-btn-primary' : 'dw-btn'} onClick={toggleTravel} aria-pressed={travel}>
          <kbd>F</kbd> Hurtigreise {travel ? 'på' : 'av'}
        </button>
      </div>
    </div>
  );
}
