import { useState } from 'react';
import { EYE_COLORS, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type Appearance } from '../avatar/appearance';
import { BODY_IDS, BODY_MODELS } from '../avatar/models';
import { PRESETS } from '../avatar/presets';
import { AvatarPreview } from './AvatarPreview';
import { itemsInSlot, itemById, REQUIRED_SLOTS, SLOTS, type ClothingItem, type Slot } from './catalog';
import { COINS, equipInOutfit, itemStatus, unownedInOutfit } from './unlocks';
import { useWardrobeStore } from './useWardrobeStore';

type Tab = 'start' | 'look' | Slot;

/**
 * The wardrobe (K): a 3D preview to turn and zoom, the starter looks (once),
 * body and hair, and a tab per clothing slot. Locked items can be tried on but
 * not saved; buyable ones show their price.
 */
export function Wardrobe() {
  const open = useWardrobeStore((s) => s.open);
  return open ? <WardrobeDialog /> : null;
}

function WardrobeDialog() {
  const saved = useWardrobeStore((s) => s.appearance);
  const progress = useWardrobeStore((s) => s.progress);
  const starterChosen = useWardrobeStore((s) => s.starterChosen);
  const { setOpen, saveAppearance, buy, chooseStarter } = useWardrobeStore.getState();
  const [draft, setDraft] = useState<Appearance>(saved);
  const [tab, setTab] = useState<Tab>(starterChosen ? 'look' : 'start');

  const tryingOn = unownedInOutfit(draft.outfit, progress);
  const tabs: Array<{ id: Tab; label: string }> = [
    ...(starterChosen ? [] : [{ id: 'start' as const, label: 'Startfigur' }]),
    { id: 'look', label: 'Utseende' },
    ...SLOTS,
  ];

  const body = BODY_MODELS[draft.body];
  // Rigged .glb bodies wear their own clothes and hair for now.
  const fixedLook = body.kind === 'glb' ? `${body.name} har egne klær og hår. Valgene her gjelder den tegnede figuren.` : null;

  const wear = (slot: Slot, item: ClothingItem | null, color?: string) => setDraft((d) => ({ ...d, outfit: equipInOutfit(d.outfit, slot, item, color) }));

  return (
    <div className="dw-ward-backdrop" role="dialog" aria-modal="true" aria-label="Klesskap">
      <div className="dw-panel dw-ward">
        <div className="dw-ward-head">
          <div className="dw-panel-title">Klesskap</div>
          <div className="dw-ward-coins">
            {progress.coins.toLocaleString('nb-NO')} {COINS.label}
          </div>
          <button type="button" className="dw-btn dw-btn-sm" onClick={() => setOpen(false)}>
            <kbd>Esc</kbd> Lukk
          </button>
        </div>

        <div className="dw-ward-body">
          <div className="dw-ward-stage">
            <AvatarPreview appearance={draft} />
            <div className="dw-caption">Dra for å snu · scroll eller klyp for å zoome</div>
          </div>

          <div className="dw-ward-side">
            <div className="dw-ward-tabs" role="tablist">
              {tabs.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'dw-btn dw-btn-sm dw-btn-primary' : 'dw-btn dw-btn-sm'} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div className="dw-ward-list">
              {tab === 'start' && (
                <>
                  <p className="dw-ward-note">Velg én startfigur. Du får klærne, og etterpå kan du endre alt som du vil.</p>
                  <div className="dw-ward-grid">
                    {PRESETS.map((p) => (
                      <div key={p.id} className="dw-ward-card">
                        <div className="dw-ward-swatches">
                          {[p.appearance.skin, p.appearance.hairColor, p.appearance.eyes].map((c, i) => (
                            // Hair and eyes may share a colour: key by position.
                            <span key={i} className="dw-ward-swatch" style={{ background: c }} />
                          ))}
                        </div>
                        <strong>{p.name}</strong>
                        <span className="dw-ward-state">{p.mood}</span>
                        <div className="dw-ward-actions">
                          <button type="button" className="dw-btn dw-btn-sm" onClick={() => setDraft(p.appearance)}>
                            Prøv
                          </button>
                          <button
                            type="button"
                            className="dw-btn dw-btn-sm dw-btn-primary"
                            onClick={() => {
                              chooseStarter(p.id);
                              setDraft(p.appearance);
                              setTab('look');
                            }}
                          >
                            Velg
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'look' && (
                <>
                  <div className="dw-ward-label">Figur</div>
                  <div className="dw-ward-pills">
                    {BODY_IDS.map((id) => (
                      <button key={id} type="button" className={draft.body === id ? 'dw-btn dw-btn-sm dw-btn-primary' : 'dw-btn dw-btn-sm'} aria-pressed={draft.body === id} onClick={() => setDraft((d) => ({ ...d, body: id }))}>
                        {BODY_MODELS[id].name}
                      </button>
                    ))}
                  </div>
                  {fixedLook && <p className="dw-ward-note">{fixedLook}</p>}
                  <Swatches label="Hud" value={draft.skin} options={SKIN_TONES} onPick={(skin) => setDraft((d) => ({ ...d, skin }))} />
                  <Swatches label="Øyne" value={draft.eyes} options={EYE_COLORS} onPick={(eyes) => setDraft((d) => ({ ...d, eyes }))} />
                  <div className="dw-ward-label">Frisyre</div>
                  <div className="dw-ward-pills">
                    {HAIR_STYLES.map((h) => (
                      <button key={h.id} type="button" className={draft.hairStyle === h.id ? 'dw-btn dw-btn-sm dw-btn-primary' : 'dw-btn dw-btn-sm'} onClick={() => setDraft((d) => ({ ...d, hairStyle: h.id }))}>
                        {h.name}
                      </button>
                    ))}
                  </div>
                  <Swatches label="Hårfarge" value={draft.hairColor} options={HAIR_COLORS} onPick={(hairColor) => setDraft((d) => ({ ...d, hairColor }))} />
                </>
              )}

              {tab !== 'start' && tab !== 'look' && fixedLook && <p className="dw-ward-note">{fixedLook}</p>}
              {tab !== 'start' && tab !== 'look' && (
                <div className="dw-ward-grid">
                  {!REQUIRED_SLOTS.includes(tab) && (
                    <div className={draft.outfit[tab] ? 'dw-ward-card' : 'dw-ward-card dw-ward-card-on'}>
                      <span className="dw-ward-swatch dw-ward-none" />
                      <strong>Ingen</strong>
                      <div className="dw-ward-actions">
                        <button type="button" className="dw-btn dw-btn-sm" onClick={() => wear(tab, null)} aria-pressed={!draft.outfit[tab]}>
                          Ta av
                        </button>
                      </div>
                    </div>
                  )}
                  {itemsInSlot(tab).map((item) => {
                    const status = itemStatus(item, progress);
                    if (status.state === 'hidden') return null;
                    const worn = draft.outfit[tab]?.id === item.id;
                    const color = (worn && draft.outfit[tab]?.color) || item.params.color;
                    return (
                      <div key={item.id} className={worn ? 'dw-ward-card dw-ward-card-on' : 'dw-ward-card'}>
                        <span className="dw-ward-swatch" style={{ background: color }} />
                        <strong>{item.name}</strong>
                        <span className={status.state === 'owned' ? 'dw-ward-state' : 'dw-ward-state dw-ward-locked'}>
                          {status.state === 'locked' ? `Låst: ${status.reason}` : status.state === 'owned' ? (worn ? 'På deg' : 'Din') : status.reason}
                        </span>
                        {worn && item.colors && (
                          <div className="dw-ward-swatches">
                            {item.colors.map((c) => (
                              <button key={c} type="button" className={c === color ? 'dw-ward-dot dw-ward-dot-on' : 'dw-ward-dot'} style={{ background: c }} aria-label={`Farge ${c}`} onClick={() => wear(tab, item, c)} />
                            ))}
                          </div>
                        )}
                        <div className="dw-ward-actions">
                          <button type="button" className="dw-btn dw-btn-sm" onClick={() => wear(tab, item)} aria-pressed={worn}>
                            {status.state === 'owned' ? 'Ta på' : 'Prøv'}
                          </button>
                          {(status.state === 'buyable' || status.state === 'tooExpensive') && (
                            <button type="button" className="dw-btn dw-btn-sm dw-btn-primary" disabled={status.state !== 'buyable'} onClick={() => buy(item.id)}>
                              Kjøp
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="dw-ward-foot">
              {tryingOn.length > 0 && (
                <p className="dw-ward-note dw-ward-locked">
                  Du prøver {tryingOn.map((id) => itemById(id)?.name ?? id).join(', ')}. Kjøp eller ta av for å lagre.
                </p>
              )}
              <div className="dw-ward-actions">
                <button type="button" className="dw-btn" onClick={() => setOpen(false)}>
                  Avbryt
                </button>
                <button
                  type="button"
                  className="dw-btn dw-btn-primary"
                  disabled={tryingOn.length > 0}
                  onClick={() => {
                    if (saveAppearance(draft)) setOpen(false);
                  }}
                >
                  Lagre utseende
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Swatches({ label, value, options, onPick }: { label: string; value: string; options: readonly string[]; onPick: (c: string) => void }) {
  return (
    <>
      <div className="dw-ward-label">{label}</div>
      <div className="dw-ward-swatches">
        {options.map((c) => (
          <button key={c} type="button" className={c === value ? 'dw-ward-dot dw-ward-dot-on' : 'dw-ward-dot'} style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={c === value} onClick={() => onPick(c)} />
        ))}
      </div>
    </>
  );
}
