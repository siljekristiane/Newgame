# Måling 2026-09-29-14-04

- Skjermkort: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` (programvare: FPS og bildetid er ikke representative)
- Første innlasting til ferdig strømmet verden: 11,1 s

| Vinkel | Draw calls | Trekanter | Geometrier | Teksturer | Shadere | Chunks | LOD 0/1/2/3 | Innlasting (s) | FPS | Bildetid snitt / 95 % (ms) | JS-minne (MB) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| spawn | 118 | 113 834 | 97 | 0 | 5 | 349 | 9/40/120/180 | 0,0 | 5 | 204,9 / 260,9 | 15 |
| coast | 133 | 115 946 | 152 | 0 | 5 | 370 | 9/40/120/201 | 1,8 | 5 | 204,6 / 248,7 | 19 |
| valley | 148 | 136 194 | 206 | 0 | 5 | 397 | 9/40/120/228 | 6,9 | 4 | 225,2 / 261,9 | 21 |
| mountain | 135 | 127 730 | 182 | 0 | 5 | 377 | 9/40/120/208 | 9,9 | 4 | 244,8 / 319,0 | 30 |
| edge | 24 | 77 570 | 71 | 0 | 5 | 248 | 9/40/81/118 | 4,7 | 5 | 220,7 / 319,0 | 25 |
