# change lane, full: actix-web main 9fb5964, actix-web #4302 with fixes 2195876

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web main 9fb5964 | 480,000 | 8.0 | 24.25 | 39.4 |
|  | actix-web #4302 with fixes 2195876 | 480,000 | 8.1 | 22.78 | 39.5 |
|  | actix-web main 9fb5964 (A/A) | 480,000 | 8.1 | 21.92 | 39.5 |
| `/16k` | actix-web main 9fb5964 | 352,000 | 9.3 | 19.68 | 55.9 |
|  | actix-web #4302 with fixes 2195876 | 352,000 | 9.3 | 23.73 | 56.0 |
| `/323k` | actix-web main 9fb5964 | 18,000 | 59.5 | 0.71 | 8.0 |
|  | actix-web #4302 with fixes 2195876 | 18,000 | 51.4 | 0.70 | 5.7 |
| `/323k-fresh` | actix-web main 9fb5964 | 18,000 | 91.8 | 1.15 | 8.2 |
|  | actix-web #4302 with fixes 2195876 | 18,000 | 59.2 | 0.71 | 7.4 |
| `/json-40k` | actix-web main 9fb5964 | 36,000 | 102.6 | 1.30 | 33.0 |
|  | actix-web #4302 with fixes 2195876 | 36,000 | 103.6 | 1.33 | 33.7 |
| `/json-323k` | actix-web main 9fb5964 | 5,000 | 757.4 | 2.94 | 6.7 |
|  | actix-web #4302 with fixes 2195876 | 5,000 | 766.4 | 2.99 | 6.8 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web main 9fb5964 | 3,399 | 292.6 | 295.1 | 48.5 | 278.2 |
|  | actix-web #4302 with fixes 2195876 | 3,399 | 292.6 | 295.3 | 39.5 | 15.6 |
| `/323k-fresh` | actix-web main 9fb5964 | 3,399 | 292.6 | 295.2 | 55.1 | 278.6 |
|  | actix-web #4302 with fixes 2195876 | 3,399 | 292.6 | 294.6 | 47.9 | 275.2 |
| `/json-40k` | actix-web main 9fb5964 | 16,093 | 61.9 | 62.2 | 107.6 | 51.0 |
|  | actix-web #4302 with fixes 2195876 | 16,089 | 61.9 | 62.2 | 108.2 | 51.5 |
| `/json-323k` | actix-web main 9fb5964 | 3,371 | 293.4 | 301.0 | 778.8 | 242.4 |
|  | actix-web #4302 with fixes 2195876 | 3,371 | 293.4 | 301.0 | 787.3 | 244.5 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web main 9fb5964 | 49.13 | 91.5 | 761.3 | 2,094.0 | 25.33 | 39.2 |
| actix-web #4302 with fixes 2195876 | 49.13 | 91.5 | 763.6 | 1,949.5 | 24.80 | 23.6 |

The Proof bot's harness, rebuilt on the server instance: wrk debian/4.1.0-4build2 [epoll] Copyright (C) 2012 Will Glozer over loopback against the server, closed loop, from CPUs the server doesn't use, 8 s recorded after 2 s of warm-up. "wrk busy" is the share of its CPUs wrk used; near 100% the client sets the rate, not the server:

