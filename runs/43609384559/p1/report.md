# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web 4.19.0 | 512,000 | 7.6 | 27.69 | 38.8 |
|  | axum 0.8.9 | 240,000 | 15.4 | 15.34 | 79.2 |
|  | rama 0.4.0 | 224,000 | 16.6 | 17.18 | 67.0 |
|  | Spring Boot 4.1.2 | 120,000 | 28.0 | 7.29 | 649.0 |
|  | Express 5.3.0 | 104,000 | 33.9 | 5.40 | 307.3 |
|  | Bun 1.4.4 | 320,000 | 12.0 | 18.49 | 45.6 |
| `/16k` | actix-web 4.19.0 | 352,000 | 8.7 | 16.60 | 55.2 |
|  | axum 0.8.9 | 352,000 | 8.8 | 19.67 | 82.7 |
|  | rama 0.4.0 | 352,000 | 10.7 | 21.49 | 72.2 |
|  | Spring Boot 4.1.2 | 104,000 | 32.0 | 3.61 | 439.2 |
|  | Express 5.3.0 | 96,000 | 39.7 | 28.00 | 225.8 |
|  | Bun 1.4.4 | 288,000 | 13.5 | 23.33 | 3.6 |
|  | Apache httpd 2.4 | 48,000 | 49.4 | 0.81 | 38.2 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 29.97 | 7.2 |
| `/323k` | actix-web 4.19.0 | 18,000 | 48.3 | 0.68 | 5.7 |
|  | axum 0.8.9 | 18,000 | 52.5 | 0.69 | 10.4 |
|  | rama 0.4.0 | 18,000 | 56.1 | 0.71 | 10.0 |
|  | Spring Boot 4.1.2 | 18,000 | 132.5 | 1.08 | 48.5 |
|  | Express 5.3.0 | 14,000 | 285.7 | 5.91 | 51.3 |
|  | Bun 1.4.4 | 18,000 | 95.8 | 0.98 | 4.0 |
|  | Apache httpd 2.4 | 18,000 | 97.2 | 0.84 | 13.4 |
|  | nginx 1.30.6 | 18,000 | 67.0 | 0.68 | 5.9 |
| `/323k-fresh` | actix-web 4.19.0 | 18,000 | 55.5 | 0.70 | 7.5 |
|  | axum 0.8.9 | 18,000 | 60.8 | 0.71 | 13.0 |
|  | rama 0.4.0 | 18,000 | 63.8 | 0.71 | 13.4 |
|  | Spring Boot 4.1.2 | 18,000 | 157.6 | 1.65 | 760.2 |
|  | Express 5.3.0 | 10,000 | 373.5 | 12.28 | 434.0 |
|  | Bun 1.4.4 | 18,000 | 128.2 | 1.38 | 66.7 |
| `/json-40k` | actix-web 4.19.0 | 36,000 | 101.4 | 1.25 | 32.8 |
|  | axum 0.8.9 | 26,000 | 150.6 | 2.12 | 11.7 |
|  | rama 0.4.0 | 22,000 | 174.7 | 17.16 | 12.1 |
|  | Spring Boot 4.1.2 | 15,000 | 191.8 | 1.82 | 777.9 |
|  | Express 5.3.0 | 20,000 | 190.2 | 12.02 | 362.2 |
|  | Bun 1.4.4 | 36,000 | 104.2 | 5.04 | 75.1 |
| `/json-323k` | actix-web 4.19.0 | 5,000 | 759.8 | 2.98 | 6.7 |
|  | axum 0.8.9 | 3,000 | 1,155.8 | 3.60 | 9.5 |
|  | rama 0.4.0 | 3,250 | 1,165.3 | 3.78 | 11.3 |
|  | Spring Boot 4.1.2 | 3,250 | 1,171.1 | 14.82 | 1,634.7 |
|  | Express 5.3.0 | 3,000 | 1,306.9 | 14.48 | 466.7 |
|  | Bun 1.4.4 | 4,000 | 904.1 | 19.98 | 136.1 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web 4.19.0 | 3,399 | 292.6 | 294.4 | 38.8 | 17.6 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.6 | 42.6 | 28.5 |
|  | rama 0.4.0 | 3,399 | 292.6 | 296.3 | 44.6 | 27.0 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 144.8 | 107.2 |
|  | Express 5.3.0 | 3,385 | 292.9 | 302.7 | 305.9 | 84.2 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 296.4 | 86.8 | 177.1 |
|  | Apache httpd 2.4 | 1,517 | 292.6 | 29,568.9 | 74.2 | 50.9 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 331.2 | 35.9 | 17.1 |
| `/323k-fresh` | actix-web 4.19.0 | 3,399 | 292.6 | 293.9 | 54.0 | 245.2 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 50.3 | 272.1 |
|  | rama 0.4.0 | 3,399 | 292.6 | 295.8 | 51.1 | 268.0 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 174.3 | 434.9 |
|  | Express 5.3.0 | 3,376 | 293.0 | 308.8 | 411.4 | 358.5 |
|  | Bun 1.4.4 | 3,399 | 292.9 | 295.9 | 121.1 | 198.9 |
| `/json-40k` | actix-web 4.19.0 | 16,088 | 61.9 | 62.2 | 107.7 | 50.3 |
|  | axum 0.8.9 | 16,073 | 62.0 | 62.3 | 151.4 | 34.7 |
|  | rama 0.4.0 | 16,060 | 62.0 | 62.4 | 185.2 | 31.1 |
|  | Spring Boot 4.1.2 | 15,978 | 63.7 | 100.1 | 197.9 | 903.6 |
|  | Express 5.3.0 | 15,878 | 62.2 | 69.5 | 213.8 | 313.9 |
|  | Bun 1.4.4 | 16,076 | 61.9 | 63.4 | 118.9 | 78.3 |
| `/json-323k` | actix-web 4.19.0 | 3,372 | 293.4 | 304.0 | 784.8 | 203.2 |
|  | axum 0.8.9 | 3,360 | 294.1 | 309.9 | 1,162.6 | 198.2 |
|  | rama 0.4.0 | 3,360 | 294.1 | 333.3 | 1,162.6 | 200.7 |
|  | Spring Boot 4.1.2 | 3,179 | 303.4 | 484.7 | 1,249.2 | 1,800.4 |
|  | Express 5.3.0 | 2,918 | 337.2 | 405.1 | 1,372.8 | 508.9 |
|  | Bun 1.4.4 | 3,360 | 294.1 | 326.1 | 962.9 | 267.5 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web 4.19.0 | 49.10 | 91.5 | 838.5 | 2,766.5 | 24.81 | 24.6 |
| axum 0.8.9 | 49.35 | 91.9 | 687.3 | 2,326.2 | 30.35 | 57.3 |
| rama 0.4.0 | 49.15 | 91.6 | 739.2 | 2,319.6 | 30.41 | 57.1 |
| Spring Boot 4.1.2 | 49.06 | 91.4 | 721.2 | 2,035.9 | 26.46 | 48.5 |
| Express 5.3.0 | 39.19 | 73.0 | 922.5 | 1,061.2 | 46.29 | 360.0 |
| Bun 1.4.4 | 48.97 | 91.2 | 900.5 | 1,170.4 | 2.46 | 4.7 |
| Apache httpd 2.4 | 49.19 | 91.6 | 884.0 | 2,120.6 | 3.51 | 2.3 |
| nginx 1.30.6 | 49.30 | 91.8 | 732.2 | 3,266.5 | 2.60 | 6.4 |

1 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-89-33.
