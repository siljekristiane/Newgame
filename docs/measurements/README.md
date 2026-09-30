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

Slik sammenligner du: kjør `npm run measure` etter en endring og legg den nye
`report.md` ved siden av `baseline/report.md`. Skjermbildene har samme vinkel og
posisjon, så de kan legges oppå hverandre.
