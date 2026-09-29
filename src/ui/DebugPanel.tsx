import { LOD_LEVELS } from '../config/world';
import { applyView, VIEWS } from '../debug/views';
import { useGameStore } from '../state/useGameStore';

/** Budgets from CLAUDE.md. Over budget shows a warning, in words as well as colour. */
const BUDGET = { drawCalls: 500, triangles: 1_500_000, frameMs: 1000 / 60 };

const nb = (n: number, digits = 0) => n.toLocaleString('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function DebugPanel() {
  const d = useGameStore((s) => s.debug);
  const show = useGameStore((s) => s.showDebug);
  const geomorph = useGameStore((s) => s.geomorph);
  const setGeomorph = useGameStore((s) => s.setGeomorph);
  if (!show) return null;

  return (
    <div className="dw-panel dw-stats" aria-label="Ytelse">
      <div className="dw-panel-title">
        Ytelse <span className="dw-caption">F3 skjuler</span>
      </div>
      <dl>
        <dt>FPS</dt>
        <dd>{d.fps}</dd>
        <dt>Bildetid snitt/95 %</dt>
        <dd className={d.frameMsP95 > BUDGET.frameMs * 2 ? 'dw-warn' : undefined}>
          {nb(d.frameMs, 1)} / {nb(d.frameMsP95, 1)} ms
        </dd>
        <Row label="Draw calls" value={d.drawCalls} budget={BUDGET.drawCalls} />
        <Row label="Trekanter" value={d.triangles} budget={BUDGET.triangles} />
        <dt>Geometrier/teksturer</dt>
        <dd>
          {nb(d.geometries)} / {nb(d.textures)}
        </dd>
        <dt>Shadere</dt>
        <dd>{d.programs}</dd>
        {d.heapMb !== null && (
          <>
            <dt>JS-minne</dt>
            <dd>{nb(d.heapMb)} MB</dd>
          </>
        )}
        <dt>Chunks lastet/i kø</dt>
        <dd>
          {d.loadedChunks} / {d.pendingChunks}
        </dd>
        <dt>Per LOD</dt>
        <dd title={`Rutenett ${LOD_LEVELS.map((l) => l.segments).join('/')}`}>{LOD_LEVELS.map((_, i) => d.lodCounts[i] ?? 0).join(' / ')}</dd>
        <dt>Ferdig lastet etter</dt>
        <dd>{d.settleMs === null ? 'laster …' : `${nb(d.settleMs / 1000, 1)} s`}</dd>
      </dl>
      <label className="dw-toggle">
        <input type="checkbox" checked={geomorph} onChange={(e) => setGeomorph(e.target.checked)} /> Myke LOD-overganger
      </label>
      <div className="dw-views" role="group" aria-label="Faste kameravinkler">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" className="dw-btn dw-btn-sm" onClick={() => applyView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, budget }: { label: string; value: number; budget: number }) {
  const over = value > budget;
  return (
    <>
      <dt>{label}</dt>
      <dd className={over ? 'dw-warn' : undefined}>
        {nb(value)}
        {over && ' · over budsjett'}
      </dd>
    </>
  );
}
