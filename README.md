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

Åpne en fast kameravinkel direkte med `#v-spawn`, `#v-coast`, `#v-shore`,
`#v-valley`, `#v-mountain` eller `#v-edge` i adressen. **F3** viser ytelsespanelet.

## Kontroller

| Tast | Handling |
|---|---|
| W A S D | Gå |
| Shift | Løp (40 m/s) |
| Mellomrom | Hopp |
| Klikk i spillet | Styr kameraet med musa (Esc slipper) |
| F | Hurtigreise av/på (500 m/s) |
| Q / E, eller dra med musa | Snu kameraet |
| Scroll | Zoom |
| U | Lyd av/på (volum per kanal i F3) |
| T | Figuren sier noe (babling); den nynner av seg selv når den står stille |
| M | Stort kart (klikk for å teleportere, Esc lukker) |
| N | Skjul/vis minikartet |
| P | Skjul/vis posisjonspanelet |
| H | Skjul/vis begge panelene |
| Klikk på minikartet | Teleporter dit |
| F3 | Ytelsespanel av/på (også kvalitet, klokke, vær, skygger, teksturer, vegetasjon og gress) |

## Hva som finnes nå

- 100 × 100 km verden med kontinenter, eroderte fjellkjeder og åser som ender i hav
- Klima og biomer: strand, eng, tørt land, skog, fjell og snø, kaldere mot nord og i høyden
- Glatt, lyssatt terreng med myke overganger mellom detaljnivåene
- Prosedyrale detaljteksturer med relieff for gress, jord, stein, sand og snø
- Fysisk basert himmel med døgnsyklus, sol- og måneskygger, stjerner om natten
- Vann med havbunnsdybde, bølger, himmelrefleks, solglitter og skum mot land
- Trær, busker og steiner etter biom, og gress rundt spilleren, som svaier i vinden
- Startområde med brosteinsplass, fontene med krystall, grusstier og lamper som tennes om kvelden
- Vær: skyer som driver, overskyet, regn og snø, tåke som tetner i regnvær
- Chunk-streaming med Web Workers, 4 LOD-nivåer og skjørt mot sprekker
- Flytende origo, så det ikke skjelver langt ute i verden
- Spiller (plassholder) med myk bevegelse, hopp og musestyrt tredjepersonskamera
- HUD med posisjon i km, høyde, retning, fart og ytelsestall
- Kvalitetsnivåer (Lav/Middels/Høy) valgt automatisk etter skjermkortet, kan endres i F3
- Kompass, minikart som kan skjules og stort kart med rutenett, alle med klikk-for-å-teleportere
- Lyd: syntetisert vind, regn, snøsus og skritt etter underlaget, og en figur som nynner og babler
- Rolig klassisk musikk (Bach, Satie, Grieg, Beethoven, Vivaldi, Debussy, Chopin) som følger stedet, natt og regn, med innspillinger i offentlig eie/CC0 (se [CREDITS.md](./CREDITS.md))

Arkitektur og kodestandard står i [CLAUDE.md](./CLAUDE.md).
