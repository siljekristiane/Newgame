# Plan: musikk og lyd i Duskwood World


## Bakgrunn
Spillet er helt stille i dag. Det finnes ingen lydkode og ingen lydfiler. Du vil ha:
- musikk i hele spillet, med ulike soner,
- rolig klassisk musikk i bakgrunnen først (Vivaldi, Chopin, Beethoven osv.), og mer intens musikk senere når plottet kommer,
- lyd av skritt, regn og vind,
- en avatar som snakker og nynner.

Det du har bestemt:
- **Bare innspillinger som er CC0 eller i offentlig eie.** Komposisjonene er fri, men de fleste innspillinger er ikke det.
- **Du laster ned filene selv.** Skyen når ikke musopen.org, Wikimedia eller archive.org, bare GitHub og npm. Jeg lager en liste med stykker og kilder, og tar meg av resten.
- **Prosedyral stemme for avataren.** Den lages i nettleseren, uten lydfiler.

Resultatet skal være et lydsystem som
- starter med rolige stykker som bytter mykt etter sone, tid på døgnet og vær,
- har skritt, regn og vind som følger det som skjer i verden,
- er bygget slik at intens plottmusikk kan legges oppå senere uten at noe må skrives om.

## Arkitektur (ny mappe `src/audio/`)
Web Audio API, uten bibliotek. Samme mønster som resten av koden: rene funksjoner som testes, og tynne komponenter som kobler dem inn.

- **`audioEngine.ts`**
  - Én `AudioContext` med egne kanaler (busser): master → musikk / omgivelser / effekter / stemme.
  - Musikken dempes litt når avataren snakker («ducking»).
  - Nettleseren tillater ikke lyd før brukeren har klikket eller trykket en tast. Lyden låses derfor opp ved første klikk eller tastetrykk, og det klikket som låser musepekeren er nok.
  - Konteksten stoppes når fanen skjules.
- **Settings**
  - Volum for master, musikk, omgivelser, effekter og stemme ligger i storen (`useGameStore`).
  - F3-panelet og et lite lydpanel får glidebrytere.
  - Tasten **U** slår all lyd av og på. Valget lagres i nettleseren, som kvalitetsnivået i `src/settings/quality.ts`.
- **Konstanter** i `config/world.ts` (`AUDIO`: volum, overtoningstider, avstander) og en spilleliste i `src/audio/playlist.ts`.

## Fase A: lydmotor og innstillinger (uten innhold) — ferdig
- `audioEngine.ts`, `AudioSystem.tsx` (monteres i `Scene` og leser tilstand hvert bilde, uten å allokere nytt minne), volumer i storen, lydbrytere i F3 og tasten U.
- Testkroken `window.__duskwood.audio()` gir status: om lyden er låst opp, hvilken sone vi er i, hvilket spor som spiller og volumene.

## Fase B: prosedyrale omgivelser og skritt (ingen filer) — ferdig
- **Vind:** filtrert støy med filteret styrt av `runtime.weather` (vindstyrke), med litt mer vind i høyden. Du hører kast når vinden øker.
- **Regn:** lag av filtrert støy og små «dråpeklikk». Styrken følger `weather.precipitation`. Det blir stille i snø, som bare gir et svakt sus.
- **Skritt:** ett steg utløses per skrittlengde fra `runtime.motion` (fart og om figuren er i lufta). Hopp gir en landingslyd.
  - Underlaget avgjør lyden: `surfaceAt` (`world/biomes.ts`) gir gress, jord, stein, sand eller snø. Grussti og brostein hentes fra `nearestPath` og `plazaDistance` (`regions/stamps.ts`). Vann gir plask.
  - Hver lyd syntetiseres: støyimpuls + filter per underlag, med litt tilfeldig variasjon, så to skritt aldri er helt like.
- De rene delene testes: skrittakt fra fart, valg av underlag og vindstyrke.

