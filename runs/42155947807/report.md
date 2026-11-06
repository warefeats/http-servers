# change lane, full: actix-web main 81bb997, actix-web #4302 2a3f201, axum main 40d061f

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web main 81bb997 | 512,000 | 7.6 | 22.68 | 39.4 |
|  | actix-web #4302 2a3f201 | 512,000 | 7.6 | 23.86 | 39.4 |
|  | axum main 40d061f | 272,000 | 13.4 | 13.30 | 73.5 |
|  | actix-web main 81bb997 (A/A) | 512,000 | 7.6 | 28.32 | 39.5 |
| `/16k` | actix-web main 81bb997 | 352,000 | 8.7 | 18.52 | 55.8 |
|  | actix-web #4302 2a3f201 | 352,000 | 8.6 | 22.21 | 56.0 |
|  | axum main 40d061f | 352,000 | 9.3 | 19.32 | 73.5 |
| `/323k` | actix-web main 81bb997 | 18,000 | 56.6 | 0.69 | 8.4 |
|  | actix-web #4302 2a3f201 | 18,000 | 48.8 | 0.68 | 5.7 |
|  | axum main 40d061f | 18,000 | 54.4 | 0.70 | 9.6 |

Slow clients: 1,000 keep-alive clients fetching `/323k` back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: |
| actix-web main 81bb997 | 3,399 | 292.6 | 294.9 | 49.8 | 248.2 |
| actix-web #4302 2a3f201 | 3,399 | 292.6 | 295.0 | 40.1 | 17.8 |
| axum main 40d061f | 3,399 | 292.6 | 295.6 | 43.5 | 27.5 |

actix-web #4302 2a3f201 against actix-web main 81bb997: ratio of head to base, median over paired passes with its 95% bootstrap interval. Higher is better for capacity, lower for the rest:

| Route | Capacity | CPU per response | p99 | Peak memory growth | Reading |
| :-- | --: | --: | --: | --: | :-- |
| `/json` | 1.000 (1.000–1.000) | 1.001 (0.993–1.001) | 1.012 (0.855–1.200) | 1.000 (0.994–1.008) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change |
| `/16k` | 1.000 (1.000–1.000) | 0.997 (0.994–1.003) | 1.240 (0.881–1.468) | 1.007 (0.991–1.011) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change |
| `/323k` | 1.000 (1.000–1.000) | 0.863 (0.850–0.884) | 0.983 (0.978–0.999) | 0.673 (0.646–0.732) | capacity no measurable change; CPU better; p99 better; memory better |
| slow `/323k` | – | 0.807 (0.791–0.818) | 1.000 (0.996–1.006) | 0.071 (0.070–0.073) | CPU better; p99 no measurable change; memory better |
| A/A `/json` | 1.000 (1.000–1.000) | 0.996 (0.991–1.010) | – | – | the base against itself: the noise floor |

6 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up; CPU is the server process's user plus system time. Rig: ip-172-31-81-82.
