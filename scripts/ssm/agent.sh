export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root
# The agent, on the server: the client's binaries from the bucket, then src/agent.ts as a transient unit, so it
# outlives this command. It starts a fresh server process per cell, and those inherit the unit's limits: 1,000
# slow clients need more open files than the 1,024 a unit gets by default.
mkdir -p /opt/bench/build/bin
aws s3 cp 's3://${BUCKET}/runs/${RUN_ID}/bin/' /opt/bench/build/bin/ --recursive --only-show-errors
if [ -z "$(find /opt/bench/build/bin -type f)" ]; then
  echo "no binaries at s3://${BUCKET}/runs/${RUN_ID}/bin/" >&2
  exit 1
fi
find /opt/bench/build/bin -type f -exec chmod +x {} +
# wrk for the proof cells (docs/adr/0001, Cells), and what the servers outside Rust run on (The servers): Ubuntu's
# OpenJDK 25 and apache2, nginx.org's stable nginx the way its docs install it, and Node.js and Bun releases checked
# against the SHA-256 sums they publish. The packaged services stay off: the agent starts each server itself.
apt-get -o DPkg::Lock::Timeout=600 -qq update
DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 -qq -y install --no-install-recommends \
  wrk openjdk-25-jre-headless apache2 curl gnupg2 ca-certificates lsb-release ubuntu-keyring unzip xz-utils >/dev/null
systemctl disable --now apache2 >/dev/null 2>&1 || true
curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor > /usr/share/keyrings/nginx-archive-keyring.gpg
gpg --dry-run --quiet --no-keyring --import --import-options import-show /usr/share/keyrings/nginx-archive-keyring.gpg \
  | grep -q 573BFD6B3D8FBC641079A6ABABF5BD827BD9BF62
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] https://nginx.org/packages/ubuntu $(lsb_release -cs) nginx" \
  > /etc/apt/sources.list.d/nginx.list
printf 'Package: *\nPin: origin nginx.org\nPin: release o=nginx\nPin-Priority: 900\n' > /etc/apt/preferences.d/99nginx
apt-get -o DPkg::Lock::Timeout=600 -qq update
DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 -qq -y install nginx=1.30.6-1~noble >/dev/null
systemctl disable --now nginx >/dev/null 2>&1 || true
node_version=v26.13.0
bun_version=bun-v1.4.4
cd /tmp
curl -fsSLO "https://nodejs.org/dist/$node_version/node-$node_version-linux-arm64.tar.xz"
curl -fsSL "https://nodejs.org/dist/$node_version/SHASUMS256.txt" | grep " node-$node_version-linux-arm64.tar.xz$" | sha256sum -c -
mkdir -p /opt/bench/runtimes/node
tar -xJf "node-$node_version-linux-arm64.tar.xz" -C /opt/bench/runtimes/node --strip-components=1
curl -fsSLO "https://github.com/oven-sh/bun/releases/download/$bun_version/bun-linux-aarch64.zip"
curl -fsSL "https://github.com/oven-sh/bun/releases/download/$bun_version/SHASUMS256.txt" | grep " bun-linux-aarch64.zip$" | sha256sum -c -
rm -rf /tmp/bun-linux-aarch64 && unzip -q bun-linux-aarch64.zip -d /tmp
mkdir -p /opt/bench/runtimes/bun
install -m 755 /tmp/bun-linux-aarch64/bun /opt/bench/runtimes/bun/bun
cd /opt/bench
echo "runtimes: wrk $(wrk -v 2>&1 | head -n 1 | cut -d' ' -f2); $(java -version 2>&1 | head -n 1); $(apache2 -v | head -n 1); $(nginx -v 2>&1); node $(/opt/bench/runtimes/node/bin/node --version); bun $(/opt/bench/runtimes/bun/bun --version)"
systemd-run --unit=bench-agent --service-type=exec --working-directory=/opt/bench \
  --setenv=HOME=/root --setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --property=LimitNOFILE=1048576 \
  /usr/local/bin/bun run src/agent.ts --bin-dir=/opt/bench/build/bin --port=9000 --nic=auto --cpus=0-3 \
  --static-dir=/opt/bench/static
i=0
until curl -sf http://127.0.0.1:9000/health >/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ] || ! systemctl is-active --quiet bench-agent; then
    echo "the agent did not answer on port 9000 within 60 s" >&2
    journalctl -u bench-agent --no-pager -n 200 >&2 || true
    exit 1
  fi
  sleep 1
done
echo "bench-agent up after ${i} s, binaries: $(find /opt/bench/build/bin -type f -printf '%f ')"
