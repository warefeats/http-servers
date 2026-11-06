# HTTP server benchmark

How many responses a second one instance of an HTTP server framework holds at a latency target, what that costs, and what it spends in CPU and memory doing it. Part of the [warefeats](https://warefeats.com) benchmark suite. The design, and the rule every result is read by, is [ADR 0001](docs/adr/0001-what-the-benchmark-answers.md); it was fixed before any measured pass.

## Lanes

- **Frameworks** (the headline): each framework's latest crates.io release in its documented default setup. Today: actix-web 4.18.1 and axum 0.8.9.
- **Change**: one framework commit against its base, to answer a pull request's "does this change throughput, latency, CPU or memory?". Never ranked, never a post. Today: actix-web #4302's head (2a3f201) against its merge-base (81bb997), with axum's main branch (40d061f) beside them.

The candidates and lanes live in [`src/candidates.ts`](src/candidates.ts).

## Servers

One bench server per framework in [`servers/`](servers/), written the way each framework's docs show, sharing [`servers/common`](servers/common/src/lib.rs): the listener, the byte bodies, the file and the JSON document.

| Route | Response |
| :-- | :-- |
| `/json` | a document of about 1 KB, built and serialized on every request with the framework's own JSON responder |
| `/16k` | 16,384 bytes, under actix-web's 32 KiB write-buffer threshold |
| `/323k` | 323,000 bytes, the size #4302 was measured on, cloned from one shared buffer |
| `/323k-fresh` | the same 323,000 bytes, copied into a new buffer on every request as a handler builds its own body |
| `/file` | a 64 MiB file, through the file server each framework's docs use: actix-files' `NamedFile`, tower-http's `ServeFile` |

Every server runs at its framework's defaults: default features, the default release profile, one worker per available CPU, no middleware, Nagle left on. The one equalization is the listen backlog: both listen through the same socket2 code with actix-web's default of 1,024, where axum's documented `tokio::net::TcpListener::bind` would get 128.

## Cells

- `json`, `16k`, `323k`: capacity, the highest open-loop rate a server holds with p99 at most 50 ms, at most 0.1% errors and at least 95% delivered, found by doubling and then bisecting. CPU per response and p99 are read at the highest held rate.
- `323k-fresh`: the same capacity search on `/323k-fresh`.
- `slow-323k`, `slow-323k-fresh`: 1,000 keep-alive clients (100 in a smoke) fetching `/323k` or `/323k-fresh` back to back, each flow paced at 10 Mbit/s with a 40 ms round trip on the rig; locally, the listener's send buffer is capped at 128 KiB instead. Peak memory, CPU per response and the response times those clients see.
- `file`: 64 keep-alive clients downloading `/file` back to back with nothing shaped. Throughput, CPU per response, peak memory and download times; no latency target, since one 64 MiB response alone takes about 11 ms on a 50 Gbps link.
- The change lane measures its base against itself on `json` every pass (the A/A row), to show the noise floor.

## Running it locally

Needs Rust, bun, and oha 1.16.0 on a Linux machine with at least 16 CPUs.

```sh
bun install
bun run src/build.ts --lane=change           # build/bin/<candidate>
bun run src/run.ts --local --lane=change --mode=smoke
bun run src/report.ts results/<run>/results.json
```

Locally the runner starts the agent itself, pins the server to CPUs 0–7 and oha to 8–15 (`--server-cpus`, `--client-cpus`), and waits for a quiet host before every recorded window. Local runs check the harness and inform a pull request; they never decide a published result.

## The rig

Measured runs happen on the cloud rig in us-east-1: a c8gn.4xlarge client and a c8gn.4xlarge server, its process pinned to 4 cores, in one cluster placement group, launched from the `WarefeatsHttpServersBench` stack by GitHub Actions ([`.github/workflows/rig.yml`](.github/workflows/rig.yml)) through an OIDC role, the way the kv-stores and map-tile-servers rigs run. Setting it up is a one-time step with AWS credentials: `just rig-deploy` deploys the stack, then `just setup-oidc` deploys the `http-servers-github-deploy` role and stores its ARN as the `AWS_ROLE_ARN` secret of the `http-servers-bench` environment. After that a run needs only `gh`: `just rig-walk` checks the rig offline, `just rig-cloud <change|frameworks> <smoke|full>` dispatches it (`-f candidates=<list>` replaces the lane's default set), `just rig-watch` follows it, and `just rig-fetch <run id>` downloads each pass's artifact into `runs/raw/<run id>/`. Each pass launches a fresh pair, hands both the dispatched commit through the rig's bucket, builds the candidates on the client, starts the agent on the server, prints `run.ts`'s log into the job's log as it goes, collects the results with a `metadata.json`, and terminates both instances. A full framework run is three passes, one after another, each on its own pair; a full change run is six passes on one pair.

## Runs

Each measured run keeps its report, results, metadata and build record in `runs/<GitHub run id>/`.

- [42155947807](runs/42155947807/report.md) (2026-11-06): the change lane, six passes on one pair, on the `json`, `16k`, `323k` and `slow-323k` cells.
- [42170865139](runs/42170865139/report.md) (2026-11-06): the change lane again, six passes on another pair, with the `323k-fresh`, `slow-323k-fresh` and `file` cells added.
