# Akademiet: måling før og etter

Programvare-rendering (SwiftShader), 1280 × 720, kl. 15, klart vær, kvalitet «Høy».
«Før» er commit `cdd4b94` (uten akademiet), «etter» er med akademiet.

| Vinkel | Draw calls | Trekanter | Geometrier | Teksturer | Shadere | Innlasting |
|---|---|---|---|---|---|---|
| spawn, før | 265 | 924 799 | 272 | 16 | 39 | 25 s |
| spawn, etter | 270 | 928 997 | 277 | 28 | 43 | 23 s |
| academy, etter | 347 | 1 184 453 | 352 | 28 | 43 | 23 s |

- Bygningen koster 5 draw calls (mur, tak, hugget stein, dør, glass) og ~4,4 k trekanter.
- 12 teksturer til (4 sett × farge, normal og ARM, 1k), 3 MB nedlasting.
- Vinkelen `academy` ser mot nordvest over mer skog enn `spawn`, derfor flere trær og trekanter.
  Den er innenfor budsjettet (≤ 500 draw calls, ≤ 1,5 M trekanter).