## Fase C: musikkdirigent og soner (logikk) — ferdig
Gjort som beskrevet under. Overtoningen er 4 s, et nytt sted må vare 8 s (natt og regn 10 s) før musikken følger, og et spor som også hører til den nye sonen spiller videre. Kandidatstykkene står i `nedlastingsliste.md`.

- **`musicDirector.ts`** (ren og testet) velger sone ut fra
  - posisjon: startplassen via `spawnLayout()`; skog, fjell og kyst via `biomeAt` og havdybde,
  - tid på døgnet: natt via `lightingAt(clock.hours).night`,
  - vær: regn.
- Sonen byttes bare når den har vart en stund (hysterese), så musikken ikke hopper fram og tilbake ved en grense.
- **Spilleliste per sone.** Et spor spilles ferdig før neste starter, med 3–5 s overtoning. Det kommer pauser med stillhet mellom stykkene (20–60 s), så det ikke blir mas. Ved sonebytte tones det over til den nye sonen når sporet slutter, eller etter maks 30 s.
- **Strømming:** filene spilles med `<audio>` + `MediaElementSource`, så lange stykker ikke må ligge ferdig dekodet i minnet. Neste spor forhåndslastes.
- **Klar for plottet:** et lagsystem med prioritet (`pushLayer('kamp', prioritet)` / `popLayer`). Et intenst lag legger seg oppå og demper bakgrunnen, og tas bort med overtoning. Nå er det bare testet med et dummy-lag.
- Til filene er på plass spiller hver sone stille (eller én svak drone), og alt annet virker.

## Hvem skaffer hvilke lyder
- **Skritt, regn, vind og stemme:** lages i koden (fase B og E), uten lydfiler.
- **Bare musikken trenger filer**, på én av tre måter:
  1. Brukeren åpner nettilgang til `musopen.org`, `upload.wikimedia.org`, `commons.wikimedia.org` og `archive.org`, og Claude finner, sjekker, laster ned, koder og krediterer.
  2. Brukeren laster ned fra en lenkeliste til `audio-src/`.
  3. Midlertidig syntetisk spilling av stykkene ut fra fri notetekst.

## Fase D: musikkfilene — ferdig
Nettet var åpent, så Claude hentet 13 CC0/PD-innspillinger fra Wikimedia Commons selv (se `nedlastingsliste.md` og `CREDITS.md`). De er kodet til Opus i WebM (80 kbit/s, spiller også i Safari), −20 LUFS, til sammen 42 MB. Barcarolle er byttet med Berceuse.

- Jeg lager `docs/audio/nedlastingsliste.md` med nøyaktig stykke, utøver, kilde og lisens for hvert spor. Bare filer som er merket Public Domain eller CC0 på kildesiden tas med.
- **Aktuelle kilder:**
  - Musopen (Chopin-prosjektet, Musopen Symphony),
  - Open Goldberg Variations og Open Well-Tempered Clavier (Kimiko Ishizaka, CC0),
  - filer på Wikimedia Commons som er merket PD eller CC0.
- **Forslag til soner** (endelig utvalg avhenger av hvilke CC0/PD-innspillinger som finnes):

| Sone | Stemning | Stykker (forslag) |
|---|---|---|
| Startplassen | varm, rolig | Bach: Goldberg-arien, Air · Satie: Gymnopédie nr. 1 |
| Skog (dag) | lys, natur | Grieg: Morgenstemning · Beethoven: Pastorale (6.), 2. sats |
| Fjell og snø | vid, kjølig | Vivaldi: Vinteren, 2. sats (Largo) · Bach: preludier |
| Kyst | bølgende | Debussy: Clair de lune · Chopin: Barcarolle |
| Natt | stille | Chopin: Nocturne op. 9 nr. 2 og op. 27 nr. 2 · Beethoven: Måneskinnssonaten, 1. sats |
| Regn | melankolsk | Chopin: Preludium op. 28 nr. 15 («Regndråpe») |
| Senere, intens (plott) | dramatisk | Vivaldi: Sommeren, 3. sats · Beethoven: 5. symfoni · Grieg: I Dovregubbens hall · Chopin: Revolusjonsetyden |

