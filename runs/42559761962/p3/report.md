# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | Spring Boot 4.1.2 | 144,000 | 26.9 | 20.73 | 836.7 |
|  | Express 5.3.0 | 104,000 | 35.6 | 6.03 | 334.4 |
|  | Bun 1.4.4 | 320,000 | 12.5 | 22.48 | 43.8 |
|  | actix-web 4.19.0 | 480,000 | 8.2 | 26.05 | 39.5 |
|  | axum 0.8.9 | 256,000 | 14.7 | 13.21 | 79.7 |
| `/16k` | Spring Boot 4.1.2 | 120,000 | 29.9 | 16.39 | 530.0 |
|  | Express 5.3.0 | 88,000 | 41.9 | 10.65 | 192.5 |
|  | Bun 1.4.4 | 288,000 | 13.7 | 19.08 | 3.2 |
|  | actix-web 4.19.0 | 352,000 | 9.2 | 19.04 | 55.2 |
|  | axum 0.8.9 | 352,000 | 9.9 | 34.91 | 79.2 |
|  | Apache httpd 2.4 | 48,000 | 50.0 | 0.85 | 38.7 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 27.03 | 7.3 |
| `/323k` | Spring Boot 4.1.2 | 18,000 | 138.7 | 1.23 | 50.3 |
|  | Express 5.3.0 | 13,000 | 291.6 | 10.96 | 51.0 |
|  | Bun 1.4.4 | 18,000 | 100.2 | 1.09 | 4.0 |
|  | actix-web 4.19.0 | 18,000 | 50.2 | 0.69 | 5.7 |
|  | axum 0.8.9 | 18,000 | 55.5 | 0.72 | 10.6 |
|  | Apache httpd 2.4 | 18,000 | 94.9 | 0.81 | 19.8 |
|  | nginx 1.30.6 | 18,000 | 61.9 | 0.71 | 5.9 |
| `/323k-fresh` | Spring Boot 4.1.2 | 18,000 | 161.8 | 1.81 | 770.5 |
|  | Express 5.3.0 | 10,000 | 372.2 | 15.07 | 446.3 |
|  | Bun 1.4.4 | 18,000 | 133.5 | 1.56 | 63.3 |
|  | actix-web 4.19.0 | 18,000 | 58.8 | 0.70 | 7.7 |
|  | axum 0.8.9 | 18,000 | 61.9 | 0.71 | 12.5 |
| `/json-40k` | Spring Boot 4.1.2 | 22,000 | 180.8 | 34.69 | 1,184.8 |
|  | Express 5.3.0 | 20,000 | 195.2 | 16.26 | 361.8 |
|  | Bun 1.4.4 | 32,000 | 117.0 | 4.11 | 71.7 |
|  | actix-web 4.19.0 | 36,000 | 102.5 | 1.29 | 32.9 |
|  | axum 0.8.9 | 26,000 | 145.0 | 3.01 | 11.6 |
| `/json-323k` | Spring Boot 4.1.2 | 3,250 | 1,177.9 | 17.79 | 1,536.3 |
|  | Express 5.3.0 | 3,000 | 1,309.5 | 18.24 | 454.8 |
|  | Bun 1.4.4 | 4,000 | 954.8 | 9.86 | 142.3 |
|  | actix-web 4.19.0 | 5,000 | 760.4 | 2.98 | 6.6 |
|  | axum 0.8.9 | 3,250 | 1,146.2 | 3.52 | 8.1 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.5 | 143.7 | 109.7 |
|  | Express 5.3.0 | 3,387 | 292.9 | 305.1 | 306.7 | 93.4 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 296.3 | 85.0 | 182.0 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.2 | 38.8 | 18.0 |
|  | axum 0.8.9 | 3,399 | 292.6 | 294.4 | 41.9 | 29.0 |
|  | Apache httpd 2.4 | 1,516 | 292.6 | 29,560.8 | 73.6 | 49.4 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 330.2 | 37.1 | 17.6 |
| `/323k-fresh` | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.7 | 175.6 | 430.3 |
|  | Express 5.3.0 | 3,374 | 293.0 | 309.7 | 475.1 | 351.9 |
|  | Bun 1.4.4 | 3,399 | 292.9 | 296.0 | 120.4 | 213.9 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 295.0 | 55.1 | 259.2 |
|  | axum 0.8.9 | 3,399 | 292.6 | 294.7 | 50.1 | 283.8 |
| `/json-40k` | Spring Boot 4.1.2 | 15,911 | 63.7 | 100.1 | 203.3 | 819.3 |
|  | Express 5.3.0 | 15,903 | 62.2 | 69.2 | 214.1 | 321.0 |
|  | Bun 1.4.4 | 16,074 | 61.9 | 63.5 | 131.4 | 82.1 |
|  | actix-web 4.19.0 | 16,094 | 61.9 | 62.3 | 106.9 | 50.5 |
|  | axum 0.8.9 | 16,067 | 62.0 | 62.4 | 175.8 | 32.9 |
| `/json-323k` | Spring Boot 4.1.2 | 3,263 | 299.3 | 420.6 | 1,217.5 | 2,076.2 |
|  | Express 5.3.0 | 2,943 | 332.9 | 409.7 | 1,360.9 | 444.5 |
|  | Bun 1.4.4 | 3,356 | 294.2 | 325.5 | 1,010.7 | 274.5 |
|  | actix-web 4.19.0 | 3,372 | 293.4 | 300.2 | 781.8 | 224.8 |
|  | axum 0.8.9 | 3,357 | 294.1 | 324.8 | 1,164.7 | 251.9 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| Spring Boot 4.1.2 | 49.03 | 91.3 | 758.7 | 2,977.0 | 27.66 | 46.1 |
| Express 5.3.0 | 37.90 | 70.6 | 929.8 | 1,203.0 | 47.77 | 351.5 |
| Bun 1.4.4 | 49.08 | 91.4 | 714.3 | 1,352.0 | 2.52 | 4.1 |
| actix-web 4.19.0 | 49.30 | 91.8 | 697.5 | 2,345.2 | 24.87 | 21.0 |
| axum 0.8.9 | 49.26 | 91.8 | 1,024.1 | 2,570.8 | 29.78 | 55.2 |
| Apache httpd 2.4 | 49.15 | 91.6 | 781.4 | 1,276.1 | 3.68 | 2.4 |
| nginx 1.30.6 | 49.13 | 91.5 | 802.3 | 2,209.9 | 2.44 | 6.6 |

3 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-84-236.
