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
systemd-run --unit=bench-agent --service-type=exec --working-directory=/opt/bench \
  --setenv=HOME=/root --setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --property=LimitNOFILE=1048576 \
  /usr/local/bin/bun run src/agent.ts --bin-dir=/opt/bench/build/bin --port=9000 --nic=auto --cpus=0-3
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
