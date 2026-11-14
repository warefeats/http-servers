# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | axum 0.8.9 | 288,000 | 13.1 | 9.77 | 84.5 |
|  | rama 0.4.0 | 224,000 | 16.8 | 19.65 | 68.3 |
|  | Spring Boot 4.1.2 | 120,000 | 28.8 | 9.47 | 558.4 |
|  | Express 5.3.0 | 104,000 | 35.3 | 7.30 | 320.5 |
|  | Bun 1.4.4 | 320,000 | 12.5 | 40.46 | 43.3 |
|  | actix-web 4.19.0 | 480,000 | 8.1 | 21.41 | 39.6 |
| `/16k` | axum 0.8.9 | 352,000 | 10.0 | 27.60 | 83.5 |
|  | rama 0.4.0 | 320,000 | 12.1 | 14.34 | 72.3 |
|  | Spring Boot 4.1.2 | 120,000 | 30.9 | 8.50 | 354.0 |
|  | Express 5.3.0 | 88,000 | 42.5 | 3.13 | 197.9 |
|  | Bun 1.4.4 | 256,000 | 14.6 | 13.52 | 3.2 |
|  | actix-web 4.19.0 | 352,000 | 9.3 | 21.40 | 55.3 |
|  | Apache httpd 2.4 | 48,000 | 49.1 | 0.83 | 38.5 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 30.80 | 7.2 |
| `/323k` | axum 0.8.9 | 18,000 | 54.8 | 0.71 | 10.6 |
|  | rama 0.4.0 | 18,000 | 60.9 | 0.72 | 9.6 |
|  | Spring Boot 4.1.2 | 18,000 | 141.1 | 1.16 | 66.5 |
|  | Express 5.3.0 | 13,000 | 290.0 | 2.53 | 49.7 |
|  | Bun 1.4.4 | 18,000 | 99.9 | 1.09 | 4.2 |
|  | actix-web 4.19.0 | 18,000 | 51.0 | 0.69 | 5.4 |
|  | Apache httpd 2.4 | 18,000 | 97.6 | 0.84 | 13.9 |
|  | nginx 1.30.6 | 18,000 | 67.2 | 0.72 | 5.9 |
| `/323k-fresh` | axum 0.8.9 | 18,000 | 64.3 | 0.73 | 12.6 |
|  | rama 0.4.0 | 18,000 | 67.0 | 0.73 | 13.9 |
|  | Spring Boot 4.1.2 | 18,000 | 162.6 | 2.05 | 778.8 |
|  | Express 5.3.0 | 10,000 | 358.7 | 12.29 | 453.1 |
|  | Bun 1.4.4 | 18,000 | 131.0 | 1.53 | 60.6 |
|  | actix-web 4.19.0 | 18,000 | 58.9 | 0.72 | 7.8 |
| `/json-40k` | axum 0.8.9 | 28,000 | 142.5 | 6.07 | 11.9 |
|  | rama 0.4.0 | 22,000 | 173.9 | 2.14 | 11.5 |
|  | Spring Boot 4.1.2 | 15,000 | 200.6 | 3.72 | 798.3 |
|  | Express 5.3.0 | 20,000 | 193.7 | 24.27 | 366.0 |
|  | Bun 1.4.4 | 32,000 | 112.4 | 3.71 | 68.9 |
|  | actix-web 4.19.0 | 36,000 | 102.4 | 1.27 | 32.9 |
| `/json-323k` | axum 0.8.9 | 3,500 | 1,127.5 | 44.26 | 8.8 |
|  | rama 0.4.0 | 3,250 | 1,165.1 | 3.41 | 11.4 |
|  | Spring Boot 4.1.2 | 3,000 | 1,302.5 | 17.45 | 1,428.2 |
|  | Express 5.3.0 | 3,000 | 1,312.6 | 20.55 | 447.0 |
|  | Bun 1.4.4 | 4,000 | 930.6 | 11.41 | 129.1 |
|  | actix-web 4.19.0 | 5,000 | 759.8 | 3.04 | 6.6 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | axum 0.8.9 | 3,399 | 292.6 | 293.8 | 41.7 | 28.6 |
|  | rama 0.4.0 | 3,399 | 292.6 | 294.8 | 44.6 | 28.0 |
|  | Spring Boot 4.1.2 | 3,432 | 287.5 | 333.6 | 146.1 | 93.8 |
|  | Express 5.3.0 | 3,387 | 292.9 | 301.8 | 304.7 | 91.5 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 295.9 | 84.3 | 186.2 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.0 | 39.9 | 17.3 |
|  | Apache httpd 2.4 | 1,511 | 292.6 | 29,570.0 | 75.0 | 50.0 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 330.3 | 38.1 | 16.8 |
| `/323k-fresh` | axum 0.8.9 | 3,399 | 292.6 | 296.2 | 48.5 | 281.2 |
|  | rama 0.4.0 | 3,399 | 292.6 | 294.8 | 52.4 | 280.1 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 175.5 | 462.3 |
|  | Express 5.3.0 | 3,377 | 293.0 | 305.7 | 402.4 | 360.8 |
|  | Bun 1.4.4 | 3,399 | 292.9 | 296.5 | 117.7 | 222.4 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.9 | 52.4 | 245.3 |
| `/json-40k` | axum 0.8.9 | 16,072 | 62.0 | 62.3 | 152.2 | 37.6 |
|  | rama 0.4.0 | 16,064 | 62.0 | 62.4 | 184.8 | 31.3 |
|  | Spring Boot 4.1.2 | 15,959 | 63.7 | 100.1 | 200.0 | 811.7 |
|  | Express 5.3.0 | 15,925 | 62.2 | 67.7 | 213.0 | 313.4 |
|  | Bun 1.4.4 | 16,074 | 61.9 | 63.2 | 124.0 | 77.0 |
|  | actix-web 4.19.0 | 16,090 | 61.9 | 62.3 | 107.9 | 50.5 |
| `/json-323k` | axum 0.8.9 | 3,302 | 299.4 | 350.9 | 1,191.3 | 204.1 |
|  | rama 0.4.0 | 3,362 | 294.0 | 316.5 | 1,156.2 | 242.9 |
|  | Spring Boot 4.1.2 | 2,890 | 323.0 | 878.0 | 1,377.7 | 2,157.3 |
|  | Express 5.3.0 | 2,966 | 331.0 | 397.1 | 1,349.7 | 514.4 |
|  | Bun 1.4.4 | 3,358 | 294.2 | 317.7 | 975.5 | 252.9 |
|  | actix-web 4.19.0 | 3,372 | 293.4 | 302.7 | 784.3 | 207.5 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| axum 0.8.9 | 49.11 | 91.5 | 609.3 | 2,025.1 | 29.83 | 56.0 |
| rama 0.4.0 | 48.95 | 91.2 | 814.6 | 2,807.7 | 30.67 | 57.1 |
| Spring Boot 4.1.2 | 49.12 | 91.5 | 875.8 | 1,198.5 | 27.26 | 36.3 |
| Express 5.3.0 | 38.27 | 71.3 | 935.3 | 1,077.7 | 47.37 | 352.7 |
| Bun 1.4.4 | 49.19 | 91.6 | 767.4 | 1,916.0 | 2.50 | 4.4 |
| actix-web 4.19.0 | 49.15 | 91.6 | 924.1 | 2,697.8 | 25.58 | 20.8 |
| Apache httpd 2.4 | 49.08 | 91.4 | 850.8 | 1,826.7 | 3.76 | 2.2 |
| nginx 1.30.6 | 49.17 | 91.6 | 853.7 | 1,965.4 | 2.85 | 6.5 |

2 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-89-47.