| Cell | Server | Requests/s | p50 (ms) | p99 (ms) | Server CPU (µs/response) | wrk busy | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| `/323k`, 256 connections, wrk on 4 CPUs | actix-web main 9fb5964 | 85,276 | 1.50 | 3.20 | 44.9 | 100% | 6.2 |
|  | actix-web #4302 with fixes 2195876 | 84,309 | 1.51 | 3.02 | 36.8 | 100% | 4.7 |
|  | actix-web main 9fb5964 (A/A) | 85,519 | 1.51 | 3.21 | 44.8 | 100% | 6.4 |
| `/323k`, 256 connections, wrk on 8 CPUs | actix-web main 9fb5964 | 90,982 | 2.79 | 2.89 | 43.7 | 53% | 6.5 |
|  | actix-web #4302 with fixes 2195876 | 112,097 | 2.26 | 2.36 | 35.4 | 68% | 4.7 |
|  | actix-web main 9fb5964 (A/A) | 90,982 | 2.79 | 2.88 | 43.7 | 53% | 6.5 |
| `/323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | actix-web main 9fb5964 | 31,444 | 9.23 | 10.19 | 127.0 | 40% | 83.8 |
|  | actix-web #4302 with fixes 2195876 | 90,255 | 1.79 | 3.59 | 41.7 | 100% | 4.6 |
|  | actix-web main 9fb5964 (A/A) | 31,054 | 9.29 | 10.13 | 128.5 | 39% | 84.0 |
| `/323k`, 1,000 connections, wrk on 4 CPUs | actix-web main 9fb5964 | 72,330 | 6.82 | 13.64 | 44.8 | 99% | 19.8 |
|  | actix-web #4302 with fixes 2195876 | 72,674 | 6.79 | 13.51 | 37.3 | 99% | 18.4 |
|  | actix-web main 9fb5964 (A/A) | 72,481 | 6.83 | 13.64 | 44.9 | 99% | 19.7 |
| `/323k-fresh`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | actix-web main 9fb5964 | 30,279 | 8.82 | 10.71 | 131.7 | 38% | 85.1 |
|  | actix-web #4302 with fixes 2195876 | 51,230 | 4.77 | 6.73 | 77.9 | 65% | 72.8 |
|  | actix-web main 9fb5964 (A/A) | 30,398 | 9.13 | 10.73 | 131.2 | 38% | 85.5 |
| `/json-323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | actix-web main 9fb5964 | 4,959 | 51.34 | 53.06 | 805.7 | 6% | 88.9 |
|  | actix-web #4302 with fixes 2195876 | 4,996 | 50.65 | 52.95 | 800.4 | 6% | 91.8 |
|  | actix-web main 9fb5964 (A/A) | 4,989 | 50.58 | 53.05 | 800.7 | 6% | 89.9 |
| `/json-40k`, 256 connections, wrk on 4 CPUs | actix-web main 9fb5964 | 40,304 | 6.33 | 6.42 | 99.1 | 11% | 14.7 |
|  | actix-web #4302 with fixes 2195876 | 39,869 | 6.40 | 6.47 | 100.1 | 11% | 14.8 |
|  | actix-web main 9fb5964 (A/A) | 40,426 | 6.31 | 6.40 | 98.8 | 11% | 14.7 |

actix-web #4302 with fixes 2195876 against actix-web main 9fb5964: ratio of head to base, median over paired passes with its 95% bootstrap interval. Higher is better for capacity and throughput, lower for the rest:

