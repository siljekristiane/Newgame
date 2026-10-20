# Bygningene rundt plassen: måling før og etter

Programvare-rendering (SwiftShader), 1280 × 720, kl. 15, klart vær, kvalitet «Høy».
«Før» er commit `b4c798d` (bare akademiet), «etter» er med alle sju byggene
(akademiet utbygd, bibliotek, sovesal, klokketårn, to småhus, verksted).

| Vinkel | Draw calls | Trekanter | Teksturer | Shadere | Innlasting |
|---|---|---|---|---|---|
| spawn, før | 270 | 928 947 | 28 | 43 | 25 s |
| spawn, etter | 270 | 978 196 | 28 | 43 | 25 s |
| academy, før | 347 | 1 184 403 | 28 | 43 | 26 s |
| academy, etter | 346 | 1 242 504 | 28 | 43 | 29 s |
| campus, etter | 253 | 892 682 | 28 | 40 | 24 s |

- Alle byggene er slått sammen til én geometri per overflate: fortsatt 5 draw calls til sammen.
- ~54 k trekanter for alle byggene (+49 k ved spawn, der de fleste er i bildet).
- Ingen nye teksturer: samme fire CC0-sett som akademiet.
- `campus-19.jpg`: samme vinkel kl. 19:30 med lys i vinduene.
