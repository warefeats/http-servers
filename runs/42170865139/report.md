# change lane, full: actix-web main 81bb997, actix-web #4302 2a3f201, axum main 40d061f

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web main 81bb997 | 512,000 | 7.6 | 27.23 | 39.5 |
|  | actix-web #4302 2a3f201 | 512,000 | 7.6 | 23.44 | 39.4 |
|  | axum main 40d061f | 320,000 | 12.2 | 28.24 | 74.9 |
|  | actix-web main 81bb997 (A/A) | 512,000 | 7.6 | 25.38 | 39.4 |
| `/16k` | actix-web main 81bb997 | 352,000 | 8.6 | 18.32 | 55.9 |
|  | actix-web #4302 2a3f201 | 352,000 | 8.6 | 17.72 | 56.0 |
|  | axum main 40d061f | 352,000 | 9.2 | 20.03 | 73.2 |
| `/323k` | actix-web main 81bb997 | 18,000 | 55.2 | 0.70 | 8.3 |
|  | actix-web #4302 2a3f201 | 18,000 | 47.8 | 0.68 | 5.4 |
|  | axum main 40d061f | 18,000 | 52.2 | 0.70 | 9.7 |
| `/323k-fresh` | actix-web main 81bb997 | 18,000 | 133.5 | 1.25 | 8.3 |
|  | actix-web #4302 2a3f201 | 18,000 | 55.4 | 0.69 | 7.9 |
|  | axum main 40d061f | 18,000 | 60.0 | 0.70 | 12.7 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web main 81bb997 | 3,399 | 292.6 | 295.1 | 48.9 | 257.2 |
|  | actix-web #4302 2a3f201 | 3,399 | 292.6 | 295.4 | 39.5 | 17.6 |
|  | axum main 40d061f | 3,399 | 292.6 | 295.8 | 42.3 | 28.3 |
| `/323k-fresh` | actix-web main 81bb997 | 3,399 | 292.6 | 295.2 | 56.8 | 248.3 |
|  | actix-web #4302 2a3f201 | 3,399 | 292.6 | 296.1 | 52.8 | 262.7 |
|  | axum main 40d061f | 3,399 | 292.6 | 295.8 | 50.6 | 284.5 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web main 81bb997 | 49.21 | 91.7 | 869.2 | 2,042.8 | 25.33 | 38.9 |
| actix-web #4302 2a3f201 | 49.21 | 91.7 | 808.5 | 1,712.2 | 24.38 | 24.0 |
| axum main 40d061f | 49.14 | 91.5 | 752.9 | 1,898.6 | 30.30 | 57.5 |

actix-web #4302 2a3f201 against actix-web main 81bb997: ratio of head to base, median over paired passes with its 95% bootstrap interval. Higher is better for capacity and throughput, lower for the rest:

| Route | Capacity or throughput | CPU per response | p99 | Peak memory growth | Reading |
| :-- | --: | --: | --: | --: | :-- |
| `/json` | 1.000 (1.000–1.000) | 0.999 (0.989–1.003) | 0.914 (0.779–1.033) | 1.000 (0.988–1.006) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change |
| `/16k` | 1.000 (1.000–1.000) | 1.000 (0.996–1.004) | 0.994 (0.851–1.214) | 1.002 (0.994–1.006) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change |
| `/323k` | 1.000 (1.000–1.000) | 0.866 (0.858–0.872) | 0.981 (0.971–0.994) | 0.650 (0.618–0.724) | capacity no measurable change; CPU better; p99 better; memory better |
| `/323k-fresh` | 1.000 (1.000–1.000) | 0.421 (0.299–0.882) | 0.547 (0.500–0.979) | 0.952 (0.919–0.992) | capacity no measurable change; CPU better; p99 better; memory better |
| slow `/323k` | – | 0.811 (0.792–0.824) | 1.001 (0.999–1.003) | 0.068 (0.067–0.071) | CPU better; p99 no measurable change; memory better |
| slow `/323k-fresh` | – | 0.936 (0.883–0.955) | 1.003 (1.000–1.005) | 1.055 (1.041–1.099) | CPU better; p99 worse; memory worse |
| `/file` | 1.000 (0.995–1.003) | 0.965 (0.951–0.983) | 0.972 (0.810–1.410) | 0.617 (0.556–0.705) | throughput no measurable change; CPU better; p99 no measurable change; memory better |
| A/A `/json` | 1.000 (1.000–1.000) | 0.998 (0.991–1.007) | – | – | the base against itself: the noise floor |

6 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-80-148.
