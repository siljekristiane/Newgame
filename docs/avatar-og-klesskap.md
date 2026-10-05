# Avatar og klesskap

Slik er avataren og klesskapet bygget, og hvordan du endrer dem. Skrevet så du
(eller en AI-agent) kan gjøre hyppige endringer uten å røre motoren. Lim gjerne
inn en av oppskriftene under som prompt.

## Kort om systemet

| Del | Fil | Hva den gjør |
|---|---|---|
| Figurer (kropper) | `src/avatar/models.ts` | Den tegnede figuren og ferdige `.glb`-figurer (Alven) |
| Felles avatar | `src/avatar/avatarInstance.ts`, `useAvatar.ts` | Ett grensesnitt for alle figurer: bygg, animer, rydd opp |
| Skjelett og animasjon for `.glb` | `src/avatar/humanoid.ts`, `skinnedAnimator.ts` | Beinroller og gange/løp/hopp for alle riggede figurer |
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

### Ny ferdig figur (.glb)

Figurer med egne klær og hår (som Alven) er riggede `.glb`-filer:

1. Legg fila i `public/avatars/`.
2. Legg til en oppføring i `BODY_MODELS` i `src/avatar/models.ts` (navn, fil,
   beinkart). Bruker fila beinnavnene i `humanoid.ts`, holder
   `IDENTITY_BONE_MAP`; er den rigget i Mixamo, bruk `MIXAMO_BONE_MAP`.
3. Legg navnet til i `BodyId` i samme fil, og eventuelt en startfigur i `presets.ts`.
4. Før fila opp i `CREDITS.md`.

`models.test.ts` sjekker at fila finnes, er kreditert og har beina kartet
nevner. Figuren skaleres automatisk til `AVATAR.height` med føttene på bakken,
og animeres av `skinnedAnimator.ts` (armene senkes fra hvilestillingen i fila).
Alven kan bygges på nytt fra kildene med `tools/avatar/` (se README der).

### Bytte hele avatarsystemet

Spilleren og klesskapet bruker bare `useAvatar(appearance, detail)`, som gir et
`AvatarInstance` (`group`, `update(dt, bevegelse)`, `dispose`). En ny type figur
(f.eks. klær på `.glb`-figurer, NPC-er) er en ny fabrikk i
`avatarInstance.ts`; resten av spillet trenger ikke endres.

### Endre størrelsen på avataren

Endre `AVATAR.height` i `src/config/world.ts`. Modellen, skyggen og
kameraets fokus og zoom følger med. Lyktestolpene er ca. 3,5 m.

### Endre kameraet

`AVATAR.camera` i `src/config/world.ts`: standardavstand, nærmeste og lengste
zoom, når fokus glir fra brystet til ansiktet, og hvor høyt sikten må gå over bakken.

## Ytelse

Alven er 80 000 trekanter og én tekstur (4,6 MB fil, lastes én gang og deles).
Den tegnede figuren i verden er ca. 70–90 000 trekanter (`'medium'`), forhåndsvisningen i
klesskapet ca. 140–170 000 (`'high'`). Håret slås sammen til én mesh per
farge. Avataren bygges på nytt bare når utseendet lagres.

## Ikke gjort ennå

- Vinger (spillet har ingen vingespor ennå).
- Klær fra klesskapet på `.glb`-figurer (Alven har faste klær og hår).
- Fingre og simulert skjørt/hår på Alven.
- Den tegnede figuren animeres fortsatt ved å dreie leddgrupper.
- Klær og lemmer kan overlappe litt i ekstreme positurer.
