#!/usr/bin/env bash
# Render every SSM command the rig workflow sends (scripts/ssm/*.sh) the way the workflow does (ssm_render in
# scripts/rig-lib.sh), with stub values, and check each one: it starts with the PATH export and set -e, parses
# under dash (the shell SSM runs it with), and passes shellcheck's dash dialect. The candidates are rendered empty
# (the lane's default set, which must still parse) and as a list.
#   scripts/render-ssm.sh [out-dir]
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck source=scripts/rig-lib.sh
. "$root/scripts/rig-lib.sh"
out=${1:-$(mktemp -d)}
mkdir -p "$out"

path_line='export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
export BUCKET=warefeats-http-servers-results-123456789012
export RUN_ID=change-smoke-12345678901-1-p1
export LANE=change
export MODE=smoke
export SERVER_IP=10.0.0.10
export PASS=2

fail=0
count=0
for candidates in "" "actix-web-81bb997,actix-web-pr4302,axum-40d061f"; do
  export CANDIDATES=$candidates
  variant=default
  if [ -n "$candidates" ]; then variant=listed; fi
  for template in "$root"/scripts/ssm/*.sh; do
    name=$(basename "$template" .sh)
    file=$out/$name.$variant.sh
    count=$((count + 1))
    if ! ssm_render "$name" > "$file"; then
      echo "  FAIL  $name ($variant candidates): did not render"
      fail=1
      continue
    fi
    problems=()
    [ "$(sed -n 1p "$file")" = "$path_line" ] || problems+=("line 1 is not the PATH export")
    [ "$(sed -n 2p "$file")" = "set -e" ] || problems+=("line 2 is not set -e")
    dash -n "$file" 2>"$file.dash" || problems+=("dash -n: $(tr '\n' ' ' < "$file.dash")")
    shellcheck -s dash "$file" >"$file.shellcheck" 2>&1 || problems+=("shellcheck -s dash:"$'\n'"$(cat "$file.shellcheck")")
    if [ ${#problems[@]} -eq 0 ]; then
      echo "  PASS  $name ($variant candidates)"
    else
      echo "  FAIL  $name ($variant candidates): ${problems[*]}"
      fail=1
    fi
  done
done
echo "rendered $count commands into $out"
if [ "$fail" -ne 0 ]; then
  echo "render-ssm: some commands failed" >&2
  exit 1
fi
