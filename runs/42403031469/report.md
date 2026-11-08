# change lane, full: actix-web main 9fb5964, actix-web #4302 with fixes c2829f9

Capacity at p99 ≤ 50 ms with at most 0.1% errors and ≥ 95% delivered; CPU and p99 at each server's highest held rate:

| Route | Server | Capacity (responses/s) | CPU (µs/response) | p99 (ms) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: |
| `/json` | actix-web main 9fb5964 | 480,000 | 8.1 | 23.57 | 39.6 |
|  | actix-web #4302 with fixes c2829f9 | 480,000 | 8.1 | 25.11 | 39.2 |
|  | actix-web main 9fb5964 (A/A) | 480,000 | 8.1 | 23.59 | 39.5 |
| `/16k` | actix-web main 9fb5964 | 352,000 | 9.3 | 21.74 | 55.8 |
|  | actix-web #4302 with fixes c2829f9 | 352,000 | 9.3 | 18.43 | 55.8 |
| `/323k` | actix-web main 9fb5964 | 18,000 | 59.2 | 0.71 | 7.9 |
|  | actix-web #4302 with fixes c2829f9 | 18,000 | 50.8 | 0.69 | 5.6 |
| `/323k-fresh` | actix-web main 9fb5964 | 18,000 | 92.6 | 1.19 | 8.2 |
|  | actix-web #4302 with fixes c2829f9 | 18,000 | 58.7 | 0.70 | 7.9 |
| `/json-40k` | actix-web main 9fb5964 | 36,000 | 102.6 | 1.31 | 33.2 |
|  | actix-web #4302 with fixes c2829f9 | 36,000 | 102.3 | 1.27 | 13.2 |
| `/json-323k` | actix-web main 9fb5964 | 5,000 | 754.4 | 2.98 | 6.8 |
|  | actix-web #4302 with fixes c2829f9 | 5,000 | 766.7 | 3.02 | 6.7 |

Slow clients: 1,000 keep-alive clients fetching each route back to back, each flow paced at 10 Mbit/s with 40 ms added round trip:

| Route | Server | Responses/s | p50 (ms) | p99 (ms) | CPU (µs/response) | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: |
| `/323k` | actix-web main 9fb5964 | 3,399 | 292.6 | 295.1 | 48.7 | 278.1 |
|  | actix-web #4302 with fixes c2829f9 | 3,399 | 292.6 | 294.7 | 39.4 | 15.5 |
| `/323k-fresh` | actix-web main 9fb5964 | 3,399 | 292.6 | 295.6 | 55.0 | 281.4 |
|  | actix-web #4302 with fixes c2829f9 | 3,399 | 292.6 | 295.2 | 47.6 | 279.6 |
| `/json-40k` | actix-web main 9fb5964 | 16,092 | 61.9 | 62.3 | 107.5 | 51.2 |
|  | actix-web #4302 with fixes c2829f9 | 16,092 | 61.9 | 62.3 | 106.8 | 19.6 |
| `/json-323k` | actix-web main 9fb5964 | 3,371 | 293.4 | 301.6 | 776.7 | 249.4 |
|  | actix-web #4302 with fixes c2829f9 | 3,371 | 293.4 | 302.2 | 787.1 | 251.9 |

