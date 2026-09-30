# Duskwood World

Et 3D open world-spill i nettleseren: en prosedyralt generert verden på
**100 × 100 km**, strømmet inn i 1 km store chunks med LOD.
Bygget med three.js, React Three Fiber, Vite og TypeScript.

## Kjør

**I StackBlitz:** åpne
[stackblitz.com/github/siljekristiane/Newgame](https://stackblitz.com/github/siljekristiane/Newgame).
Den installerer og starter `npm run dev` av seg selv.

**Lokalt:**

```bash
npm install
npm run dev
```

Sjekker og tester:

```bash
npm run check    # lint, typesjekk, enhetstester og bygg
npm run e2e      # nettlesertester (første gang: npx playwright install chromium)
npm run measure  # ytelsestall og skjermbilder av faste kameravinkler
```

Åpne en fast kameravinkel direkte med `#v-spawn`, `#v-coast`, `#v-valley`,
`#v-mountain` eller `#v-edge` i adressen. **F3** viser ytelsespanelet.

## Kontroller

| Tast | Handling |
|---|---|
| W A S D | Gå |
| Shift | Løp (40 m/s) |
| F | Hurtigreise av/på (500 m/s) |
| Q / E, eller dra med musa | Snu kameraet |
| Scroll | Zoom |
| Klikk på minikartet | Teleporter dit |
| F3 | Ytelsespanel av/på |

## Hva som finnes nå

- 100 × 100 km verden med kontinenter, eroderte fjellkjeder og åser som ender i hav
- Klima og biomer: strand, eng, tørt land, skog, fjell og snø, kaldere mot nord og i høyden
- Glatt, lyssatt terreng med myke overganger mellom detaljnivåene
- Prosedyrale detaljteksturer med relieff for gress, jord, stein, sand og snø
- Chunk-streaming med Web Workers, 4 LOD-nivåer og skjørt mot sprekker
- Flytende origo, så det ikke skjelver langt ute i verden
- Spiller (sfære) med tredjepersonskamera
- HUD med posisjon i km, høyde, retning, fart og ytelsestall
- Minikart over hele verden med klikk-for-å-teleportere

Arkitektur og kodestandard står i [CLAUDE.md](./CLAUDE.md).
