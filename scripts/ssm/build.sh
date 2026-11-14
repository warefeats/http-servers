export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=/opt/rust/cargo
# Build, on the client: the lane's candidates in release mode (docs/adr/0001, Builds), then the binaries for the
# server and the build record to the bucket. An empty candidate list is the lane's default set.
# Spring's Maven build needs a JDK, Express's npm install the Node.js release the server runs, and rama's build
# libclang's headers, since rama-dns runs bindgen over <resolv.h> (docs/adr/0001, Builds); Rust is already here,
# from user data
# every download retries: GitHub's release redirects answer 504 in bursts, and curl retries those
fetch() { curl -fsSL --retry 5 --retry-delay 5 --retry-all-errors "$@"; }
apt-get -o DPkg::Lock::Timeout=600 -qq update
DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 -qq -y install --no-install-recommends \
  openjdk-25-jdk-headless xz-utils libclang-dev >/dev/null
node_version=v26.13.0
cd /tmp
fetch -O "https://nodejs.org/dist/$node_version/node-$node_version-linux-arm64.tar.xz"
fetch "https://nodejs.org/dist/$node_version/SHASUMS256.txt" | grep " node-$node_version-linux-arm64.tar.xz$" | sha256sum -c -
mkdir -p /opt/bench/runtimes/node
tar -xJf "node-$node_version-linux-arm64.tar.xz" -C /opt/bench/runtimes/node --strip-components=1
export PATH="/opt/bench/runtimes/node/bin:$PATH"
cd /opt/bench
bun run src/build.ts '--lane=${LANE}' '--candidates=${CANDIDATES}' --out=/opt/bench/build
aws s3 cp /opt/bench/build/bin/ 's3://${BUCKET}/runs/${RUN_ID}/bin/' --recursive --only-show-errors
aws s3 cp /opt/bench/build/record.json 's3://${BUCKET}/runs/${RUN_ID}/build-record.json' --only-show-errors
echo "built: $(find /opt/bench/build/bin -type f -printf '%f ')"
