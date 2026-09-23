# CLAUDE.md — Duskwood World

Et 3D open world-spill i nettleseren. Verdenen er **500 × 500 km** i ekte meter,
generert prosedyralt og strømmet inn i biter (chunks) rundt spilleren.

Nåværende fase: **teknisk fundament**. Ingen quests, plot, NPC-er eller
gameplay-mekanikker ennå. Legg ikke til slikt før det blir bedt om.

## Kommandoer

```bash
npm install        # installer avhengigheter
npm run dev        # utviklingsserver på http://localhost:5173
npm run build      # typesjekk + produksjonsbygg til dist/
npm run preview    # server dist/ lokalt
npm run typecheck  # bare TypeScript
npm test           # enhetstester (Vitest)
```

Før du sier at noe er ferdig: `npm run typecheck && npm test && npm run build`
skal gå grønt, og endringer i scenen skal sjekkes i en ekte nettleser.

## Tech stack

| Del | Valg | Merknad |
|---|---|---|
| Rendering | three.js | `MeshLambertMaterial` + `flatShading` for low-poly-stilen |
| React-binding | @react-three/fiber 9 | Ingen drei ennå; legg til bare ved behov |
| UI | React 19 + ren CSS | HUD ligger i DOM over canvas, ikke i 3D |
| State | zustand (UI) + muterbare moduler (per frame) | Se «State» under |
| Bygg | Vite 7 + TypeScript 5.9 (strict) | Vite 7/TS 5 fordi de kjører i StackBlitz WebContainers |
| Tester | Vitest | Rene funksjoner i `src/world/` testes |
| Bakgrunnsarbeid | Web Workers (ES-moduler) | Terreng og minikart bygges utenfor hovedtråden |

## Prosjektstruktur

```
src/
  main.tsx, App.tsx       Inngang: Canvas + HUD + input
  config/world.ts         ALLE verdenskonstanter (størrelse, chunk, LOD, kamera, fart)
  design/tokens.ts        Duskwood-fargepaletten (World-farger)
  state/
    runtime.ts            Muterbar per-frame-state: player, origin, cameraRig, input
    useGameStore.ts       zustand: HUD-snapshot, hurtigreise, minikart, teleport
  input/useControls.ts    Tastatur (event.code) og mus/scroll
  world/
    noise.ts              Seedet simplex-støy + hash (deterministisk)
    terrain.ts            heightAt(x, z) og colorAt(): verdenen som ren funksjon
    chunkMath.ts          Koordinater, chunk-nøkler, LOD-valg, ønsket chunk-sett
    buildChunk.ts         Bygger vertex-data for én chunk + props + minikart (ren)
    terrain.worker.ts     Worker som kaller buildChunk/buildMinimap
    workerPool.ts         Pool av workers, med reserve på hovedtråden
    ChunkManager.ts       Streaming: plan → dispatch → upload → unload
    *.test.ts             Enhetstester
  components/             R3F-komponenter: Scene, GameLoop, Terrain, Player,
                          FollowCamera, Sky, Water
  ui/                     HUD, minikart, formattering (norsk tallformat)
```

Nye systemer får sin egen mappe (`src/quests/`, `src/npc/` …) og kobles inn i
`GameLoop` eller `Scene`, ikke inn i terreng-koden.

## Arkitektur for 500 km-verdenen

### Koordinatsystemer (viktigst av alt)

- **1 enhet = 1 meter.** X = øst, Z = sør, Y = opp. Verden går fra 0 til 500 000 på X og Z.
- **Verdenskoordinater** lagres som vanlige JS-tall (float64). Presisjonen er
  under en mikrometer på 500 km, så spillerposisjon, lagring og logikk bruker alltid disse.
- **Render-koordinater** = verden − `origin`. GPU-en regner i float32, som bare
  har ~7 sifre: på 250 km blir det centimeter-hopp og skjelvende geometri.
  Derfor ser three.js aldri store tall.
- **Flytende origo** (`state/runtime.ts`): når spilleren er mer enn
  `REBASE_DISTANCE` (2 km) fra `origin`, flyttes origo til spilleren.
  - `Terrain` og `Water` flytter sin gruppe til `-origin` hver frame.
  - `Player` og `FollowCamera` regner ut `world - origin` selv.
  - Kameraet forskyves like mye som origo, så overgangen ikke synes.
- Vertex-posisjoner i en chunk er **lokale** (0–1000 m fra chunkens hjørne).
- Regel: **send aldri en verdenskoordinat direkte til et Object3D.** Trekk fra `origin`,
  eller legg objektet i en gruppe som allerede er forskjøvet.

### Chunking

- Chunk = 1 × 1 km (`CHUNK_SIZE`). Verden har 500 × 500 = 250 000 chunks, men bare
  ca. 320 er lastet om gangen (sirkel med radius `VIEW_RADIUS` = 10 chunks).
- Chunk-nøkkel: `"cx,cz"`. `worldToChunk()` gjør om fra meter til chunk.
- Terrenget er en **ren funksjon** (`heightAt`), så ingenting lagres: en chunk kan
  bygges på nytt når som helst og blir helt lik. Samme seed = samme verden overalt.
- Nabochunks deler kant-vertekser eksakt (testet), og **skjørt** (en ring av
  vertekser som henger ned langs kanten) skjuler sprekker mellom ulike LOD-er.

### LOD (level of detail)

Ring-avstand (Chebyshev, i chunks) fra spillerens chunk bestemmer oppløsning
(`LOD_LEVELS` i `config/world.ts`):

