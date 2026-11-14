# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web 4.19.0 | 512,000 | 7.7 | 23.85 | 39.6 |
|  | axum 0.8.9 | 266,667 | 13.1 | 5.75 | 86.7 |
|  | rama 0.4.0 | 224,000 | 16.7 | 19.58 | 72.8 |
| `/16k` | actix-web 4.19.0 | 352,000 | 8.7 | 20.89 | 55.2 |
|  | axum 0.8.9 | 352,000 | 8.7 | 23.99 | 81.4 |
|  | rama 0.4.0 | 352,000 | 10.7 | 18.55 | 78.8 |
| `/323k` | actix-web 4.19.0 | 18,000 | 47.9 | 0.69 | 5.7 |
|  | axum 0.8.9 | 18,000 | 50.6 | 0.69 | 10.4 |
|  | rama 0.4.0 | 18,000 | 54.5 | 0.70 | 10.2 |
| `/323k-fresh` | actix-web 4.19.0 | 18,000 | 55.2 | 0.69 | 7.8 |
|  | axum 0.8.9 | 18,000 | 58.8 | 0.71 | 12.6 |
|  | rama 0.4.0 | 18,000 | 60.5 | 0.71 | 12.2 |
| `/json-40k` | actix-web 4.19.0 | 36,000 | 101.1 | 1.28 | 32.8 |
|  | axum 0.8.9 | 26,667 | 141.6 | 1.47 | 11.5 |
|  | rama 0.4.0 | 21,333 | 174.5 | 3.99 | 11.5 |
| `/json-323k` | actix-web 4.19.0 | 5,000 | 756.1 | 3.03 | 6.7 |
|  | axum 0.8.9 | 3,417 | 1,137.0 | 6.65 | 8.6 |
|  | rama 0.4.0 | 3,250 | 1,162.5 | 3.59 | 10.8 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web 4.19.0 | 3,399 | 292.6 | 294.5 | 39.9 | 17.8 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 41.7 | 29.3 |
|  | rama 0.4.0 | 3,399 | 292.6 | 294.6 | 45.5 | 27.7 |
| `/323k-fresh` | actix-web 4.19.0 | 3,399 | 292.6 | 295.3 | 55.1 | 240.8 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.5 | 49.9 | 268.8 |
|  | rama 0.4.0 | 3,399 | 292.6 | 295.8 | 52.5 | 255.6 |
| `/json-40k` | actix-web 4.19.0 | 16,096 | 61.9 | 62.2 | 107.7 | 50.5 |
|  | axum 0.8.9 | 16,072 | 62.0 | 62.3 | 151.1 | 33.4 |
|  | rama 0.4.0 | 16,059 | 62.0 | 62.4 | 185.6 | 33.9 |
| `/json-323k` | actix-web 4.19.0 | 3,372 | 293.4 | 300.1 | 777.6 | 187.9 |
|  | axum 0.8.9 | 3,351 | 294.9 | 315.0 | 1,175.4 | 202.3 |
|  | rama 0.4.0 | 3,361 | 294.0 | 323.7 | 1,158.8 | 213.2 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web 4.19.0 | 49.15 | 91.6 | 778.0 | 2,562.7 | 24.27 | 22.0 |
| axum 0.8.9 | 49.15 | 91.6 | 833.6 | 1,958.4 | 29.78 | 56.8 |
| rama 0.4.0 | 49.06 | 91.4 | 666.0 | 2,490.9 | 30.00 | 57.1 |

6 pass(es) over 3 instance pairs; within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-20-234.
