# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | rama 0.4.0 | 224,000 | 16.7 | 16.21 | 78.8 |
|  | actix-web 4.19.0 | 512,000 | 7.7 | 22.56 | 39.4 |
|  | axum 0.8.9 | 256,000 | 14.7 | 18.46 | 79.2 |
| `/16k` | rama 0.4.0 | 352,000 | 10.7 | 18.55 | 76.6 |
|  | actix-web 4.19.0 | 352,000 | 8.7 | 23.21 | 55.3 |
|  | axum 0.8.9 | 352,000 | 8.7 | 23.22 | 86.5 |
| `/323k` | rama 0.4.0 | 18,000 | 54.4 | 0.70 | 10.5 |
|  | actix-web 4.19.0 | 18,000 | 47.9 | 0.67 | 5.7 |
|  | axum 0.8.9 | 18,000 | 50.6 | 0.70 | 10.9 |
| `/323k-fresh` | rama 0.4.0 | 18,000 | 60.5 | 0.71 | 12.2 |
|  | actix-web 4.19.0 | 18,000 | 55.6 | 0.68 | 8.2 |
|  | axum 0.8.9 | 18,000 | 59.9 | 0.70 | 12.6 |
| `/json-40k` | rama 0.4.0 | 22,000 | 174.5 | 3.99 | 11.5 |
|  | actix-web 4.19.0 | 36,000 | 100.9 | 1.31 | 33.0 |
|  | axum 0.8.9 | 24,000 | 152.9 | 1.06 | 11.4 |
| `/json-323k` | rama 0.4.0 | 3,250 | 1,175.1 | 3.83 | 10.5 |
|  | actix-web 4.19.0 | 5,000 | 757.0 | 3.03 | 6.5 |
|  | axum 0.8.9 | 3,250 | 1,186.6 | 6.65 | 8.9 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | rama 0.4.0 | 3,399 | 292.6 | 294.6 | 45.5 | 27.6 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.9 | 40.1 | 17.7 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 42.7 | 30.6 |
| `/323k-fresh` | rama 0.4.0 | 3,399 | 292.6 | 295.7 | 52.8 | 254.3 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 295.3 | 54.1 | 234.7 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.8 | 49.9 | 269.2 |
| `/json-40k` | rama 0.4.0 | 16,062 | 62.0 | 62.4 | 185.6 | 34.1 |
|  | actix-web 4.19.0 | 16,097 | 61.9 | 62.2 | 108.3 | 50.5 |
|  | axum 0.8.9 | 16,073 | 62.0 | 62.3 | 151.1 | 32.5 |
| `/json-323k` | rama 0.4.0 | 3,359 | 294.1 | 323.7 | 1,164.0 | 241.9 |
|  | actix-web 4.19.0 | 3,372 | 293.4 | 300.1 | 783.4 | 208.3 |
|  | axum 0.8.9 | 3,317 | 297.4 | 335.9 | 1,184.3 | 264.0 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| rama 0.4.0 | 49.06 | 91.4 | 603.8 | 3,496.7 | 30.00 | 57.1 |
| actix-web 4.19.0 | 49.15 | 91.6 | 774.4 | 2,562.7 | 24.41 | 19.4 |
| axum 0.8.9 | 49.22 | 91.7 | 881.5 | 1,048.8 | 29.91 | 57.9 |

3 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-30-179.