| LOD | Ringer | Rutenett per km² | Props |
|---|---|---|---|
| 0 | 0–1 | 64 × 64 (~16 m) | ja |
| 1 | 2–3 | 32 × 32 (~31 m) | ja |
| 2 | 4–6 | 16 × 16 (~62 m) | nei |
| 3 | 7–10 | 8 × 8 (125 m) | nei |

En chunk beholder gammelt mesh til ny LOD er klar, så det blir aldri hull.
Tåke (`CAMERA.fogNear/fogFar`) skjuler kanten ved 10 km.

### Streaming (`ChunkManager`)

1. **plan** (bare når spilleren bytter chunk): fjern chunks utenfor
   `UNLOAD_RADIUS` (frigjør GPU-minne med `dispose()`), lag kø av manglende og
   feil-LOD-chunks, nærmest først.
2. **dispatch**: maks `MAX_INFLIGHT_BUILDS` jobber ute hos workers samtidig.
3. **upload**: gjør worker-data om til `BufferGeometry`. Minst
   `MAX_MESH_UPLOADS_PER_FRAME` per frame, mer hvis det er tid igjen innen
   `UPLOAD_BUDGET_MS`.
4. Resultater som er utdaterte (spilleren har flyttet seg, eller en nyere LOD er
   bestilt) kastes.

Data sendes fra workers som **Transferable** typed arrays (ingen kopiering).
Hvis workers ikke kan starte (sandkasse/CSP), bygger `WorkerPool` på hovedtråden i stedet.

### Game loop

`GameLoop` er det eneste stedet state går fremover, i fast rekkefølge med
`useFrame(..., -1)`:
input → spillerbevegelse → rebase av origo → `ChunkManager.update` → HUD-snapshot (5 Hz).
Visuelle komponenter leser state etterpå med vanlig `useFrame` (prioritet 0).
Bruk aldri positiv `useFrame`-prioritet uten å ta over renderingen bevisst.

### State

- **Per frame** (posisjon, input, kamera): muterbare objekter i `state/runtime.ts`.
  Aldri React-state: det ville re-rendret 60 ganger i sekundet.
- **UI** (HUD-tall, toggles, minikart): zustand i `useGameStore`, oppdatert
  throttlet. Komponenter velger smale biter: `useGameStore((s) => s.hud)`.
- Handlinger som flytter spilleren (teleport) skriver til `runtime.player`;
  `GameLoop` oppdager hoppet og rebaser neste frame.

## Ytelse: begrensninger og løsninger

| Begrensning | Løsning her |
|---|---|
| float32 på GPU → skjelving langt fra origo | Flytende origo + lokale chunk-vertekser |
| Z-fighting over 14 km siktlinje | `logarithmicDepthBuffer: true`, near 0.5 m |
| Minne: 250 000 chunks passer ikke | Bare ~320 lastet; `dispose()` ved utlasting |
| Terrenggenerering blokkerer frames | Web Workers + Transferables |
| Opplastingstopper når mange chunks blir ferdige | Tidsbudsjett per frame |
| Mange draw calls | Delt materiale; props som `InstancedMesh` (2 per chunk) |
| Fjerne detaljer koster trekanter | LOD-ringer; props bare i LOD 0–1 |
| Stor fane på pause → enorm `delta` | `dt` klemmes til 0,1 s |
| Høy DPI | `dpr={[1, 1.75]}` |

Budsjett å holde seg under (mellomklasse-laptop, 60 FPS):
- ≤ 500 draw calls, ≤ 1,5 M trekanter synlig
- ≤ 2 ms på hovedtråden til streaming per frame
- Ingen allokering i `useFrame` i varme løkker (gjenbruk `Vector3` via `useRef`)

Neste steg når verdenen vokser: slå sammen far-LOD-chunks til større
«superchunks», dele props inn i én global `InstancedMesh` per type, og
LRU-cache av geometrier for å slippe å bygge chunks man nettopp forlot.

## Kodestandard

- TypeScript `strict` + `noUncheckedIndexedAccess`. Ingen `any`; bruk `!` bare
  når indeksen er bevist gyldig.
- Filer: komponenter `PascalCase.tsx`, moduler `camelCase.ts`, én hovedeksport per fil.
- **Konstanter bor i `config/world.ts`**, aldri magiske tall spredt i koden.
- **Farger kommer fra `design/tokens.ts`** (Duskwood Academy-designsystemet).
  HUD-CSS bruker `--tokens` i `styles.css`. Ingen nye hex-verdier uten å legge dem i tokens.
- Verdenslogikk i `src/world/` er **ren TypeScript uten React/three-avhengighet**
  der det går (unntak: `ChunkManager` lager `BufferGeometry`). Da kan den testes
  og kjøres i workers.
- Alt tilfeldig skal være **deterministisk** (seed + `hash2`), aldri `Math.random()`
  i verdensgenerering.
- Frigjør GPU-ressurser (`geometry.dispose()`, `material.dispose()`) når noe fjernes.
- Kommentarer på engelsk i koden; UI-tekst på norsk (bokmål), tall med `nb-NO`-format.
- Taster leses med `event.code` (fysisk posisjon), så WASD virker på norsk tastatur.
- Placeholders er enkle former (plan, kuber, sfærer) til ekte modeller kommer.

## Design

Utseendet følger **Duskwood Academy**-designsystemet: low-poly, flat shading,
skumringshimmel (`skyZenith` → `skyGlow`), furugrønt, sand, krystall-lilla og
lampegult. HUD bruker Dusk-temaet (mørkt glass), Fredoka for titler/tall og
Nunito for tekst. Tekst på HUD holder minst 4,5:1 kontrast.

## Kontroller

W A S D gå · Shift løp · Q/E eller dra med musa: snu kamera · scroll: zoom ·
F: hurtigreise (1,5 km/s) · klikk på minikartet: teleporter.
