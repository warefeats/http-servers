# 0001 — What the benchmark answers

Date: 2026-11-05. Status: written before any measured pass. John asked for the rig and its first run, the change lane on #4302, the same day.

## Context

On 2026-11-05 Rob Ede asked the Blacksmith Proof bot to prove actix-web #4302 (stop copying large HTTP/1 bodies into the write buffer) and then to prove it causes no performance regression. He added: "even if it comes back and says that things are a bit slower, i don't think i'll really believe it, benching speed is far harder than observing RSS memory". John asked whether warefeats can test what the bot tests, and named the next step: actix-web against other servers, starting with axum's main branch against the PR's head. He named the repo `http-servers`, which keeps the scope to HTTP servers.

The bot's harness, from the images in its report: one VM; its own example server (4 workers, a 323,000-byte fixed-length body); `wrk -t4 -d8s` over loopback on the same machine; three runs per side, every run of the base ahead of every run of the change; `net.ipv4.tcp_wmem` capped at 128 KiB for the headline, plus one uncapped run per side. It reported peak RSS growth, requests per second and wrk's closed-loop p50 and p99. With the cap it measured the PR at 52K–69K requests/s against 25K–28K on the base at 256 connections; uncapped at 1,000 connections it measured 33,095 against 44,951, one run each, and called that within noise.

John's rule for every warefeats benchmark (2026-10-29): start from the reader's deployment question, run each candidate as its docs recommend for production, on realistic hardware with a separate client over a real network, with realistic traffic, and report what an operator decides on. Equalized engine tests may sit beside that as a diagnostic, never as the headline.

Facts the design rests on, checked on 2026-11-05:

