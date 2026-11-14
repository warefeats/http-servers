# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web 4.19.0 | 490,667 | 8.1 | 25.47 | 39.6 |
|  | axum 0.8.9 | 272,000 | 13.1 | 9.77 | 79.2 |
|  | rama 0.4.0 | 218,667 | 16.8 | 17.18 | 68.3 |
|  | Spring Boot 4.1.2 | 128,000 | 28.0 | 9.47 | 649.0 |
|  | Express 5.3.0 | 106,667 | 34.8 | 7.30 | 320.5 |
|  | Bun 1.4.4 | 309,333 | 12.5 | 18.49 | 45.6 |
| `/16k` | actix-web 4.19.0 | 352,000 | 9.3 | 16.60 | 55.2 |
|  | axum 0.8.9 | 352,000 | 10.0 | 21.93 | 83.5 |
|  | rama 0.4.0 | 330,667 | 12.1 | 18.53 | 72.3 |
|  | Spring Boot 4.1.2 | 114,667 | 31.3 | 8.50 | 354.0 |
|  | Express 5.3.0 | 90,667 | 42.5 | 11.03 | 197.9 |
|  | Bun 1.4.4 | 266,667 | 14.6 | 16.90 | 3.6 |
|  | Apache httpd 2.4 | 48,000 | 49.1 | 0.81 | 38.5 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 29.97 | 7.2 |
| `/323k` | actix-web 4.19.0 | 18,000 | 51.0 | 0.69 | 5.7 |
|  | axum 0.8.9 | 18,000 | 54.8 | 0.71 | 10.5 |
|  | rama 0.4.0 | 18,000 | 59.6 | 0.72 | 10.0 |
|  | Spring Boot 4.1.2 | 18,000 | 141.1 | 1.16 | 66.5 |
|  | Express 5.3.0 | 13,333 | 290.0 | 3.20 | 49.7 |
|  | Bun 1.4.4 | 18,000 | 99.4 | 1.04 | 4.0 |
|  | Apache httpd 2.4 | 18,000 | 97.2 | 0.84 | 13.9 |
|  | nginx 1.30.6 | 18,000 | 67.0 | 0.70 | 5.9 |
| `/323k-fresh` | actix-web 4.19.0 | 18,000 | 58.4 | 0.71 | 7.7 |
|  | axum 0.8.9 | 18,000 | 63.9 | 0.73 | 13.0 |
|  | rama 0.4.0 | 18,000 | 67.0 | 0.73 | 13.4 |
|  | Spring Boot 4.1.2 | 18,000 | 162.6 | 2.03 | 778.8 |
|  | Express 5.3.0 | 10,333 | 358.7 | 12.29 | 447.2 |
|  | Bun 1.4.4 | 18,000 | 131.0 | 1.49 | 62.5 |
| `/json-40k` | actix-web 4.19.0 | 36,000 | 102.4 | 1.27 | 32.9 |
|  | axum 0.8.9 | 26,667 | 150.6 | 6.07 | 11.7 |
|  | rama 0.4.0 | 22,000 | 174.4 | 4.33 | 11.9 |
|  | Spring Boot 4.1.2 | 15,000 | 200.6 | 3.72 | 784.8 |
|  | Express 5.3.0 | 20,000 | 193.7 | 14.14 | 365.7 |
|  | Bun 1.4.4 | 34,667 | 111.3 | 5.04 | 68.9 |
| `/json-323k` | actix-web 4.19.0 | 5,000 | 759.8 | 2.98 | 6.7 |
|  | axum 0.8.9 | 3,333 | 1,127.5 | 3.60 | 8.8 |
|  | rama 0.4.0 | 3,250 | 1,165.3 | 3.76 | 11.3 |
|  | Spring Boot 4.1.2 | 3,083 | 1,295.1 | 17.45 | 1,439.7 |
|  | Express 5.3.0 | 3,000 | 1,312.6 | 18.08 | 466.7 |
|  | Bun 1.4.4 | 4,000 | 930.6 | 17.07 | 136.1 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web 4.19.0 | 3,399 | 292.6 | 294.2 | 39.6 | 17.6 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 41.7 | 28.6 |
|  | rama 0.4.0 | 3,399 | 292.6 | 295.1 | 44.6 | 28.0 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 144.8 | 104.3 |
|  | Express 5.3.0 | 3,386 | 292.9 | 302.2 | 305.6 | 88.2 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 296.2 | 84.3 | 180.7 |
|  | Apache httpd 2.4 | 1,511 | 292.6 | 29,568.9 | 74.2 | 50.7 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 330.5 | 36.9 | 16.8 |
| `/323k-fresh` | actix-web 4.19.0 | 3,399 | 292.6 | 294.9 | 52.4 | 245.3 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 49.3 | 279.8 |
|  | rama 0.4.0 | 3,399 | 292.6 | 295.4 | 51.2 | 273.9 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 175.5 | 434.9 |
|  | Express 5.3.0 | 3,377 | 293.0 | 308.8 | 402.4 | 358.5 |
|  | Bun 1.4.4 | 3,399 | 292.9 | 295.9 | 119.8 | 222.4 |
| `/json-40k` | actix-web 4.19.0 | 16,088 | 61.9 | 62.3 | 107.8 | 50.5 |
|  | axum 0.8.9 | 16,072 | 62.0 | 62.3 | 152.2 | 34.7 |
|  | rama 0.4.0 | 16,060 | 62.0 | 62.4 | 184.8 | 31.3 |
|  | Spring Boot 4.1.2 | 15,959 | 63.7 | 100.1 | 199.0 | 811.7 |
|  | Express 5.3.0 | 15,910 | 62.2 | 68.4 | 213.8 | 313.4 |
|  | Bun 1.4.4 | 16,076 | 61.9 | 63.2 | 124.0 | 78.3 |
| `/json-323k` | actix-web 4.19.0 | 3,372 | 293.4 | 304.0 | 784.7 | 203.2 |
|  | axum 0.8.9 | 3,360 | 294.1 | 309.9 | 1,162.6 | 204.1 |
|  | rama 0.4.0 | 3,361 | 294.1 | 330.5 | 1,162.6 | 210.0 |
|  | Spring Boot 4.1.2 | 3,179 | 303.4 | 484.7 | 1,249.2 | 2,141.6 |
|  | Express 5.3.0 | 2,927 | 337.2 | 405.1 | 1,368.8 | 514.4 |
|  | Bun 1.4.4 | 3,358 | 294.2 | 322.6 | 975.5 | 267.5 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web 4.19.0 | 49.14 | 91.5 | 924.1 | 2,766.5 | 24.81 | 21.1 |
| axum 0.8.9 | 49.11 | 91.5 | 687.3 | 2,189.1 | 30.35 | 56.7 |
| rama 0.4.0 | 49.15 | 91.6 | 739.2 | 2,321.0 | 30.41 | 57.1 |
| Spring Boot 4.1.2 | 49.06 | 91.4 | 721.2 | 2,035.9 | 27.26 | 46.3 |
| Express 5.3.0 | 38.27 | 71.3 | 926.4 | 1,061.2 | 47.37 | 355.2 |
| Bun 1.4.4 | 49.19 | 91.6 | 900.5 | 1,916.0 | 2.50 | 4.4 |
| Apache httpd 2.4 | 49.17 | 91.6 | 850.8 | 2,120.6 | 3.60 | 2.3 |
| nginx 1.30.6 | 49.26 | 91.8 | 809.8 | 1,997.9 | 2.67 | 6.5 |

6 pass(es) over 3 instance pairs; within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-89-33.
