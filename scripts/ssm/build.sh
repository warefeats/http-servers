export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
# Build, on the client: the lane's candidates in release mode (docs/adr/0001, Builds), then the binaries for the
# server and the build record to the bucket. An empty candidate list is the lane's default set.
cd /opt/bench
bun run src/build.ts '--lane=${LANE}' '--candidates=${CANDIDATES}' --out=/opt/bench/build
aws s3 cp /opt/bench/build/bin/ 's3://${BUCKET}/runs/${RUN_ID}/bin/' --recursive --only-show-errors
aws s3 cp /opt/bench/build/record.json 's3://${BUCKET}/runs/${RUN_ID}/build-record.json' --only-show-errors
echo "built: $(find /opt/bench/build/bin -type f -printf '%f ')"
