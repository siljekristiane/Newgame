# Avatar-verktøy

Bygger en ferdig figur (`public/avatars/<navn>.glb`) med farger og skjelett
fra en hvit 3D-form og referansebilder. Brukt til Alven (`alv/`).

## Slik bygges Alven på nytt

```bash
pip install numpy scipy pillow        # én gang
python3 tools/avatar/paint.py alv      # glatter formen, maler farger fra bildene
python3 tools/avatar/build_glb.py alv  # tekstur, skjelett, vekter -> public/avatars/alv.glb
```

(Mappenavnet kan også gis som full sti: `tools/avatar/alv`.)

## Hva mappen inneholder

| Fil | Hva |
|---|---|
| `mesh.glb` | Den hvite formen, laget med TRELLIS.2 fra `front_cutout.png` |
| `turnaround.jpg` | Arket med forfra, fra siden og bakfra. Hovedkilden til fargene |
| `front_cutout.png` | Utklippet forfra (brukes nedover beina, der det passer formen best) |
| `closeup.jpg` | Nærbilde av ansiktet. Bare med når `CLOSEUP=1` er satt |

## Hva skriptene gjør

1. **paint.py:** gjør figuren 1,65 m høy med føttene på bakken, deler opp og
   glatter trekantene, gjør hodet symmetrisk og glatter ansiktet
   (`FACE_SMOOTH`, standard 25), og maler en farge per punkt fra bildene
   (forfra, bakfra og sidene, med synlighetssjekk).
2. **build_glb.py:** lager én tekstur (atlas) av bildene, gir hver trekant
   bildet som ser den best (sidebildet aldri på hodet), faller tilbake til
   punktfargen der bildet ikke passer, legger inn skjelettet (21 bein med
   navnene i `src/avatar/humanoid.ts`) og regner ut hvor mye hvert punkt følger
   hvert bein. Håret følger hodet og overkroppen, skjørtet hoftene.

Posisjonene i bildene (rammer, øyne, munn) står øverst i skriptene. En ny figur
trenger nye tall der; se hvordan de er målt i kommentarene.

## Ny figur

1. Lag mappen `tools/avatar/<navn>/` med de samme filene og bygg som over.
2. Legg modellen inn i `BODY_MODELS` i `src/avatar/models.ts`.
3. Før den opp i `CREDITS.md`. Testen `models.test.ts` sjekker fil, kreditt og bein.

Kommer modellen fra et annet verktøy (Mixamo, MakeHuman, Blender), trengs ikke
disse skriptene: bruk `.glb`-fila direkte og et beinkart (f.eks.
`MIXAMO_BONE_MAP` i `humanoid.ts`).
