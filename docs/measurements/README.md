# Målinger

Hver mappe er én kjøring av `npm run measure`: `report.md` (tabell), `report.json`
(rådata) og ett skjermbilde per fast kameravinkel.

- `baseline/`: spillet før fase 2 (low-poly, 100 km-verden), målt i Claude-skyen
  med programvare-rendering (SwiftShader). FPS og bildetid herfra er ikke
  representative; draw calls, trekanter, chunks, minne og innlastingstid er det.

- `step-2a/`: glatte normaler, PBR-terreng, geomorphing mellom LOD-er og
  terreng bare fra forsiden. `ridge-before-front-side.png` / `ridge-after.png`
  viser de prikkete silhuett-strekene før og etter.

Slik sammenligner du: kjør `npm run measure` etter en endring og legg den nye
`report.md` ved siden av `baseline/report.md`. Skjermbildene har samme vinkel og
posisjon, så de kan legges oppå hverandre.
