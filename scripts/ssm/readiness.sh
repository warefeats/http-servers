export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
# Readiness, on both instances. SSM answers while user data is still installing; user data writes
# /var/lib/bench-ready as its last line, and cloud-init finishes right after it, or as soon as user data stops
# short. So: wait for cloud-init, up to 15 minutes, then look for the marker.
start=$(date +%s)
timeout 900 cloud-init status --wait >/dev/null 2>&1 || true
if [ ! -s /var/lib/bench-ready ]; then
  if cloud-init status 2>/dev/null | grep -q running; then
    echo "user data did not finish within 15 minutes" >&2
  else
    echo "user data stopped before it wrote /var/lib/bench-ready" >&2
  fi
  tail -n 80 /var/log/cloud-init-output.log >&2 || true
  exit 1
fi
echo "ready after $(($(date +%s) - start)) s: $(cat /var/lib/bench-ready)"
