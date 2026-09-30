# CLAUDE.md — Duskwood World

Et 3D open world-spill i nettleseren. Verdenen er **100 × 100 km** i ekte meter,
generert prosedyralt og strømmet inn i biter (chunks) rundt spilleren.
(Den var 500 km; brukeren valgte 100 km for å forenkle realistisk grafikk.)

Nåværende fase: **visuell og teknisk oppgradering, område for område**, mot en
nær realistisk stil (se «Kunstretning»). Ingen quests, plot, NPC-historier eller
gameplay-mekanikker ennå. Legg ikke til slikt før det blir bedt om.

Arbeidsmåte brukeren har bedt om: forklar kort før en større endring, gjør én
avgrenset endring om gangen, test, oppsummer, og vent på tilbakemelding før neste
store steg. Ikke bytt prosjektnavn eller identitet, og ikke fjern fungerende
systemer uten begrunnelse og godkjenning.

## Kommandoer

```bash
npm install        # installer avhengigheter
npm run dev        # utviklingsserver på http://localhost:5173
npm run build      # typesjekk + produksjonsbygg til dist/
npm run preview    # server dist/ lokalt
npm run typecheck  # TypeScript (app + e2e)
npm run lint       # ESLint
npm test           # enhetstester (Vitest, src/**/*.test.ts)
npm run check      # lint + typecheck + test + build
npm run e2e        # nettlesertester (Playwright) mot produksjonsbygget
npm run measure    # målinger + skjermbilder av de faste vinklene → measurements/
```

