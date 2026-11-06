export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root
# Unpack, on both instances: the repository at the dispatched commit, from the bundle the workflow uploaded (the
# instances never clone, so a private repository works). tar fails on a short or empty stream, which stands in for
# the pipefail dash lacks.
mkdir -p /opt/bench
aws s3 cp 's3://${BUCKET}/runs/${RUN_ID}/bundle.tgz' - | tar -xz -C /opt/bench
cd /opt/bench
bun install --frozen-lockfile
