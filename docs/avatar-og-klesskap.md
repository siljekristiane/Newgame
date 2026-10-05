# Avatar og klesskap

Slik er avataren og klesskapet bygget, og hvordan du endrer dem. Skrevet så du
(eller en AI-agent) kan gjøre hyppige endringer uten å røre motoren. Lim gjerne
inn en av oppskriftene under som prompt.

## Kort om systemet

| Del | Fil | Hva den gjør |
|---|---|---|
| Størrelse og kamera | `src/config/world.ts` → `AVATAR` | Høyde (1,6 m), kamerafokus, zoomområde, klaring |
| Utseende | `src/avatar/appearance.ts` | Hudtoner, hårfarger, øyefarger, frisyrer, standardutseende |
| Startfigurer | `src/avatar/presets.ts` | De fire figurene man kan velge én gang |
| Kropp og ledd | `src/avatar/body.ts` | Mål i meter (`BODY`) og leddene klærne henger på |
| Ansikt | `src/avatar/head.ts` | Hode, ører, øyne, bryn, nese, munn, kinn |
| Hår | `src/avatar/hair.ts` | Én byggefunksjon per frisyre |
| Klær | `src/avatar/clothing.ts` | Én byggefunksjon per plaggtype (`pattern`) |
| Animasjon | `src/avatar/animate.ts` | Tomgang, gange, løp, hopp, hurtigreise, blunk |
| Plagg | `src/wardrobe/catalog.ts` | Alle plagg som data |
| Låser | `src/wardrobe/unlocks.ts` | Eid / kan kjøpes / låst / skjult, kjøp, mynter |
| Quests | `src/wardrobe/quests.ts` | Navn og belønning på quests plagg kan låses bak |
| Lagring | `src/wardrobe/storage.ts` | Lagres i nettleseren, med versjon og rensing |
| Klesskap-UI | `src/wardrobe/Wardrobe.tsx` | Panelet (tast K) |

Stilen følger resten av Duskwood World: PBR-materialer
(`MeshStandardMaterial`) som tar samme sol, himmellys, skygger og
tonemapping som terrenget, og fargene fra Duskwood Academy-paletten.

## Oppskrifter

### Legge til et plagg

Legg én oppføring i `CATALOG` i `src/wardrobe/catalog.ts`:

```ts
{
  id: 'outer_rain_cape',            // unik, aldri endre en id som er i bruk
  name: 'Regnkappe',                // vises i klesskapet
  slot: 'outer',                    // top | outer | bottom | shoes | head | neck
  pattern: 'cloak',                 // en eksisterende form, se clothing.ts
  params: { color: '#e0c25a', hood: '#c9a83f', clasp: '#d9b45c' },
  colors: ['#e0c25a', '#8fb3c9'],   // valgfritt: fargevalg (første = color)
  unlock: { type: 'coins', cost: 50 },
},
```

Testen `avatar/buildAvatar.test.ts` bygger automatisk alle plagg i katalogen,
så et plagg som ikke kan bygges blir fanget av `npm test`.

### Låse et plagg bak en quest eller mynter

```ts
unlock: { type: 'free' }                                        // eid fra start
unlock: { type: 'coins', cost: 60 }                             // kjøpes for mynter
unlock: { type: 'quest', questId: 'fountain_crystal' }          // gis når questen er fullført
unlock: { type: 'quest', questId: 'fountain_crystal', hidden: true }  // usynlig til da
unlock: { type: 'questAndCoins', questId: 'forest_path', cost: 30 }   // kan kjøpes etter questen
```

En ny quest legges i `src/wardrobe/quests.ts` (navn og myntbelønning). Når
quest-systemet kommer, kaller det `useWardrobeStore.getState().completeQuest(id)`.
Startmynter og navnet på valutaen ligger i `COINS` i `unlocks.ts`.

For å teste alle plagg uten å spille: åpne spillet med `?unlockAll` i adressen.

### Ny plaggtype (ny form)

1. Legg navnet til i `PatternId` i `catalog.ts`.
2. Skriv en byggefunksjon i `PATTERNS` i `src/avatar/clothing.ts`. Heng meshene
   på leddene i `c.rig` (torso, skuldre, albuer, hofter, knær, hode), bruk
   `material(...)` for stoffet og et lag fra `LAYER` så plagget ligger utenpå
   kroppen og andre lag.
3. Lag et plagg i katalogen som bruker den.

### Ny frisyre

1. Skriv en funksjon i `STYLES` i `src/avatar/hair.ts` (se `bob` for et enkelt eksempel).
2. Legg den til i `HAIR_STYLES` i `src/avatar/appearance.ts`.

### Endre størrelsen på avataren

Endre `AVATAR.height` i `src/config/world.ts`. Modellen, skyggen og
kameraets fokus og zoom følger med. Lyktestolpene er ca. 3,5 m.

### Endre kameraet

`AVATAR.camera` i `src/config/world.ts`: standardavstand, nærmeste og lengste
zoom, når fokus glir fra brystet til ansiktet, og hvor høyt sikten må gå over bakken.

## Ytelse

Spilleren i verden er ca. 70–90 000 trekanter (`'medium'`), forhåndsvisningen i
klesskapet ca. 140–170 000 (`'high'`). Håret slås sammen til én mesh per
farge. Avataren bygges på nytt bare når utseendet lagres.

## Ikke gjort ennå

- Vinger (spillet har ingen vingespor ennå).
- Ekte skjelett/GLTF-animasjon; avataren animeres ved å dreie leddgrupper.
- Klær og lemmer kan overlappe litt i ekstreme positurer.