- **Releases.** actix-web 4.18.1 (2026-10-23, actix-http 3.20.0) and axum 0.8.9 (2026-04-14, hyper 1.12.0) are the latest on crates.io. axum's main branch (40d061fd) is still 0.8.9 and changes `axum::serve` to resolve to `Infallible`.
- **Workers.** actix-web starts one worker per available CPU; axum's documented setup, `#[tokio::main]`, starts one runtime worker per available CPU. Both read `std::thread::available_parallelism`, which follows the process's CPU set.
- **Listen backlog.** actix-web's `HttpServer::bind` listens with a backlog of 1,024. axum's documented `tokio::net::TcpListener::bind` goes through mio 1.2.4, which uses the standard library's 128.
- **Nagle.** Neither framework sets `TCP_NODELAY` by default.
- **Large bodies.** actix-web main copies every chunk of a response body into its connection's write buffer; #4302 writes a fixed-length chunk of at least `h1_write_buffer_size` (32 KiB) as its own buffer, in one vectored write with the head. hyper, under axum, queues body chunks and writes them with `writev` whenever the stream supports vectored writes (its `WriteStrategy::Queue`), and hyper-util's `Rewind` passes that through, so axum already writes large bodies without copying them.
- **Loopback hides partial writes.** Loopback has a 64 KiB MTU and Linux autotunes a socket's send buffer up to `tcp_wmem`'s maximum (4 MiB on Ubuntu 24.04), so a 323 KB body usually goes out in one write. Over a network, writes go partial whenever the client or the link is slower than the server, which is the regime #4302 changes. The bot's 128 KiB cap stands in for that.
- **Instances, us-east-1 on demand** (map-tile-servers ADR 0011's price table of 2026-10-29): c8g.xlarge (Graviton4, 4 vCPUs, 8 GiB) $0.1595/h with a sustained network rate of about 1.875 Gbps (bursts to 12.5 Gbps on credits that last 5–60 minutes); c8gn.xlarge $0.237/h, so c8gn.4xlarge (16 vCPUs, up to 50 Gbps) about $0.95/h.

## Decision

### Two lanes

- **The framework lane** is the headline and the only lane that gets a post. It answers an operator's question: which HTTP server framework to deploy, how many responses a second one instance holds at a latency target, and what that costs. Its candidates are each framework's latest crates.io release, today actix-web 4.18.1 and axum 0.8.9. Each later candidate (hyper on its own, Rocket, Poem, Salvo, ntex, servers in other languages) joins by an amendment that names its documented production setup.
- **The change lane** answers a pull request's question: does this commit change throughput, latency, CPU or memory against its base? It measures commits, never ranks frameworks, and never becomes a post; its numbers go wherever John takes them. Its first run is actix-web #4302's head (2a3f2019) against its merge-base (81bb9971), with axum's main branch (40d061fd) beside them as a reference, as John asked.

### The servers

- One bench server per framework in `servers/<framework>/`, each written the way its docs show: actix-web's `HttpServer` with an `App` of routes; axum's `Router` served by `axum::serve` under `#[tokio::main]`.
- Three routes, the same response in every server:
  - `/json`: a document of about 1 KB built and serialized on every request with the framework's own JSON responder, the small API response;
  - `/16k`: 16,384 bytes, a medium response that stays under actix-web's 32 KiB write-buffer threshold;
  - `/323k`: 323,000 bytes, the average of the 50 largest Berlin tiles #4302 was measured on and the bot's body size.
- The byte routes return the same bytes in every server, cloned from one shared buffer, with a `Content-Length` and `Content-Type: application/octet-stream`. The preflight checks every route's status, framing and hash in every candidate before a pass starts.
- Each framework at its defaults: default features, the default release profile, workers sized by the framework, no middleware, Nagle left on.
- One equalization: both servers listen through the same socket2 code with a backlog of 1,024, actix-web's own default. axum's documented bind would get 128, and the slow-client cell opens 1,000 connections at once; every cell's warm-up establishes its connections before the measured window, so the backlog would only have shaped connection setup. Local runs also set the listener's send buffer through this code (see Local runs).
- Plain HTTP/1.1 with keep-alive. TLS and HTTP/2 end at a proxy or CDN, at the same cost for every server, and the page says so.

### Builds

- Every candidate is built with `cargo build --release` for the rig's architecture on the rig's client instance (the same Graviton4 generation as the server), with the stable rustc of the day, recorded. The framework comes from crates.io at an exact version, or from a git commit with every crate of its workspace patched to that commit.
- The two sides of a change-lane pair share one `Cargo.lock`, so they differ only in the framework's own crates; the build compares the two lockfiles and refuses the pair otherwise. Each binary's sha256 and the resolved versions of tokio, mio, bytes, socket2 and hyper are kept with the run.

### Cells

1. **`json`, `16k`, `323k`:** capacity at the latency target, for each route.
2. **`slow-323k`:** 1,000 keep-alive clients, each limited to 10 Mbit/s with a 40 ms round trip, each asking for the next 323,000-byte body as soon as the last one arrives. This is the regime #4302 changes: the server always has more to send than the network takes, so responses wait in the server's buffers. It reports peak memory, CPU per response and the response times those clients see.

A smoke runs every cell with 100 slow clients and shortened steps.

### Hardware

- **Server:** c8g.xlarge (Graviton4, 4 vCPUs, 8 GiB), a size a service runs on. The x86 c8i.xlarge may follow by amendment.
- **Client:** c8gn.4xlarge (16 vCPUs, network-optimized) running oha 1.16.0, in the same availability zone and cluster placement group.
- **Slow clients:** on the server, `tc qdisc replace dev <nic> root fq maxrate 10mbit` paces every flow; on the client, `netem delay 40ms` adds the round trip. Both are removed after the cell.
- **The network ceiling:** at about 1.875 Gbps sustained, `323k` cannot exceed about 725 responses/s once burst credits are spent. As in map-tile-servers ADR 0011, a capacity above what the sustained rate carries is capped at it and the page names the servers that hit the ceiling; the server's ENA allowance counters (`bw_out_allowance_exceeded` and the rest) are read before and after every window to confirm it. CPU per response and memory at the ceiling still separate the servers.

### Measurement

- **A fresh server process per cell,** started and stopped by a small agent on the server instance, which also reads the process's CPU time and memory from `/proc` and the NIC's counters. Nothing else runs on the server: its package timers and unattended upgrades are off. The agent, and so every server it starts, may open 1,048,576 files, since a systemd unit's default of 1,024 would not hold 1,000 slow clients.
- **Capacity:** the highest offered rate a server holds with p99 at most 50 ms, at most 0.1% errors and at least 95% of the offered rate delivered. Load is open loop (oha's `-q` with `--latency-correction`), so queueing delay is part of the latency. The rate starts at a per-cell value, doubles until a step fails, then bisects three times between the last held rate and the first failed one. Each step is a warm-up and then a measured window.
- **CPU per response:** the server process's user plus system time over the measured window of the highest held step, divided by the responses in it. The client's CPU is recorded for every step; a step where the client used more than 80% of its CPUs is marked client-bound, and a capacity that rests on one is reported as a floor.
- **Memory:** peak RSS (`VmHWM`) less RSS after startup, per cell.
- **Latency:** measured at the client, p50, p99 and p99.9 per step.
- **Passes:** the framework lane runs three passes, each on a fresh instance pair, one after another; the spread between instance pairs is part of the answer. The change lane runs six passes on one instance pair. Within a cell its candidates run back to back, in an order that rotates each pass, and every pass adds an A/A cell (the base against itself on `json`) that shows the noise floor.

### Result

- **Framework lane, the headline:** capacity per instance for each cell, and its price in dollars per million responses at AWS list prices for the instance (the instance-hour over the responses it holds in an hour). Internet egress is the same bytes for every framework, so it is stated once, not added. Servers are ranked per cell by capacity; a difference counts only when the 95% confidence intervals of the three passes do not overlap, otherwise it is a tie.
- **Reported, not ranked:** CPU per response, peak memory, p99 at the highest step every server held, and the slow-client cell's memory, CPU and response times.
- **Change lane:** for each cell, the ratio of head to base for capacity, CPU per response and p99 at the highest step both held, and peak memory, each with a 95% bootstrap interval over the paired passes. An interval that contains 1.0 reads "no measurable change"; otherwise the result is the direction and the size. The A/A interval is printed beside them.
- The rule above is fixed before any measured pass, and smoke runs never decide a result.

### Local runs

- The same servers and runner run on one Linux machine. The agent pins the server to physical cores 0–3 and the runner pins oha to cores 4–7, over loopback.
- Shaping traffic needs root, so local slow clients are emulated the bot's way instead: the server's listener gets a 64 KiB send buffer (the kernel doubles it to 128 KiB) through the socket2 code above.
- Before each window the runner waits for a quiet host, and it records the CPU other processes used during the window.
- Local runs check the harness and inform a pull request. They never decide a published result.

### Budget

A smoke may spend up to $2 and 30 minutes. A framework run (one dispatch: three passes in turn, each on a fresh instance pair) may spend up to $15 and 3 hours, and a change run up to $10 and 3 hours. A pair costs about $1.11 an hour.

## Consequences

- The rig is a new CDK stack, `WarefeatsHttpServersBench` (results bucket, security group, cluster placement group, server and client launch templates, instance role), driven from GitHub Actions through an OIDC role, `http-servers-github-deploy`, the way the kv-stores and map-tile-servers rigs are. Deploying both is a one-time infrastructure step, `just rig-deploy` and then `just setup-oidc`. After that, a run needs only `gh`.
- Until the repo is public, GitHub's free arm64 runners are not available to it, so builds run on the rig's client.
- The results describe Graviton4 at 4 vCPUs behind a network that sustains 1.875 Gbps. Other sizes and architectures are other questions, and the page says so.
- Adding a candidate means a server crate, a row in the candidate table and an amendment here naming its documented setup.