Playwright trenger Chromium: `npx playwright install chromium`, eller sett
`PW_CHROMIUM_PATH` til en installert Chromium (i Claude-skyen:
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`).

Før du sier at noe er ferdig: `npm run check` og `npm run e2e` skal gå grønt, og
endringer i scenen skal sjekkes i en ekte nettleser. CI (`.github/workflows/ci.yml`)
kjører det samme ved hver push.

### Måle før og etter

- **F3** viser ytelsespanelet: FPS, bildetid (snitt og 95 %), draw calls,
  trekanter, geometrier, teksturer, shadere, JS-minne, chunks per LOD og hvor
  lenge strømmingen brukte. Rødt = over budsjett (se «Ytelse»).
- **Faste kameravinkler** (`src/debug/views.ts`): spawn, coast, shore (strand,
  fra steg 4), valley, mountain, edge. Åpnes med `#v-<id>` i URL-en (f.eks. `#v-coast`) eller
  knappene i F3-panelet. Samme vinkel før og etter = sammenlignbare bilder.
- `npm run measure` skriver tall og skjermbilder til `measurements/<tid>/`.
  Referansen før fase 2 ligger i `docs/measurements/baseline/`. En større visuell
  endring skal måles og sammenlignes med forrige måling i oppsummeringen.
- `window.__duskwood` (`src/debug/testApi.ts`) er testkroken e2e bruker:
  `setView`, `isSettled`, `debug`, `hud`. Den leser bare state og flytter
  spilleren til faste vinkler.
- FPS målt med programvare-rendering (SwiftShader, som i skyen og CI) er ikke
  representativ. Draw calls, trekanter, minne og innlastingstid er det.

## Tech stack

| Del | Valg | Merknad |
|---|---|---|
| Rendering | three.js | Terreng: `MeshStandardMaterial` (PBR) med glatte normaler og geomorphing, i `src/materials/` |
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
  debug/                  Faste kameravinkler, bildetidsmåler, testkrok (window.__duskwood)
  materials/              Materialer og shader-tillegg (terreng med geomorphing, planter)
  vegetation/             Prosedyrale plante- og steinmesher (three.js)
  regions/                Håndlagde områder: stempling i terrenget + spawn/ (plass, stier)
  player/                 Bevegelsesmodell (ren, testet)
  weather/                Værmodell, skystøy, regn og snø
  world/
    noise.ts              Seedet simplex-støy + hash (deterministisk)
    naturalTerrain.ts     naturalHeightAt(x, z): terrengformen uten regioner
    terrain.ts            heightAt(x, z): naturlig terreng med regionene stemplet inn
    biomes.ts             Klima (temperatur, fuktighet) → biom → materialvekter og farge
    terrainTextures.ts    Prosedyrale, flisbare detaljteksturer (5 materialer) + normal maps
    timeOfDay.ts          Sol, måne, himmel- og lysfarger som ren funksjon av klokkeslett
    ground.ts             groundHeightAt / gridHeightAt: høyden på trekantene som tegnes
    chunkMath.ts          Koordinater, chunk-nøkler, LOD-valg, ønsket chunk-sett
    buildChunk.ts         Bygger vertex-data for én chunk + planter + minikart (ren)
    vegetation.ts         Hvor trær, busker og steiner står (ren, deterministisk)
    water.ts              Havbunnskart og bølge-normaler (ren)
    grass.ts              Bakkekart for gresset rundt spilleren (ren)
    terrain.worker.ts     Worker som kaller buildChunk/buildMinimap
    workerPool.ts         Pool av workers, med reserve på hovedtråden
    ChunkManager.ts       Streaming: plan → dispatch → upload → unload
    *.test.ts             Enhetstester
  components/             R3F-komponenter: Scene, GameLoop, Terrain, TerrainTextures,
                          Atmosphere (himmel, sol, måne, stjerner, tåke), Player,
                          FollowCamera, Water, DebugProbe
  ui/                     HUD, minikart, F3-panel, formattering (norsk tallformat)
e2e/                      Playwright: smoke.spec.ts (hver endring), measure.spec.ts
docs/measurements/        Lagrede målinger (baseline = før fase 2)
```

Nye systemer får sin egen mappe (`src/quests/`, `src/npc/` …) og kobles inn i
`GameLoop` eller `Scene`, ikke inn i terreng-koden.

## Arkitektur for verdenen

### Koordinatsystemer (viktigst av alt)

- **1 enhet = 1 meter.** X = øst, Z = sør, Y = opp. Verden går fra 0 til 100 000 på X og Z.
- **Verdenskoordinater** lagres som vanlige JS-tall (float64). Presisjonen er
  langt under en millimeter på 100 km, så spillerposisjon, lagring og logikk bruker alltid disse.
- **Render-koordinater** = verden − `origin`. GPU-en regner i float32, som bare
  har ~7 sifre: 50 km ut blir det millimeter-hopp som gir skjelvende skygger,
  kamera og fysikk.
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

- Chunk = 1 × 1 km (`CHUNK_SIZE`). Verden har 100 × 100 = 10 000 chunks, men bare
  ca. 350 er lastet om gangen (sirkel med radius `VIEW_RADIUS` = 10 chunks).
- Terrengets form styres av `TERRAIN` i `config/world.ts`: kontinenter og
  fjellkjeder er bøyd med domain warping (`warpScale`/`warpStrength`), fjellene
  er ridged multifractal (skarpe rygger, myke dalbunner, som erosjon), og åsene
  dempes nær kysten.
- **Klima og overflate** (`world/biomes.ts`, konstanter i `CLIMATE`):
  temperatur = grunntemperatur + varmere mot sør + støy − 6,5 °C per km høyde;
  fuktighet fra støy (litt våtere i lavlandet). `biomeAt` gir ocean, beach,
  grassland, dryland, forest, alpine eller snow. `surfaceAt` gir vekter for fem
  materialer (grass, dirt, rock, sand, snow, sum = 1) ut fra klima, høyde og
  helning (stein i bratt terreng, snø under 0 °C, sand ved havet), pluss `lush`
  (tørt → frodig gress). Farger i `terrainPalette` (`design/tokens.ts`). I dag blir
  vektene til vertex-farger; steg 2c bruker dem til å blande teksturer, og
  vegetasjon (steg 5) skal plasseres etter `biomeAt`.
- Chunk-nøkkel: `"cx,cz"`. `worldToChunk()` gjør om fra meter til chunk.
- Terrenget er en **ren funksjon** (`heightAt`), så ingenting lagres: en chunk kan
  bygges på nytt når som helst og blir helt lik. Samme seed = samme verden overalt.
- **Bakkehøyde:** `heightAt` er den glatte funksjonen terrenget samples fra.
  Det som tegnes er trekanter mellom rutenettpunktene, og mellom punktene
  avviker de (opptil ~10 m på skarpe rygger). Alt som står på bakken bruker
  derfor `groundHeightAt` (LOD 0, der spilleren alltid står) eller
  `gridHeightAt(x, z, segments)` (objekter i en chunk av gitt LOD). Aldri
  `heightAt` for plassering. Testet mot selve meshet, både i enhetstest og med
  en stråle i nettleseren (`__duskwood.groundCheck()`).
- Nabochunks deler kant-vertekser eksakt (testet), og **skjørt** (en ring av
  vertekser som henger ned langs kanten) skjuler sprekker mellom ulike LOD-er.

### LOD (level of detail)

Ring-avstand (Chebyshev, i chunks) fra spillerens chunk bestemmer oppløsning
(`LOD_LEVELS` i `config/world.ts`):

| LOD | Ringer | Rutenett per km² | Planter |
|---|---|---|---|
| 0 | 0–1 | 64 × 64 (~16 m) | alle |
| 1 | 2–3 | 32 × 32 (~31 m) | utvalg |
| 2 | 4–6 | 16 × 16 (~62 m) | nei |
| 3 | 7–10 | 8 × 8 (125 m) | nei |

En chunk beholder gammelt mesh til ny LOD er klar, så det blir aldri hull.
Tåke (`CAMERA.fogNear/fogFar`) skjuler kanten ved 10 km.

**Geomorphing** (`materials/terrainMaterials.ts`): hver vertex har også høyde,
normal og farge slik de ser ut på neste, grovere LOD (`morphHeight`,
`morphNormal`, `morphColor`, regnet ut i `buildChunk`). De siste
`MORPH_RANGE` meterne (400 m) før en LOD-rings ytterkant glir verteksen over
til den grove formen (Chebyshev-avstand til spilleren, samme form som ringene).
Når chunken byttes, er den allerede lik det nye meshet: ingen hopp, og kanten
mot neste ring er helt morphet, så heller ingen sprekker. Props morpher med
(`aMorphDelta` per instans). Målt: et LOD-bytte endrer 1,0 % av pikslene med
morph mot 2,0 % uten (e2e-testen «LOD swaps do not pop»). Kan slås av i F3.

**Detaljteksturer** (steg 2c, `world/terrainTextures.ts` + `materials/terrainMaterials.ts`):
fem prosedyrale, flisbare teksturer (gress, jord, stein, sand, snø) lages i en
worker ved oppstart (~1 s) og lastes opp som `DataArrayTexture`. Albedo er en
*detaljfaktor* med snitt 1,0 som ganges med biomfargen, så farger, morph og
minikart stemmer; i tillegg normal map og ruhet. Per piksel samples bare de to
sterkeste materialene (den tredje vekten trekkes fra, så rangbytter er sømløse);
stein er triplanar. UV er verdensrom via `uvOffset = origin mod 1024`
(flisstørrelser er toerpotenser). Detaljene toner ut mellom `fadeStart` og
`fadeEnd` (250–900 m), som ligger innenfor LOD 0, så **bare LOD 0-materialet har
detaljshaderen**; LOD 1–3 og «av»-bryteren i F3 bruker en ren shader som koster
det samme som før (testet). Vekter morpher som farger (`surfaceWeights`, `morphWeights`).

**Normaler** regnes fra `heightAt` med fast avstand (`NORMAL_SAMPLE_STEP`) for
alle LOD-er, så lyset er likt der LOD-er møtes. **Terrenget tegnes bare fra
forsiden** (dobbeltsidig terreng lekker mørke baksider langs silhuetter);
skjørtene har trekanter i begge retninger og samme normal og farge som kanten.

### Lys, himmel og døgn (steg 3)

- **Klokke:** `runtime.clock` (timer 0–24), går med `TIME.secondsPerHour`
  (60 s = én spilltime) i `GameLoop`; start `TIME.startHour` (15). F3 har
  glidebryter og «Stopp tiden»; HUD viser klokka.
- **`world/timeOfDay.ts`** (ren, testet): solen står opp i øst (+X) kl. 6, står
  høyest i sør (+Z) kl. 12 (`maxSunElevation`) og går ned i vest kl. 18. Gir
  sol-/månelys, farger på senit, horisont, himmellys og bakkerefleks, stjerner
  og eksponering, blandet etter solhøyde (dag, gyllen time, skumring, natt).
  Farger i `atmosphere` (`design/tokens.ts`).
- **`components/Atmosphere.tsx`:** three.js `Sky` (fysisk basert) som følger
  kameraet, blandet over i en mørk gradient om natten (shader-tillegg); sol og
  måne som `DirectionalLight`; `HemisphereLight` med blekt himmellys; stjerner;
  lineær tåke med horisontfargen (skjuler kanten ved 10 km); AgX-tonemapping med
  eksponering etter tid på døgnet.
- **Skygger:** solen kaster skygge i en boks på ±`SHADOWS.radius` (150 m) rundt
  spilleren, festet til teksel-rutenettet i verdensrom så de ikke flimrer. Bare
  objekter og spilleren kaster skygge; terrenget mottar. Terreng som skygger for
  terreng over kilometer krever en annen teknikk (f.eks. horisont-kart) og er ikke
  gjort. Kan slås av i F3.

### Vann (steg 4)

- **`components/Water.tsx`:** ett plan over hele verden i havnivå, med egen
  `ShaderMaterial` (tåke og logaritmisk dybde fra three.js' shader-biter).
- **Havbunnskart** (`world/water.ts`, `buildSeabedDepth`): vanndybde fra
  `heightAt` på et 512² rutenett over 8 × 8 km rundt spilleren, én byte per
  teksel (0,1 m, maks 25,5 m, `WATER` i `config/world.ts`). Bygges i en worker og
  på nytt når spilleren er 2 km fra sentrum; gammelt kart vises til nytt er klart.
  Utenfor kartet regnes vannet som dypt.
- **Shaderen:** farge fra grunt til dypt (`waterPalette`), klart i grunna så
  sanden synes, skum der dybden går mot 0 (brutt opp av bølgehøyden), to
  bølge-normalkart som driver hver sin vei (32 og 16 m, UV-forskyvning
  origo mod 1024 som terrengteksturene), himmelrefleks med Fresnel (farger fra
  `timeOfDay`), solglitter, og roligere bølger på avstand så det ikke flimrer.
- Ingen ekte speiling eller refraksjon ennå (krever ekstra render-pass).

### Vegetasjon (steg 5)

- **Plassering** (`world/vegetation.ts`, konstanter i `VEGETATION`): fire arter
  (gran/furu, løvtre, busk, stein). Et grovt tetthetsrutenett per chunk (16²)
  regner sannsynlighet per art fra klima, overflatevekter og helning: trær under
  tregrensen (`treeLineTemperature`, ca. 400 m ved spawn), tett i fuktig skog,
  spredt i åpent land; bartrær i kaldt klima, løvtrær der det er varmt; busker i
  tørrere, åpent land; steiner der det er stein, ikke i stup. Kandidater på et
  rutenett med tilfeldig forskyvning (`cell` = 10 m), én hash per rute velger art.
  Ingenting under 2,5 m over havet, og en lysning rundt spawn.
- **LOD:** hvilke planter som finnes avhenger bare av chunken. LOD 0 viser alle,
  LOD 1 et utvalg (`coarseKeep`) med grovere mesher. Planter som neste LOD ikke
  har, krymper bort mens chunken morpher (`fade`), så ingenting popper; LOD 2–3
  har ingen planter. Testet i `vegetation.test.ts`.
- **Mesher** (`vegetation/plantGeometry.ts`): stablede kjegler med hengende kant
  (bartre), klumpete kuler (løvtre, busk), fasettert kule (stein), med
  vertex-farger og `sway`. Delt per LOD; hver chunk har bare sine
  instans-attributter.
- **Materiale** (`materials/plantMaterial.ts`): `MeshStandardMaterial` med
  farge per instans, vind (sving + flimring, fase fra verdensposisjon), LOD-morph
  og lys gjennom løvet (himmellys og sol bakfra), så trær i motlys ikke blir svarte.
- **Gress (steg 5b):** tuster innen `GRASS.radius` (45 m) rundt spilleren i én
  draw call (`components/Grass.tsx`, `materials/grassMaterial.ts`). Ingen
  instans-data: shaderen finner rutens verdensposisjon fra `gl_InstanceID`, og en
  heltalls-hash av ruten gir forskyvning, vinkel, størrelse og om den vokser, så
  tustene står stille når rutenettet følger spilleren. Høyden gjenskaper LOD
  0-trekanten fra et bakkekart (`world/grass.ts`: høyder for spillerens chunk og
  naboene, pluss gressfarge i sRGB og tetthet), nøyaktig som `gridHeightAt`
  (testet). Bygges i en worker når spilleren bytter chunk. Normalen peker opp, så
  gresset lyses som bakken; Lambert (ingen spekulær glans på tynne strå).
- Neste: tekstur på løv/bark, impostorer for skog på avstand.

### Startområdet (steg 6)

- **Regioner** (`src/regions/`): håndlagde områder presset inn i det naturlige
  terrenget. `world/naturalTerrain.ts` er terrenget uten regioner;
  `heightAt` (`world/terrain.ts`) = `stampHeight(naturalHeightAt)`, så alt som
  bruker `heightAt` (chunks, bakkehøyde, vann, gress) ser det samme.
- **Oppsett** (`regions/spawn/layout.ts`, `SPAWN_AREA`): en rund plass (22 m)
  like nord for spawn, i snitthøyden av bakken under, og tre stier som går ca.
  1,4 km ut. Stien velger for hvert steg retningen som klatrer minst, trekkes
  mot startretningen og vandrer litt; så avrundes den (Chaikin), deles opp hver
  4 m og får en glattet høydeprofil. Deterministisk, bygges én gang per tråd.
- **Stempling** (`regions/stamps.ts`): plassen flates helt ut med myk overgang
  (30 m); langs stiene dras bakken mot stiens høyde ut til 10 m forbi kanten.
  Segmentene ligger i et rutenett (64 m), så et oppslag sjekker bare nære biter;
  utenfor områdets boks koster det én sammenligning. Testet.
- **Flater** (`regions/spawn/meshes.ts`, `SpawnArea.tsx`): stiene er bånd og
  plassen en skive som ligger 4 cm over LOD 0-bakken (`groundHeightAt` i hver
  vertex), med myke alfa-kanter, prosedyral grus/brostein
  (`regions/spawn/textures.ts`) og uttoning 350–550 m unna (der terrenget
  begynner å morphe). Vertekser er relative til plassen; gruppen står på
  plass − origo.
- **Planter og gress** holder seg unna: `clearing()` for trær/busker/steiner,
  og en bytemaske (2 m per teksel) i gress-patchen (`rasterizeClearing`).
- **Møbler (6b)** (`regions/spawn/furniture.ts`, `props.ts`, `SpawnProps.tsx`):
  totrinns fontene (lathe) med vann og en lilla krystall på toppen (lyser mer om
  kvelden, med ett punktlys), og lamper rundt plassen og langs stiene hver
  32 m på vekselvis side, med armen over stien (`lampSpacing`, `lampOffset`).
  Lampene er instansiert (stolpe + lanterne), tennes fra gyllen time
  (`sunElevation`), og har glød (additive punkter) og lyskjegler på bakken
  (additive rutenett som følger bakken). Ingen ekte lys per lampe: det ville
  kostet i hver shader. Lamper krymper bort 630–900 m unna (bakken morpher der).
- Akademibygningen fra planen venter på brukerens beskjed (bygninger skal være
  CC0 etter ordre).

### Bevegelse og kamera (steg 7)

- **Bevegelse** (`player/movement.ts`, ren og testet): farten nærmer seg ønsket
  fart eksponentielt (`PLAYER.acceleration`/`deceleration`, mindre grep i
  lufta), figuren snur seg mot bevegelsesretningen med begrenset fart
  (`turnRate`), oppover går saktere (ned til 40 %), og Mellomrom hopper
  (`jumpSpeed`, `gravity`). Tilstanden ligger i `runtime.motion`; `GameLoop`
  kaller `stepMovement` og setter `player.y` = bakke + hopphøyde.
- **Mus:** et klikk i spillet låser pekeren (pointer lock), og musa snur da
  kameraet (`mouseSensitivity`) til Esc. Uten lås (eller om nettleseren nekter)
  virker dra med musa som før. HUD viser hint etter tilstand (`pointerLocked`).
- **Kamera** (`FollowCamera`): sikten fra spillerens hode til kameraet sjekkes
  mot bakken i fire punkter og kameraet heves så linja går minst
  `CAMERA.clearance` over bakken; bakker og rygger kommer ikke lenger mellom.
- Figuren er fortsatt plassholder (kule + sekk): figurer kommer som CC0-modell
  når brukeren ber om det, med animasjon da.

### Vær og skyer (steg 8)

- **Værmodell** (`weather/weather.ts`, ren og testet): skydekke som glatt støy
  over spilltid (`clock.elapsed`, `WEATHER.changeHours`), kvadrert så fint vær er
  vanligst (ca. halve tiden klart, ~9 % nedbør); nedbør over `rainCover`; vind
  som dreier sakte og blåser hardere i dårlig vær. `GameLoop` oppdaterer
  `runtime.weather`. F3 og testkroken kan låse været (Skifter/Klart/Skyet/Regn).
  e2e og måling låser det til klart.
- **Skylag** (i himmelshaderen, `Atmosphere.tsx`): et plan `cloudHeight` oppe med
  flislagt skystøy (`weather/clouds.ts`, Worley + fbm) i tre skalaer, terskel
  etter skydekke, mørkere der det er tykt, lysere mot sola, tonet ut mot
  horisonten; driver med vinden og forskyves med kameraets verdensposisjon.
  Overskyet legger et grått slør over hele himmelen (skjuler solskiva).
- **Lys og tåke:** sola dempes (opptil 70 %), himmellyset blir gråere og litt
  sterkere, tåka blir grå og trekker seg inn i regn (`rainFogNear/Far`).
- **Vind:** `plantWind.strength` fra vindstyrken skalerer svingingen i trær og
  gress (bare utslaget; fasen endres ikke, så ingenting hopper).
- **Nedbør** (`weather/Precipitation.tsx`, `PRECIPITATION`): 8 000 partikler i en
  40 m boks rundt kameraet, animert i shaderen: regn som streker langs
  fallretningen, snø som myke punkter der det er under 0 °C hos spilleren.
  Forflytningen summeres på CPU-en (float64), så vindskifter ikke får dråpene
  til å hoppe, og de står stille i verden når du går gjennom dem.

### UI (steg 9)

- **Kompass** (`ui/Compass.tsx`) øverst i midten: retningen kameraet ser, med
  en lilla markør mot startplassen. Oppdateres hvert bilde med
  `requestAnimationFrame` direkte fra `runtime` (CSS-transform), uten React.
- **Minikart** kan skjules med **N** (eller knappen), og **M** åpner det store
  kartet (`ui/BigMap.tsx`): hele verden med 10 km-rutenett, spilleren,
  innlastet område og startplassen; koordinater ved hover, klikk teleporterer.
  Esc eller M lukker. Kartet slipper musepekeren (pointer lock) når det åpnes.
  Et skarpere kart (`BIG_MAP_RESOLUTION` = 512) lages i workeren etter minikartet.
- **Ytelsespanelet** (F3) er skjult som standard; `npm run measure` slår det på
  for skjermbildene. Kartfarger kommer fra `mapPalette` i `design/tokens.ts`.

### Streaming (`ChunkManager`)

1. **plan** (bare når spilleren bytter chunk): fjern chunks utenfor
   `UNLOAD_RADIUS` (frigjør GPU-minne med `dispose()`), og chunks utenfor
   ønsket sirkel som ikke er grove (rester etter lange hopp). Lag så kø av
   manglende og feil-LOD-chunks, nærmest først.
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
| Minne: 10 000 chunks passer ikke | Bare ~350 lastet; `dispose()` ved utlasting |
| Terrenggenerering blokkerer frames | Web Workers + Transferables |
| Opplastingstopper når mange chunks blir ferdige | Tidsbudsjett per frame |
| Mange draw calls | Delt materiale; planter som `InstancedMesh` (4 per chunk, én per art) |
| Fjerne detaljer koster trekanter | LOD-ringer; planter bare i LOD 0–1, grovere mesh og færre i LOD 1 |
| Stor fane på pause → enorm `delta` | `dt` klemmes til 0,1 s |
| Høy DPI | `dpr={[1, 1.75]}` |

Målt referanse (`docs/measurements/baseline/`, før fase 2): 24–148 draw calls
og 78–136 k trekanter i bildet (frustum culling fjerner det meste bak kameraet),
ca. 350–400 chunks lastet, 10–11 s til ferdig strømmet verden ved første
innlasting i programvare-rendering.

Etter steg 2a (`docs/measurements/step-2a/`): samme draw calls, ca. 10 % flere
trekanter (skjørt i begge retninger), 5–8 MB mer JS-minne (morph-attributter),
10,1 s innlasting.

Etter steg 2b (`docs/measurements/step-2b/`): 24–147 draw calls, 84–160 k
trekanter, 11,2 s innlasting (klima og biomer per vertex i workerne). Terrenget
endret form, så kyst-, dal- og fjellvinklene ble flyttet; sammenlign dem med
2a som nytt utgangspunkt, ikke som samme sted.

Etter steg 2c (`docs/measurements/step-2c/`, teksturer på): samme draw calls og
trekanter som 2b, 2 teksturer. I programvare-rendering (SwiftShader) koster
detaljshaderen mye: ~1 000 ms per bilde mot ~420 ms uten, og ferdig strømming tar
16–44 s fordi nettleseren venter på hvert bilde. Det sier lite om ekte
skjermkort (~9 teksturoppslag per piksel er vanlig for terreng), men bør måles på
ekte maskinvare. Derfor kjører e2e med teksturer av, unntatt første test
(`openGame(page, hash, { textures })` i `e2e/helpers.ts`); `measure` har dem på.
Strømmingen er dessuten løsrevet fra bildefrekvensen: workerne fylles på så snart
en jobb er ferdig, og trege bilder får større opplastingsbudsjett.

Etter steg 3 (`docs/measurements/step-3/`, kl. 15, teksturer og skygger på):
samme draw calls, 11 shadere (himmel, stjerner, skyggedybde). `time-07/12/15/18/23.jpg`
viser samme vinkel gjennom døgnet. e2e og measure stopper klokka på 15:00 for
sammenlignbare bilder; e2e slår av skygger og teksturer unntatt i første test.

Etter steg 4 (`docs/measurements/step-4/`): samme draw calls og trekanter
(vannet er fortsatt ett plan), 3 teksturer til (havbunn, bølger, reserve),
2–5 MB mer JS-minne. Ny vinkel `shore`.

Etter steg 5 (`docs/measurements/step-5/`, vegetasjon på): 148–174 draw
calls, 0,3–0,9 M trekanter (skog ved spawn og strand er tyngst), 34–66 MB
JS-minne. Planter som krymper bort før neste LOD tegnes ikke når hele chunken er
forbi morph-sonen (sortert sist i instans-bufferen). e2e slår av vegetasjon
unntatt i første test (`openGame(..., { vegetation })`); F3 har bryter.
Merk: `npm run measure` gjenbruker en kjørende `vite preview` på port 4173, så
kjør `npm run build` først hvis en slik server går.

Etter steg 5b (`docs/measurements/step-5b/`): +1 draw call og ~150 k
trekanter for gresset (0,23–1,06 M totalt), 2 teksturer til.

Etter steg 6 (`docs/measurements/step-6a/`, `step-6b/`): +5 draw calls og
+28 k trekanter ved spawn (fontene, lamper, flater), 13 teksturer, 29 shadere
(krystallens punktlys gir egne varianter av materialene).

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
- Trær, busker og steiner er prosedyrale low-poly-mesher (`src/vegetation/`); spilleren er fortsatt en enkel form til en ekte figur kommer.

## Kunstretning og design

**Valgt retning: C · nær realistisk** (brukerens valg). Fysisk basert lys og
himmel, PBR-materialer med normal maps, dempede naturfarger, dis over fjell.
Høyest detalj nær spilleren, optimalisert på avstand. «Høy detalj» betyr ikke
maks polygoner overalt: prioriter lys, materialer, silhuetter og teksturer.

Dagens low-poly/flat shading er et mellomstadium som byttes ut steg for steg.
Duskwood-paletten (`design/tokens.ts`) beholdes for stemning (gyllen time,
krystall-lilla, lampegult) og for HUD. HUD bruker Dusk-temaet (mørkt glass),
Fredoka for titler/tall og Nunito for tekst, med minst 4,5:1 kontrast.

### Innhold: prosedyralt først

- **Alt lages prosedyralt i kode** der det går: terreng, teksturer, gress,
  stein, himmel, vann, vær, vegetasjon.
- **Gratis CC0-pakker** (f.eks. Quaternius, Kenney, Poly Haven, ambientCG)
  brukes bare der de er klart bedre: **dyr, figurer og bygninger**, og **bare når
  brukeren ber om det**.
- Hver ekstern fil føres i `CREDITS.md` med kilde og lisens. Repoet er
  offentlig: ingen betalte eller ikke-frie filer i repoet.

Plattform: bare desktop-nettlesere (Chrome, Firefox, Safari) med tastatur og mus.
Mobil støttes ikke. Renderer: WebGL2 (materialkoden samles slik at WebGPU kan
vurderes senere).

## Kontroller

W A S D gå · Shift løp · Mellomrom hopp · klikk: styr kamera med musa (Esc slipper) · Q/E eller dra: snu kamera · scroll: zoom ·
F: hurtigreise (500 m/s) · M: stort kart · N: skjul/vis minikart · klikk på kartet: teleporter · F3: ytelsespanel
(også tid på døgnet, skygger, teksturer, myke LOD-overganger).
