# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web 4.19.0 | 512,000 | 7.6 | 23.85 | 39.6 |
|  | axum 0.8.9 | 288,000 | 13.0 | 5.75 | 86.7 |
|  | rama 0.4.0 | 224,000 | 16.8 | 19.58 | 67.8 |
| `/16k` | actix-web 4.19.0 | 352,000 | 8.8 | 17.93 | 55.2 |
|  | axum 0.8.9 | 352,000 | 8.8 | 29.80 | 81.4 |
|  | rama 0.4.0 | 352,000 | 10.7 | 19.47 | 78.8 |
| `/323k` | actix-web 4.19.0 | 18,000 | 47.9 | 0.69 | 5.8 |
|  | axum 0.8.9 | 18,000 | 51.7 | 0.69 | 10.4 |
|  | rama 0.4.0 | 18,000 | 55.4 | 0.71 | 10.2 |
| `/323k-fresh` | actix-web 4.19.0 | 18,000 | 55.2 | 0.69 | 7.2 |
|  | axum 0.8.9 | 18,000 | 58.8 | 0.71 | 12.4 |
|  | rama 0.4.0 | 18,000 | 62.0 | 0.71 | 12.3 |
| `/json-40k` | actix-web 4.19.0 | 36,000 | 101.1 | 1.24 | 32.8 |
|  | axum 0.8.9 | 28,000 | 141.6 | 2.09 | 11.8 |
|  | rama 0.4.0 | 20,000 | 174.4 | 1.04 | 11.4 |
| `/json-323k` | actix-web 4.19.0 | 5,000 | 756.1 | 3.43 | 6.7 |
|  | axum 0.8.9 | 3,750 | 1,057.8 | 10.56 | 7.4 |
|  | rama 0.4.0 | 3,250 | 1,162.5 | 3.59 | 11.1 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web 4.19.0 | 3,399 | 292.6 | 294.5 | 39.7 | 17.9 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.9 | 41.7 | 28.5 |
|  | rama 0.4.0 | 3,399 | 292.6 | 294.5 | 47.1 | 27.7 |
| `/323k-fresh` | actix-web 4.19.0 | 3,399 | 292.6 | 295.3 | 56.7 | 240.8 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.5 | 49.9 | 263.0 |
|  | rama 0.4.0 | 3,399 | 292.6 | 295.9 | 52.5 | 261.4 |
| `/json-40k` | actix-web 4.19.0 | 16,096 | 61.9 | 62.3 | 107.5 | 50.5 |
|  | axum 0.8.9 | 16,070 | 62.0 | 62.4 | 150.9 | 33.4 |
|  | rama 0.4.0 | 16,059 | 62.0 | 62.4 | 187.5 | 33.9 |
| `/json-323k` | actix-web 4.19.0 | 3,372 | 293.4 | 300.1 | 777.5 | 187.9 |
|  | axum 0.8.9 | 3,363 | 293.9 | 315.0 | 1,112.5 | 199.6 |
|  | rama 0.4.0 | 3,362 | 294.0 | 325.8 | 1,158.1 | 213.2 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web 4.19.0 | 49.26 | 91.8 | 1,059.2 | 2,235.0 | 23.92 | 22.0 |
| axum 0.8.9 | 49.15 | 91.6 | 804.6 | 2,240.5 | 29.10 | 56.8 |
| rama 0.4.0 | 49.06 | 91.4 | 751.2 | 1,283.7 | 30.49 | 57.3 |

1 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-20-234.
