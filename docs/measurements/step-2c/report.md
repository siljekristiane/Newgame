# Måling 2026-09-30-12-01

- Skjermkort: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` (programvare: FPS og bildetid er ikke representative)
- Første innlasting til ferdig strømmet verden: 43,7 s

| Vinkel | Draw calls | Trekanter | Geometrier | Teksturer | Shadere | Chunks | LOD 0/1/2/3 | Innlasting (s) | FPS | Bildetid snitt / 95 % (ms) | JS-minne (MB) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| spawn | 121 | 132 574 | 121 | 2 | 6 | 349 | 9/40/120/180 | 0,0 | 1 | 1 102,9 / 1 108,2 | 31 |
| coast | 122 | 125 626 | 192 | 2 | 6 | 392 | 9/40/120/223 | 21,1 | 1 | 1 032,5 / 1 058,5 | 43 |
| valley | 129 | 146 026 | 310 | 2 | 6 | 415 | 9/40/120/246 | 24,5 | 1 | 1 136,7 / 1 183,2 | 53 |
| mountain | 147 | 159 930 | 294 | 2 | 6 | 389 | 9/40/120/220 | 39,7 | 1 | 1 083,9 / 1 090,9 | 43 |
| edge | 24 | 83 842 | 123 | 2 | 6 | 248 | 9/40/81/118 | 15,6 | 2 | 500,0 / 532,3 | 30 |
