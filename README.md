# Duskwood World

Et 3D open world-spill i nettleseren: en prosedyralt generert verden på
**500 × 500 km**, strømmet inn i 1 km store chunks med LOD.
Bygget med three.js, React Three Fiber, Vite og TypeScript.

## Kjør

**I StackBlitz:** åpne
[stackblitz.com/github/siljekristiane/newgame/tree/claude/happy-knuth-ai7a6n](https://stackblitz.com/github/siljekristiane/newgame/tree/claude/happy-knuth-ai7a6n).
Den installerer og starter `npm run dev` av seg selv.

**Lokalt:**

```bash
npm install
npm run dev
```

## Kontroller

| Tast | Handling |
|---|---|
| W A S D | Gå |
| Shift | Løp (40 m/s) |
| F | Hurtigreise av/på (1,5 km/s) |
| Q / E, eller dra med musa | Snu kameraet |
| Scroll | Zoom |
| Klikk på minikartet | Teleporter dit |

## Hva som finnes nå

- 500 × 500 km verden med høydekart (kontinenter, fjellkjeder, åser) som ender i hav
- Chunk-streaming med Web Workers, 4 LOD-nivåer og skjørt mot sprekker
- Flytende origo, så det ikke skjelver langt ute i verden
- Spiller (sfære) med tredjepersonskamera
- HUD med posisjon i km, høyde, retning, fart og ytelsestall
- Minikart over hele verden med klikk-for-å-teleportere

Arkitektur og kodestandard står i [CLAUDE.md](./CLAUDE.md).