| Route | Capacity or throughput | CPU per response | p99 | Peak memory growth | Reading |
| :-- | --: | --: | --: | --: | :-- |
| `/json` | 1.000 (0.969–1.000) | 1.003 (0.995–1.008) | 1.020 (0.835–1.424) | 1.002 (0.994–1.007) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change |
| `/16k` | 1.000 (1.000–1.000) | 1.003 (1.001–1.005) | 1.123 (0.879–1.432) | 1.002 (0.994–1.010) | capacity no measurable change; CPU worse; p99 no measurable change; memory no measurable change |
| `/323k` | 1.000 (1.000–1.000) | 0.864 (0.858–0.868) | 0.979 (0.971–0.989) | 0.734 (0.677–0.747) | capacity no measurable change; CPU better; p99 better; memory better |
| `/323k-fresh` | 1.000 (1.000–1.000) | 0.645 (0.478–0.888) | 0.620 (0.521–0.963) | 0.909 (0.856–0.996) | capacity no measurable change; CPU better; p99 better; memory better |
| `/json-40k` | 1.000 (1.000–1.000) | 1.011 (1.005–1.018) | 1.006 (0.853–1.085) | 1.016 (0.999–1.031) | capacity no measurable change; CPU worse; p99 no measurable change; memory no measurable change |
| `/json-323k` | 1.000 (1.000–1.000) | 1.013 (1.009–1.015) | 1.033 (0.987–1.107) | 1.011 (0.995–1.022) | capacity no measurable change; CPU worse; p99 no measurable change; memory no measurable change |
| slow `/323k` | – | 0.816 (0.802–0.824) | 1.001 (0.996–1.003) | 0.056 (0.056–0.057) | CPU better; p99 no measurable change; memory better |
| slow `/323k-fresh` | – | 0.865 (0.858–0.876) | 0.998 (0.994–1.001) | 0.980 (0.974–1.037) | CPU better; p99 no measurable change; memory no measurable change |
| slow `/json-40k` | – | 1.001 (0.995–1.015) | 1.000 (1.000–1.000) | 1.007 (0.998–1.011) | CPU no measurable change; p99 no measurable change; memory no measurable change |
| slow `/json-323k` | – | 1.012 (1.006–1.013) | 1.001 (0.993–1.007) | 0.997 (0.973–1.053) | CPU worse; p99 no measurable change; memory no measurable change |
| `/file` | 0.999 (0.997–1.003) | 0.980 (0.958–0.984) | 0.871 (0.619–1.187) | 0.599 (0.545–0.653) | throughput no measurable change; CPU better; p99 no measurable change; memory better |
| proof `/323k`, 256 connections, wrk on 4 CPUs | 0.988 (0.975–0.992) | 0.821 (0.814–0.826) | 0.944 (0.909–0.957) | 0.750 (0.735–0.767) | requests/s worse; CPU better; p99 better; memory better; A/A requests/s 1.002 (0.989–1.059), CPU 0.998 (0.965–1.004) |
| proof `/323k`, 256 connections, wrk on 8 CPUs | 1.232 (1.222–1.254) | 0.808 (0.800–0.818) | 0.814 (0.805–0.824) | 0.725 (0.709–0.776) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 1.006 (0.988–1.020), CPU 0.997 (0.983–1.013) |
| proof `/323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | 2.869 (2.620–3.036) | 0.328 (0.310–0.359) | 0.352 (0.349–0.359) | 0.055 (0.055–0.056) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 0.985 (0.900–1.152), CPU 1.015 (0.869–1.111) |
| proof `/323k`, 1,000 connections, wrk on 4 CPUs | 1.005 (1.003–1.008) | 0.832 (0.824–0.840) | 0.990 (0.989–0.994) | 0.931 (0.910–0.949) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 1.001 (0.998–1.006), CPU 1.001 (0.998–1.005) |
| proof `/323k-fresh`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | 1.680 (1.610–1.799) | 0.596 (0.556–0.621) | 0.627 (0.622–0.703) | 0.863 (0.848–0.885) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 1.037 (0.918–1.084), CPU 0.964 (0.924–1.093) |
| proof `/json-323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | 1.009 (0.986–1.024) | 0.992 (0.978–1.014) | 1.000 (0.961–1.032) | 1.042 (0.993–1.182) | requests/s no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change; A/A requests/s 1.006 (0.993–1.016), CPU 0.995 (0.983–1.008) |
| proof `/json-40k`, 256 connections, wrk on 4 CPUs | 0.989 (0.986–0.992) | 1.010 (1.008–1.015) | 1.008 (1.005–1.013) | 1.010 (1.004–1.015) | requests/s worse; CPU worse; p99 worse; memory worse; A/A requests/s 1.002 (0.998–1.008), CPU 0.997 (0.993–1.002) |
| A/A `/json` | 1.000 (0.969–1.000) | 0.998 (0.996–1.001) | – | – | the base against itself: the noise floor |

6 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-87-122.