- **Når du har lagt filene i `audio-src/`**, gjør et nytt skript `npm run audio:encode` (ffmpeg fra npm-pakken `@ffmpeg-installer/ffmpeg`, som dev-avhengighet) dette:
  - koder til Opus/Ogg på 96 kbit/s,
  - jevner ut lydstyrken (loudnorm, −20 LUFS for bakgrunn),
  - legger resultatet i `public/audio/music/`.
- 10–15 stykker blir ca. 30–50 MB i repoet.
- Hver fil føres i `CREDITS.md` med stykke, utøver, kilde-URL og lisens. En enhetstest sjekker at hvert spor i spillelista har en CREDITS-linje og en fil.

## Fase E: avatarens stemme (prosedyral)
- **Nynning** (`voice.ts`): en formant-synth (grunntone + to–tre båndpassfiltre på vokalene «m/u/a»). Avataren nynner korte fraser av melodiene fra stykkene (f.eks. starten av Morgenstemning, Für Elise og Air). Melodiene legges inn som notelister, siden komposisjonene er fri.
  - Nynningen starter av seg selv når avataren har stått stille en stund, men ikke oftere enn hvert par minutter. Den stopper når du går, og er dempet mens det spilles musikk.
- **Snakking:** babling (stavelser uten ord med variert tonehøyde og rytme, som i mange spill) gjennom samme synth.
  - I dag utløses den bare av en testtast (**T**, «si noe»).
  - Senere kobles den til dialogsystemet (`src/dialogue/`) når plottet kommer, med en rolig og en ivrig stemning.
- Stemmen går på stemmekanalen og demper musikken.

## Rekkefølge og arbeidsmåte
Hver fase er én avgrenset endring som testes, oppsummeres, committes og pushes, og så venter jeg på tilbakemelding før neste. Rekkefølgen er A → B → C → E, fordi ingen av dem trenger filer.

Fase D kommer når du har lastet ned filene. Nedlastingslista leveres allerede i fase C, så du kan hente dem mens jeg jobber.

## Filer som berøres
- **Nye:**
  - `src/audio/`: `audioEngine.ts`, `AudioSystem.tsx`, `musicDirector.ts`, `playlist.ts`, `ambience.ts`, `footsteps.ts`, `voice.ts`, alle med `*.test.ts` for de rene delene,
  - `public/audio/music/`, `CREDITS.md`, `docs/audio/nedlastingsliste.md`, skriptet `scripts/encode-audio.mjs`.
- **Endres:**
  - `src/config/world.ts` (`AUDIO`),
  - `src/state/useGameStore.ts` (volum og mute),
  - `src/input/useControls.ts` (U, T),
  - `src/components/Scene.tsx`,
  - `src/ui/DebugPanel.tsx`,
  - `src/debug/testApi.ts`,
  - `CLAUDE.md` og `README.md`.

## Verifisering
- `npm run check` (lint, typesjekk, enhetstester, bygg) og `npm run e2e` grønne etter hver fase.
- **Enhetstester:** sonevalg med hysterese, spillelista med overtoning og pauser, lagene med prioritet, skrittakt og underlag, melodi- og stavelsesgenerering, og CREDITS for hvert spor.
- **e2e:** lyden låses opp ved klikk, `__duskwood.audio()` viser riktig sone ved startplassen, på fjellet (vinkelen `mountain`) og om natta, regn slår på regnlyden, og U slår lyden av. Ingen konsollfeil.
- **Lytting:** Chromium i skyen er headless, så der kan bare tilstanden sjekkes. Du må lytte på en ekte maskin i den hostede versjonen, og jeg justerer volum og miks etter tilbakemeldingen din.
- **Ytelse:** `npm run measure` før og etter fase B, siden lydgrafen ikke skal påvirke bildetiden. Lyd koster lite CPU, og all syntese kjøres i nettleserens lydtråd.
