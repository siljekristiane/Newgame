# Målinger

Hver mappe er én kjøring av `npm run measure`: `report.md` (tabell), `report.json`
(rådata) og ett skjermbilde per fast kameravinkel.

- `baseline/`: spillet før fase 2 (low-poly, 100 km-verden), målt i Claude-skyen
  med programvare-rendering (SwiftShader). FPS og bildetid herfra er ikke
  representative; draw calls, trekanter, chunks, minne og innlastingstid er det.

- `step-2a/`: glatte normaler, PBR-terreng, geomorphing mellom LOD-er og
  terreng bare fra forsiden. `ridge-before-front-side.png` / `ridge-after.png`
  viser de prikkete silhuett-strekene før og etter.

- `step-2b/`: ny terrengform (domain warping, ridged fjell), klima, biomer og
  materialvekter. Kyst, dal og fjell ligger andre steder enn før fordi
  terrenget endret seg.

- `step-2c/`: prosedyrale detaljteksturer med normal maps (teksturer på).
  `closeup-textures-on.jpg` / `closeup-textures-off.jpg` viser forskjellen på nært
  hold; `texture-sheet.png` viser de fem teksturene og normal maps.

- `step-3/`: fysisk himmel, døgnsyklus, sol- og måneskygger, AgX-tonemapping
  (målt kl. 15). `time-07.jpg` … `time-23.jpg`: fjellvinkelen gjennom døgnet.

- `step-4/`: vann med havbunnskart, bølger, Fresnel-refleks, solglitter og skum.
  Ny vinkel `shore.jpg` (strand) viser vannet nært; `shore-18.jpg` er samme sted i
  skumringen (teksturer av).

- `step-5/`: trær, busker og steiner etter biom (vegetasjon på). Trekanter
  0,3–0,9 M (fra 0,08–0,16 M), draw calls 148–174 (fra 121–147), 2–7 MB mer
  JS-minne. `spawn.jpg`, `mountain.jpg` og `shore.jpg` viser skog og åpent land.

- `step-5b/`: gress rundt spilleren (én draw call, ~150 k trekanter alltid,
  også der tustene har størrelse 0). Maks 1,06 M trekanter (strand).

- `step-6a/`: startområdet: brosteinsplass og grusstier stemplet inn i terrenget.
  Samme draw calls og trekanter i målevinklene (plassen ligger bak spawn-kameraet);
  `spawn-closeup.jpg` er spawn-vinkelen nordover mot plassen (skygger av).

Slik sammenligner du: kjør `npm run measure` etter en endring og legg den nye
`report.md` ved siden av `baseline/report.md`. Skjermbildene har samme vinkel og
posisjon, så de kan legges oppå hverandre.
