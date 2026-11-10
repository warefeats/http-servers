# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web 4.19.0 | 480,000 | 8.2 | 23.90 | 39.7 |
|  | axum 0.8.9 | 240,000 | 15.7 | 15.07 | 77.2 |
|  | Spring Boot 4.1.2 | 120,000 | 28.6 | 7.15 | 541.4 |
|  | Express 5.3.0 | 104,000 | 34.6 | 4.56 | 311.8 |
|  | Bun 1.4.4 | 320,000 | 12.4 | 21.27 | 45.5 |
| `/16k` | actix-web 4.19.0 | 352,000 | 9.2 | 19.04 | 55.3 |
|  | axum 0.8.9 | 352,000 | 9.8 | 23.26 | 73.7 |
|  | Spring Boot 4.1.2 | 120,000 | 30.6 | 8.27 | 345.0 |
|  | Express 5.3.0 | 96,000 | 40.9 | 36.32 | 200.4 |
|  | Bun 1.4.4 | 256,000 | 14.4 | 19.39 | 3.1 |
|  | Apache httpd 2.4 | 56,000 | 48.1 | 22.32 | 38.3 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 42.78 | 7.3 |
| `/323k` | actix-web 4.19.0 | 18,000 | 50.1 | 0.69 | 5.8 |
|  | axum 0.8.9 | 18,000 | 55.2 | 0.70 | 10.1 |
|  | Spring Boot 4.1.2 | 18,000 | 140.2 | 1.18 | 55.4 |
|  | Express 5.3.0 | 13,000 | 291.3 | 4.56 | 56.4 |
|  | Bun 1.4.4 | 18,000 | 100.7 | 1.10 | 3.6 |
|  | Apache httpd 2.4 | 18,000 | 93.7 | 0.80 | 18.1 |
|  | nginx 1.30.6 | 18,000 | 62.5 | 0.69 | 5.9 |
| `/323k-fresh` | actix-web 4.19.0 | 18,000 | 57.5 | 0.72 | 7.5 |
|  | axum 0.8.9 | 18,000 | 61.4 | 0.71 | 12.5 |
|  | Spring Boot 4.1.2 | 18,000 | 160.4 | 1.81 | 775.1 |
|  | Express 5.3.0 | 10,000 | 361.9 | 12.81 | 450.9 |
|  | Bun 1.4.4 | 18,000 | 132.7 | 1.55 | 68.3 |
| `/json-40k` | actix-web 4.19.0 | 36,000 | 102.5 | 1.29 | 32.9 |
|  | axum 0.8.9 | 26,000 | 145.0 | 1.14 | 12.3 |
|  | Spring Boot 4.1.2 | 20,000 | 199.4 | 28.71 | 994.0 |
|  | Express 5.3.0 | 20,000 | 193.3 | 10.64 | 367.9 |
|  | Bun 1.4.4 | 32,000 | 109.8 | 3.72 | 71.7 |
| `/json-323k` | actix-web 4.19.0 | 5,000 | 759.2 | 3.05 | 6.6 |
|  | axum 0.8.9 | 3,250 | 1,151.4 | 3.32 | 8.5 |
|  | Spring Boot 4.1.2 | 3,250 | 1,162.1 | 15.44 | 1,329.7 |
|  | Express 5.3.0 | 3,000 | 1,300.1 | 13.97 | 445.4 |
|  | Bun 1.4.4 | 4,000 | 960.5 | 18.43 | 135.7 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web 4.19.0 | 3,399 | 292.6 | 293.6 | 38.7 | 17.5 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 39.9 | 29.5 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.5 | 142.4 | 107.0 |
|  | Express 5.3.0 | 3,389 | 292.9 | 300.0 | 304.3 | 89.8 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 296.2 | 84.8 | 192.3 |
|  | Apache httpd 2.4 | 1,521 | 292.6 | 29,566.3 | 71.6 | 48.6 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 331.2 | 35.4 | 16.6 |
| `/323k-fresh` | actix-web 4.19.0 | 3,399 | 292.6 | 294.8 | 53.3 | 264.5 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 47.9 | 273.8 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 171.9 | 409.1 |
|  | Express 5.3.0 | 3,377 | 293.0 | 304.5 | 401.8 | 351.8 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 295.9 | 118.2 | 205.2 |
| `/json-40k` | actix-web 4.19.0 | 16,096 | 61.9 | 62.2 | 108.0 | 50.4 |
|  | axum 0.8.9 | 16,068 | 62.0 | 62.4 | 172.1 | 34.0 |
|  | Spring Boot 4.1.2 | 15,970 | 63.6 | 100.1 | 196.7 | 803.2 |
|  | Express 5.3.0 | 15,917 | 62.2 | 69.0 | 213.5 | 324.3 |
|  | Bun 1.4.4 | 16,074 | 61.9 | 63.3 | 128.4 | 75.4 |
| `/json-323k` | actix-web 4.19.0 | 3,372 | 293.4 | 300.7 | 780.3 | 203.8 |
|  | axum 0.8.9 | 3,362 | 294.0 | 317.7 | 1,162.4 | 234.3 |
|  | Spring Boot 4.1.2 | 3,114 | 307.8 | 567.4 | 1,279.6 | 2,459.3 |
|  | Express 5.3.0 | 2,935 | 335.2 | 435.6 | 1,365.0 | 506.7 |
|  | Bun 1.4.4 | 3,360 | 294.1 | 313.9 | 974.4 | 259.6 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web 4.19.0 | 49.10 | 91.5 | 705.3 | 1,428.7 | 24.66 | 21.0 |
| axum 0.8.9 | 49.19 | 91.6 | 818.7 | 1,648.6 | 29.82 | 56.8 |
| Spring Boot 4.1.2 | 48.88 | 91.1 | 718.6 | 1,951.3 | 28.01 | 46.3 |
| Express 5.3.0 | 38.74 | 72.2 | 915.1 | 1,027.6 | 46.98 | 351.7 |
| Bun 1.4.4 | 49.21 | 91.7 | 843.7 | 1,878.4 | 2.48 | 4.3 |
| Apache httpd 2.4 | 49.31 | 91.9 | 863.9 | 1,034.0 | 3.62 | 2.3 |
| nginx 1.30.6 | 49.17 | 91.6 | 747.5 | 1,388.1 | 2.65 | 6.5 |

1 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-93-191.
