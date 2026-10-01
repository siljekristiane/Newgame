# Nedlastingsliste: musikk (fase D)

Kandidatstykkene per sone. Id-en er den samme som i `src/audio/playlist.ts`.
Når en innspilling er på plass, settes `file` og `credit` for sporet, og filen
føres i `CREDITS.md`.

## Lisenskrav (viktig)

- **Selve innspillingen** må være CC0 eller offentlig eie (public domain).
  Verket er gammelt nok, men en ny innspilling har egen opphavsrett. Det holder
  ikke at komponisten er død.
- Godkjent: «CC0», «Public Domain Mark» og «Public domain» med en tydelig
  begrunnelse (f.eks. «released into the public domain by the performer», eller
  en gammel innspilling med utløpt vern).
- Ikke godkjent: CC BY (krever navngivelse, kan vurderes senere), CC BY-SA, NC,
  ND, «royalty free», YouTube-rips og strømmetjenester.
- Gode kilder: Wikimedia Commons (kategorien «Audio files of classical music»,
  sjekk lisensboksen), archive.org (Musopen-samlingene er merket PD/CC0) og
  Musopen.org.
- Format: helst FLAC eller OGG/WAV. Fase D koder om til Opus 96 kbit/s med lik
  lydstyrke.

## Valgte innspillinger (fase D, hentet fra Wikimedia Commons)

Lisensen er sjekket i Commons' metadata (`LicenseShortName`) både ved søk
(`scripts/find-music.mjs`) og ved nedlasting (`scripts/fetch-music.mjs`, som
nekter alt som ikke er CC0 eller offentlig eie). Kildene står i
`scripts/music-sources.json`; kreditt per fil i `CREDITS.md`.

| Id | Utøver | Lisens | Fil på Commons |
|---|---|---|---|
| `bach-goldberg-aria` | Kimiko Ishizaka (Open Goldberg Variations) | CC0 | `File:Kimiko Ishizaka - 01 - Aria.ogg` |
| `bach-air` | Air Force Strings, United States Air Force Band | Public domain (US Government work) | `File:Air - Air Force Strings - United States Air Force Band.mp3` |
| `satie-gymnopedie-1` | Robin Alciatore (Musopen) | Public domain | `File:Erik Satie - gymnopedies - la 1 ere. lent et douloureux.ogg` |
| `grieg-morning` | Musopen Symphony | Public domain | `File:Grieg - Peer Gynt Suite No. 1, Op. 46 - I. Morning Mood (Musopen Symphony).flac` |
| `beethoven-pastoral-2` | Musopen | Public domain | `File:Ludwig van Beethoven - symphony no. 6 in f major 'pastoral', op. 68 - ii. andante molto mosso.ogg` |
| `vivaldi-winter-largo` | The Modena Chamber Orchestra (Musopen) | Public Domain Mark | `File:The Modena Chamber Orchestra - Vivaldi's Winter, RV 297 - II. Largo.ogg` |
| `bach-prelude-c` | Kimiko Ishizaka (Open Well-Tempered Clavier) | Public domain (CC0) | `File:Kimiko Ishizaka - Bach- Well-Tempered Clavier, Book 1 - 01 Prelude No. 1 in C major, BWV 846.flac` |
| `debussy-clair-de-lune` | Laurens Goedhart | Public domain | `File:Clair de lune (Claude Debussy) Suite bergamasque.ogg` |
| `chopin-berceuse` | Veronica van der Knaap | Public domain | `File:Chopin-Berceuse.ogg` |
| `chopin-nocturne-9-2` | Frank Lévy (Musopen, Set Chopin Free) | Public domain | `File:Chopin - Nocturne No. 2 in E-flat major, Op. 9 No. 2 (Frank Levy).flac` |
| `chopin-nocturne-27-2` | Frank Lévy (Musopen, Set Chopin Free) | Public domain | `File:Chopin - Nocturne No. 8 in D-flat major, Op. 27 No. 2 (Frank Levy).flac` |
| `beethoven-moonlight-1` | Paul Pitman (Musopen) | Public domain | `File:Ludwig van Beethoven - sonata no. 14 in c sharp minor 'moonlight', op. 27 no. 2 - i. adagio sostenuto.ogg` |
| `chopin-raindrop` | Musopen (Chopin collection) | CC0 | `File:Prelude Op. 28 no. 15.mp3` |

Endringer fra forslaget: Chopins Barcarolle er byttet med **Berceuse op. 57**
(den eneste frie Barcarolle var et 33 s syntetisk utdrag). Månskinnssonaten
spiller også i regn, så regnsonen har to stykker.

Slik legger du til et stykke: legg kilden i `scripts/music-sources.json`, kjør
`node scripts/fetch-music.mjs` og `npm run audio:encode`, og legg sporet i
`src/audio/playlist.ts` og en linje i `CREDITS.md` (enhetstesten sjekker det).

Senere, til plottlag (intens musikk): Vivaldi: Sommer, Presto · Beethoven:
Symfoni nr. 5, 1. sats (Musopen-innspilling finnes på Commons) · Grieg: I
Dovregubbens hall (Musopen Symphony) · Chopin: Etyde op. 10 nr. 12.
