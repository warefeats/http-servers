# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | axum 0.8.9 | 256,000 | 14.7 | 12.23 | 82.3 |
|  | Spring Boot 4.1.2 | 120,000 | 28.9 | 7.44 | 549.3 |
|  | Express 5.3.0 | 112,000 | 34.1 | 20.66 | 338.6 |
|  | Bun 1.4.4 | 320,000 | 12.5 | 31.51 | 46.3 |
|  | actix-web 4.19.0 | 480,000 | 8.0 | 23.96 | 39.5 |
| `/16k` | axum 0.8.9 | 352,000 | 9.9 | 19.70 | 82.5 |
|  | Spring Boot 4.1.2 | 128,000 | 30.4 | 23.63 | 546.4 |
|  | Express 5.3.0 | 88,000 | 42.1 | 6.66 | 196.3 |
|  | Bun 1.4.4 | 256,000 | 14.5 | 15.37 | 3.1 |
|  | actix-web 4.19.0 | 352,000 | 9.2 | 25.86 | 55.2 |
|  | Apache httpd 2.4 | 44,000 | 49.6 | 0.58 | 37.8 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 30.59 | 7.3 |
| `/323k` | axum 0.8.9 | 18,000 | 54.5 | 0.70 | 10.5 |
|  | Spring Boot 4.1.2 | 18,000 | 146.8 | 1.28 | 67.2 |
|  | Express 5.3.0 | 14,000 | 285.9 | 9.68 | 46.1 |
|  | Bun 1.4.4 | 18,000 | 96.5 | 1.06 | 3.4 |
|  | actix-web 4.19.0 | 18,000 | 50.3 | 0.69 | 5.6 |
|  | Apache httpd 2.4 | 18,000 | 94.8 | 0.83 | 19.0 |
|  | nginx 1.30.6 | 18,000 | 62.5 | 0.68 | 5.9 |
| `/323k-fresh` | axum 0.8.9 | 18,000 | 62.9 | 0.73 | 13.4 |
|  | Spring Boot 4.1.2 | 18,000 | 161.9 | 1.76 | 802.7 |
|  | Express 5.3.0 | 10,000 | 349.7 | 10.57 | 461.3 |
|  | Bun 1.4.4 | 18,000 | 128.7 | 1.42 | 69.4 |
|  | actix-web 4.19.0 | 18,000 | 57.8 | 0.70 | 7.7 |
| `/json-40k` | axum 0.8.9 | 28,000 | 143.1 | 47.52 | 11.7 |
|  | Spring Boot 4.1.2 | 22,000 | 178.1 | 10.33 | 961.1 |
|  | Express 5.3.0 | 20,000 | 193.4 | 21.90 | 360.1 |
|  | Bun 1.4.4 | 32,000 | 109.9 | 3.95 | 76.9 |
|  | actix-web 4.19.0 | 36,000 | 102.1 | 1.29 | 33.0 |
| `/json-323k` | axum 0.8.9 | 3,250 | 1,188.0 | 8.35 | 9.0 |
|  | Spring Boot 4.1.2 | 3,250 | 1,141.4 | 11.65 | 1,555.9 |
|  | Express 5.3.0 | 3,000 | 1,301.6 | 13.61 | 447.7 |
|  | Bun 1.4.4 | 4,000 | 920.5 | 10.13 | 136.4 |
|  | actix-web 4.19.0 | 5,000 | 759.0 | 2.94 | 6.6 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | axum 0.8.9 | 3,399 | 292.6 | 295.7 | 39.8 | 29.8 |
|  | Spring Boot 4.1.2 | 3,432 | 287.5 | 333.5 | 147.4 | 123.2 |
|  | Express 5.3.0 | 3,387 | 292.9 | 302.7 | 302.9 | 87.0 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 296.0 | 84.3 | 220.8 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 295.2 | 38.7 | 17.6 |
|  | Apache httpd 2.4 | 1,523 | 292.6 | 29,564.0 | 74.4 | 49.3 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 330.7 | 37.1 | 17.4 |
| `/323k-fresh` | axum 0.8.9 | 3,399 | 292.6 | 296.5 | 48.2 | 306.2 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 172.3 | 431.6 |
|  | Express 5.3.0 | 3,375 | 293.0 | 312.0 | 466.3 | 364.2 |
|  | Bun 1.4.4 | 3,399 | 292.9 | 296.1 | 116.7 | 260.7 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.5 | 52.4 | 287.3 |
| `/json-40k` | axum 0.8.9 | 16,069 | 62.0 | 62.4 | 154.5 | 34.0 |
|  | Spring Boot 4.1.2 | 15,949 | 63.7 | 100.1 | 199.6 | 754.6 |
|  | Express 5.3.0 | 15,928 | 62.2 | 68.2 | 210.8 | 322.6 |
|  | Bun 1.4.4 | 16,074 | 61.9 | 63.3 | 125.8 | 82.0 |
|  | actix-web 4.19.0 | 16,087 | 61.9 | 62.3 | 106.8 | 50.6 |
| `/json-323k` | axum 0.8.9 | 3,360 | 294.0 | 313.7 | 1,154.6 | 256.9 |
|  | Spring Boot 4.1.2 | 3,165 | 305.0 | 508.3 | 1,256.0 | 2,247.0 |
|  | Express 5.3.0 | 2,952 | 334.4 | 453.7 | 1,356.7 | 524.7 |
|  | Bun 1.4.4 | 3,358 | 294.1 | 317.7 | 968.4 | 301.8 |
|  | actix-web 4.19.0 | 3,372 | 293.4 | 302.8 | 780.6 | 252.1 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| axum 0.8.9 | 49.10 | 91.5 | 697.5 | 3,159.2 | 30.46 | 56.6 |
| Spring Boot 4.1.2 | 48.92 | 91.1 | 729.0 | 1,640.2 | 27.54 | 47.2 |
| Express 5.3.0 | 38.49 | 71.7 | 1,151.1 | 1,239.5 | 47.02 | 352.7 |
| Bun 1.4.4 | 49.24 | 91.7 | 892.9 | 2,219.7 | 2.47 | 4.3 |
| actix-web 4.19.0 | 49.14 | 91.5 | 746.2 | 1,210.5 | 24.26 | 22.5 |
| Apache httpd 2.4 | 49.26 | 91.8 | 731.7 | 1,744.2 | 3.64 | 2.2 |
| nginx 1.30.6 | 49.10 | 91.5 | 829.0 | 1,652.0 | 2.58 | 6.5 |

2 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-82-194.
