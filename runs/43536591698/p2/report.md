# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | axum 0.8.9 | 256,000 | 13.1 | 5.11 | 89.6 |
|  | rama 0.4.0 | 224,000 | 16.7 | 21.79 | 72.8 |
|  | actix-web 4.19.0 | 512,000 | 7.7 | 27.17 | 39.6 |
| `/16k` | axum 0.8.9 | 352,000 | 8.5 | 23.99 | 81.2 |
|  | rama 0.4.0 | 352,000 | 10.6 | 17.23 | 81.2 |
|  | actix-web 4.19.0 | 352,000 | 8.7 | 20.89 | 55.2 |
| `/323k` | axum 0.8.9 | 18,000 | 50.1 | 0.68 | 10.3 |
|  | rama 0.4.0 | 18,000 | 54.5 | 0.69 | 9.7 |
|  | actix-web 4.19.0 | 18,000 | 47.1 | 0.69 | 5.7 |
| `/323k-fresh` | axum 0.8.9 | 18,000 | 57.2 | 0.72 | 13.1 |
|  | rama 0.4.0 | 18,000 | 60.3 | 0.71 | 12.1 |
|  | actix-web 4.19.0 | 18,000 | 54.5 | 0.70 | 7.8 |
| `/json-40k` | axum 0.8.9 | 28,000 | 141.3 | 1.47 | 11.5 |
|  | rama 0.4.0 | 22,000 | 174.6 | 41.44 | 11.8 |
|  | actix-web 4.19.0 | 36,000 | 101.5 | 1.28 | 32.8 |
| `/json-323k` | axum 0.8.9 | 3,250 | 1,137.0 | 3.40 | 8.6 |
|  | rama 0.4.0 | 3,250 | 1,151.9 | 3.36 | 10.8 |
|  | actix-web 4.19.0 | 5,000 | 753.6 | 2.87 | 6.8 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | axum 0.8.9 | 3,399 | 292.6 | 294.7 | 40.8 | 29.3 |
|  | rama 0.4.0 | 3,399 | 292.6 | 296.2 | 44.6 | 28.7 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 293.6 | 39.9 | 17.8 |
| `/323k-fresh` | axum 0.8.9 | 3,399 | 292.6 | 294.6 | 49.9 | 268.8 |
|  | rama 0.4.0 | 3,399 | 292.6 | 295.8 | 52.5 | 255.6 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.1 | 55.1 | 256.1 |
| `/json-40k` | axum 0.8.9 | 16,072 | 62.0 | 62.3 | 151.2 | 36.0 |
|  | rama 0.4.0 | 16,059 | 62.0 | 62.4 | 183.2 | 33.2 |
|  | actix-web 4.19.0 | 16,084 | 61.9 | 62.2 | 107.7 | 50.5 |
| `/json-323k` | axum 0.8.9 | 3,351 | 294.9 | 312.3 | 1,175.4 | 202.3 |
|  | rama 0.4.0 | 3,361 | 294.0 | 309.1 | 1,158.8 | 211.6 |
|  | actix-web 4.19.0 | 3,372 | 293.4 | 301.9 | 777.6 | 185.4 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| axum 0.8.9 | 49.10 | 91.5 | 833.6 | 1,958.4 | 29.78 | 56.7 |
| rama 0.4.0 | 49.28 | 91.8 | 666.0 | 2,490.9 | 29.44 | 54.8 |
| actix-web 4.19.0 | 49.06 | 91.4 | 778.0 | 2,691.8 | 24.27 | 24.1 |

2 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-22-56.