Large file: 64 keep-alive clients downloading `/file` (64 MiB, through each framework's own file server) back to back, nothing shaped:

| Server | Throughput (Gbit/s) | Responses/s | p50 (ms) | p99 (ms) | CPU (ms/response) | Peak memory growth (MB) |
| :-- | --: | --: | --: | --: | --: | --: |
| actix-web main 9fb5964 | 49.14 | 91.5 | 840.1 | 1,792.0 | 25.58 | 40.7 |
| actix-web #4302 with fixes c2829f9 | 49.26 | 91.8 | 825.9 | 2,164.3 | 24.78 | 23.8 |

The Proof bot's harness, rebuilt on the server instance: wrk debian/4.1.0-4build2 [epoll] Copyright (C) 2012 Will Glozer over loopback against the server, closed loop, from CPUs the server doesn't use, 8 s recorded after 2 s of warm-up. "wrk busy" is the share of its CPUs wrk used; near 100% the client sets the rate, not the server:

| Cell | Server | Requests/s | p50 (ms) | p99 (ms) | Server CPU (µs/response) | wrk busy | Peak memory growth (MB) |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| `/323k`, 256 connections, wrk on 4 CPUs | actix-web main 9fb5964 | 83,771 | 1.52 | 3.17 | 44.7 | 100% | 6.2 |
|  | actix-web #4302 with fixes c2829f9 | 82,969 | 1.54 | 3.07 | 36.5 | 100% | 4.8 |
|  | actix-web main 9fb5964 (A/A) | 83,683 | 1.51 | 3.16 | 44.7 | 100% | 6.2 |
| `/323k`, 256 connections, wrk on 8 CPUs | actix-web main 9fb5964 | 90,559 | 2.80 | 2.89 | 43.8 | 54% | 6.2 |
|  | actix-web #4302 with fixes c2829f9 | 112,309 | 2.25 | 2.35 | 35.3 | 69% | 4.8 |
|  | actix-web main 9fb5964 (A/A) | 91,282 | 2.78 | 2.87 | 43.4 | 54% | 6.4 |
| `/323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | actix-web main 9fb5964 | 31,471 | 9.03 | 10.25 | 126.8 | 40% | 84.1 |
|  | actix-web #4302 with fixes c2829f9 | 88,059 | 1.84 | 3.70 | 41.4 | 100% | 4.6 |
|  | actix-web main 9fb5964 (A/A) | 31,079 | 8.96 | 10.18 | 128.4 | 40% | 84.1 |
| `/323k`, 1,000 connections, wrk on 4 CPUs | actix-web main 9fb5964 | 71,859 | 6.88 | 13.75 | 44.8 | 100% | 19.8 |
|  | actix-web #4302 with fixes c2829f9 | 71,948 | 6.87 | 13.56 | 37.4 | 99% | 18.4 |
|  | actix-web main 9fb5964 (A/A) | 71,834 | 6.89 | 13.74 | 44.9 | 99% | 19.6 |
| `/323k-fresh`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | actix-web main 9fb5964 | 31,315 | 8.72 | 10.79 | 127.4 | 40% | 85.3 |
|  | actix-web #4302 with fixes c2829f9 | 50,993 | 4.85 | 7.37 | 78.2 | 66% | 74.3 |
|  | actix-web main 9fb5964 (A/A) | 30,016 | 9.55 | 10.89 | 133.0 | 38% | 85.3 |
| `/json-323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | actix-web main 9fb5964 | 5,023 | 50.18 | 52.58 | 796.5 | 7% | 89.1 |
|  | actix-web #4302 with fixes c2829f9 | 5,036 | 51.00 | 59.33 | 793.6 | 7% | 78.8 |
|  | actix-web main 9fb5964 (A/A) | 4,981 | 50.94 | 53.50 | 802.6 | 7% | 89.6 |
| `/json-40k`, 256 connections, wrk on 4 CPUs | actix-web main 9fb5964 | 40,275 | 6.32 | 6.43 | 99.1 | 11% | 14.8 |
|  | actix-web #4302 with fixes c2829f9 | 39,906 | 6.40 | 6.47 | 100.1 | 11% | 5.5 |
|  | actix-web main 9fb5964 (A/A) | 40,253 | 6.33 | 6.42 | 99.1 | 11% | 14.8 |

actix-web #4302 with fixes c2829f9 against actix-web main 9fb5964: ratio of head to base, median over paired passes with its 95% bootstrap interval. Higher is better for capacity and throughput, lower for the rest:

| Route | Capacity or throughput | CPU per response | p99 | Peak memory growth | Reading |
| :-- | --: | --: | --: | --: | :-- |
| `/json` | 1.000 (1.000–1.000) | 0.999 (0.992–1.003) | 1.159 (0.944–1.289) | 0.993 (0.988–0.998) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory better |
| `/16k` | 1.000 (1.000–1.000) | 1.001 (0.999–1.005) | 0.910 (0.745–1.053) | 1.001 (0.991–1.008) | capacity no measurable change; CPU no measurable change; p99 no measurable change; memory no measurable change |
| `/323k` | 1.000 (1.000–1.000) | 0.859 (0.852–0.870) | 0.985 (0.968–1.003) | 0.708 (0.661–0.736) | capacity no measurable change; CPU better; p99 no measurable change; memory better |
| `/323k-fresh` | 1.000 (1.000–1.000) | 0.634 (0.423–0.886) | 0.591 (0.507–0.985) | 0.963 (0.901–1.003) | capacity no measurable change; CPU better; p99 better; memory no measurable change |
| `/json-40k` | 1.000 (1.000–1.000) | 0.994 (0.991–0.998) | 0.973 (0.587–0.991) | 0.398 (0.397–0.403) | capacity no measurable change; CPU better; p99 better; memory better |
| `/json-323k` | 1.000 (1.000–1.000) | 1.019 (1.013–1.020) | 1.006 (0.984–1.035) | 0.984 (0.959–1.005) | capacity no measurable change; CPU worse; p99 no measurable change; memory no measurable change |
| slow `/323k` | – | 0.809 (0.786–0.816) | 0.999 (0.997–1.001) | 0.056 (0.054–0.056) | CPU better; p99 no measurable change; memory better |
| slow `/323k-fresh` | – | 0.866 (0.849–0.886) | 0.997 (0.996–1.002) | 1.001 (0.961–1.023) | CPU better; p99 no measurable change; memory no measurable change |
| slow `/json-40k` | – | 0.994 (0.991–1.001) | 1.000 (1.000–1.001) | 0.382 (0.380–0.384) | CPU no measurable change; p99 no measurable change; memory better |
| slow `/json-323k` | – | 1.013 (1.009–1.015) | 1.003 (0.997–1.009) | 1.005 (0.910–1.021) | CPU worse; p99 no measurable change; memory no measurable change |
| `/file` | 1.003 (0.999–1.005) | 0.968 (0.954–0.981) | 1.327 (0.787–1.612) | 0.594 (0.497–0.666) | throughput no measurable change; CPU better; p99 no measurable change; memory better |
| proof `/323k`, 256 connections, wrk on 4 CPUs | 0.993 (0.931–0.999) | 0.819 (0.810–0.850) | 0.967 (0.959–1.056) | 0.767 (0.739–0.797) | requests/s worse; CPU better; p99 no measurable change; memory better; A/A requests/s 0.998 (0.938–1.077), CPU 0.999 (0.965–1.036) |
| proof `/323k`, 256 connections, wrk on 8 CPUs | 1.238 (1.229–1.255) | 0.808 (0.796–0.813) | 0.814 (0.803–0.821) | 0.761 (0.744–0.770) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 1.009 (0.994–1.027), CPU 0.991 (0.976–1.006) |
| proof `/323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | 2.794 (2.545–2.967) | 0.328 (0.308–0.362) | 0.362 (0.358–0.363) | 0.055 (0.054–0.056) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 0.986 (0.934–1.025), CPU 1.014 (0.976–1.071) |
| proof `/323k`, 1,000 connections, wrk on 4 CPUs | 1.004 (0.999–1.009) | 0.834 (0.827–0.838) | 0.986 (0.849–0.999) | 0.927 (0.916–0.942) | requests/s no measurable change; CPU better; p99 better; memory better; A/A requests/s 1.001 (0.994–1.004), CPU 1.001 (0.999–1.005) |
| proof `/323k-fresh`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | 1.603 (1.474–1.860) | 0.624 (0.537–0.678) | 0.685 (0.629–0.751) | 0.879 (0.866–0.899) | requests/s better; CPU better; p99 better; memory better; A/A requests/s 1.008 (0.799–1.237), CPU 0.997 (0.808–1.256) |
| proof `/json-323k`, 256 connections, wrk on 4 CPUs, 128 KiB send buffer | 1.003 (0.993–1.018) | 0.996 (0.983–1.008) | 1.117 (1.101–1.137) | 0.874 (0.817–0.931) | requests/s no measurable change; CPU no measurable change; p99 worse; memory better; A/A requests/s 0.995 (0.980–1.009), CPU 1.005 (0.991–1.022) |
| proof `/json-40k`, 256 connections, wrk on 4 CPUs | 0.992 (0.980–0.994) | 1.008 (1.005–1.020) | 1.006 (0.998–1.044) | 0.373 (0.368–0.380) | requests/s worse; CPU worse; p99 no measurable change; memory better; A/A requests/s 0.999 (0.993–1.007), CPU 1.001 (0.992–1.007) |
| A/A `/json` | 1.000 (0.969–1.000) | 1.000 (0.995–1.012) | – | – | the base against itself: the noise floor |

6 pass(es); within a cell the servers ran back to back in an order that rotated each pass, a fresh server process per cell; open-loop load from 8 oha processes (oha 1.16.0) with its latency correction, each percentile the highest any process saw, 7 s recorded per step after 3 s of warm-up, and 30 s after 10 s in the closed-loop cells; CPU is the server process's user plus system time. Rig: ip-172-31-92-25.
