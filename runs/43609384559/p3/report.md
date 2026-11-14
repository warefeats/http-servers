# frameworks lane, full: actix-web 4.19.0, axum 0.8.9, rama 0.4.0, Spring Boot 4.1.2, Express 5.3.0, Bun 1.4.4, Apache httpd 2.4, nginx 1.30.6

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | rama 0.4.0 | 208,000 | 17.6 | 7.41 | 74.6 |
|  | Spring Boot 4.1.2 | 144,000 | 27.0 | 30.72 | 832.8 |
|  | Express 5.3.0 | 112,000 | 34.8 | 35.94 | 338.0 |
|  | Bun 1.4.4 | 288,000 | 13.1 | 17.36 | 46.9 |
|  | actix-web 4.19.0 | 480,000 | 8.2 | 25.47 | 39.7 |
|  | axum 0.8.9 | 288,000 | 12.9 | 6.46 | 75.3 |
| `/16k` | rama 0.4.0 | 320,000 | 12.1 | 18.53 | 76.9 |
|  | Spring Boot 4.1.2 | 120,000 | 31.3 | 15.10 | 345.2 |
|  | Express 5.3.0 | 88,000 | 43.3 | 11.03 | 195.3 |
|  | Bun 1.4.4 | 256,000 | 14.6 | 16.90 | 3.8 |
|  | actix-web 4.19.0 | 352,000 | 9.4 | 15.97 | 55.2 |
|  | axum 0.8.9 | 352,000 | 10.0 | 21.93 | 85.3 |
|  | Apache httpd 2.4 | 48,000 | 49.0 | 0.75 | 38.6 |
|  | nginx 1.30.6 | 352,000 | 11.3 | 25.63 | 7.2 |
| `/323k` | rama 0.4.0 | 18,000 | 59.6 | 0.73 | 10.1 |
|  | Spring Boot 4.1.2 | 18,000 | 147.2 | 1.25 | 66.6 |
|  | Express 5.3.0 | 13,000 | 291.9 | 3.20 | 49.0 |
|  | Bun 1.4.4 | 18,000 | 99.4 | 1.04 | 3.8 |
|  | actix-web 4.19.0 | 18,000 | 51.6 | 0.70 | 5.8 |
|  | axum 0.8.9 | 18,000 | 56.8 | 0.72 | 10.5 |
|  | Apache httpd 2.4 | 18,000 | 96.8 | 0.82 | 14.2 |
|  | nginx 1.30.6 | 18,000 | 63.7 | 0.70 | 5.9 |
| `/323k-fresh` | rama 0.4.0 | 18,000 | 67.5 | 0.73 | 11.8 |
|  | Spring Boot 4.1.2 | 18,000 | 164.1 | 2.03 | 964.0 |
|  | Express 5.3.0 | 11,000 | 349.8 | 15.92 | 447.2 |
|  | Bun 1.4.4 | 18,000 | 132.0 | 1.49 | 62.5 |
|  | actix-web 4.19.0 | 18,000 | 58.4 | 0.71 | 7.7 |
|  | axum 0.8.9 | 18,000 | 63.9 | 0.73 | 13.1 |
| `/json-40k` | rama 0.4.0 | 22,000 | 174.4 | 4.33 | 11.9 |
|  | Spring Boot 4.1.2 | 15,000 | 215.4 | 4.81 | 784.8 |
|  | Express 5.3.0 | 20,000 | 194.5 | 14.14 | 365.7 |
|  | Bun 1.4.4 | 36,000 | 111.3 | 48.03 | 66.7 |
|  | actix-web 4.19.0 | 36,000 | 102.5 | 1.30 | 33.0 |
|  | axum 0.8.9 | 26,000 | 150.8 | 41.52 | 11.7 |
| `/json-323k` | rama 0.4.0 | 3,250 | 1,177.4 | 3.76 | 10.7 |
|  | Spring Boot 4.1.2 | 3,000 | 1,295.1 | 17.53 | 1,439.7 |
|  | Express 5.3.0 | 3,000 | 1,313.3 | 18.08 | 469.3 |
|  | Bun 1.4.4 | 4,000 | 937.3 | 17.07 | 137.2 |
|  | actix-web 4.19.0 | 5,000 | 761.2 | 2.86 | 6.8 |
|  | axum 0.8.9 | 3,500 | 1,058.1 | 3.21 | 8.7 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | rama 0.4.0 | 3,399 | 292.6 | 295.1 | 43.8 | 28.1 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.4 | 144.6 | 104.3 |
|  | Express 5.3.0 | 3,386 | 292.9 | 302.2 | 305.6 | 88.2 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 296.2 | 84.1 | 180.7 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 294.2 | 39.6 | 18.1 |
|  | axum 0.8.9 | 3,399 | 292.6 | 295.3 | 40.5 | 28.7 |
|  | Apache httpd 2.4 | 1,510 | 292.6 | 29,567.0 | 74.1 | 50.7 |
|  | nginx 1.30.6 | 3,299 | 299.9 | 330.5 | 36.9 | 16.7 |
| `/323k-fresh` | rama 0.4.0 | 3,399 | 292.6 | 295.4 | 51.2 | 273.9 |
|  | Spring Boot 4.1.2 | 3,432 | 287.6 | 333.6 | 176.3 | 417.4 |
|  | Express 5.3.0 | 3,377 | 293.0 | 309.2 | 402.2 | 345.6 |
|  | Bun 1.4.4 | 3,399 | 292.8 | 295.6 | 119.8 | 227.1 |
|  | actix-web 4.19.0 | 3,399 | 292.6 | 295.0 | 50.8 | 260.4 |
|  | axum 0.8.9 | 3,399 | 292.6 | 294.7 | 49.3 | 279.8 |
| `/json-40k` | rama 0.4.0 | 16,057 | 62.0 | 62.4 | 184.1 | 33.4 |
|  | Spring Boot 4.1.2 | 15,933 | 63.7 | 100.1 | 199.0 | 771.8 |
|  | Express 5.3.0 | 15,910 | 62.2 | 68.4 | 215.1 | 295.0 |
|  | Bun 1.4.4 | 16,076 | 61.9 | 63.2 | 127.1 | 80.1 |
|  | actix-web 4.19.0 | 16,087 | 61.9 | 62.3 | 107.8 | 50.5 |
|  | axum 0.8.9 | 16,070 | 62.0 | 62.3 | 162.5 | 33.5 |
| `/json-323k` | rama 0.4.0 | 3,361 | 294.1 | 330.5 | 1,163.0 | 210.0 |
|  | Spring Boot 4.1.2 | 3,295 | 297.6 | 413.3 | 1,205.0 | 2,141.6 |
|  | Express 5.3.0 | 2,927 | 338.5 | 458.5 | 1,368.8 | 550.4 |
|  | Bun 1.4.4 | 3,352 | 294.4 | 322.6 | 983.9 | 278.0 |
|  | actix-web 4.19.0 | 3,372 | 293.4 | 304.8 | 784.7 | 179.6 |
|  | axum 0.8.9 | 3,364 | 293.9 | 306.9 | 1,139.6 | 206.1 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| rama 0.4.0 | 49.30 | 91.8 | 694.1 | 2,321.0 | 29.55 | 56.0 |
| Spring Boot 4.1.2 | 48.97 | 91.2 | 716.6 | 2,516.3 | 27.48 | 46.3 |
| Express 5.3.0 | 38.22 | 71.2 | 926.4 | 1,024.0 | 47.88 | 355.2 |
| Bun 1.4.4 | 49.21 | 91.7 | 944.1 | 2,381.2 | 2.55 | 4.4 |
| actix-web 4.19.0 | 49.14 | 91.5 | 1,066.0 | 2,785.9 | 24.17 | 21.1 |
| axum 0.8.9 | 49.10 | 91.5 | 794.6 | 2,189.1 | 30.46 | 56.7 |
| Apache httpd 2.4 | 49.17 | 91.6 | 621.8 | 2,509.4 | 3.60 | 2.3 |
| nginx 1.30.6 | 49.26 | 91.8 | 809.8 | 1,997.9 | 2.67 | 6.5 |

3 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-81-250.
