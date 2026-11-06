#!/usr/bin/env bash
# The offline check before any dispatch of .github/workflows/rig.yml. It renders every SSM command and checks it
# under dash and shellcheck, checks the commands use no placeholder the workflow leaves unfilled, lints the
# workflows and the rig's scripts, checks the lockfile the instances install from, tests and type-checks the stack,
# lints the user data it synthesizes, and replays that user data in an ubuntu:24.04 arm64 container when Docker is
# here. Nothing reaches AWS. What it renders stays in a temporary directory, named at the end.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
tmp=$(mktemp -d)
fail() {
  echo "rig-walk: $*" >&2
  exit 1
}

echo "1. the SSM commands, rendered the way the workflow renders them"
bash scripts/render-ssm.sh "$tmp/ssm"

echo "2. placeholders"
# shellcheck source=scripts/rig-lib.sh
. scripts/rig-lib.sh
listed=$(ssm_var_names | sort -u)
used=$(grep -ohE '\$\{[A-Z_][A-Z0-9_]*\}' scripts/ssm/*.sh | tr -d '{}$' | sort -u)
unlisted=$(comm -13 <(echo "$listed") <(echo "$used"))
[ -z "$unlisted" ] || fail "scripts/ssm uses ${unlisted//$'\n'/ }, which SSM_VARS in scripts/rig-lib.sh does not list: the workflow would send it unfilled"
unused=$(comm -23 <(echo "$listed") <(echo "$used"))
[ -z "$unused" ] || fail "SSM_VARS lists ${unused//$'\n'/ }, which no command in scripts/ssm uses"
bare=$(grep -nE "\\\$($(paste -sd '|' <<< "$listed"))([^A-Za-z0-9_]|\$)" scripts/ssm/*.sh || true)
[ -z "$bare" ] || fail "write each placeholder as \${NAME}:"$'\n'"$bare"
# the workflow renders only through rig-lib.sh, and sets every variable SSM_VARS lists: in the job's env, or
# through GITHUB_ENV before the first command goes out
! grep -n envsubst .github/workflows/*.yml || fail "a workflow calls envsubst itself: render through ssm_render in scripts/rig-lib.sh"
while read -r var; do
  grep -qE "^ +$var: |echo \"$var=" .github/workflows/rig.yml || fail "rig.yml never sets $var, which the SSM commands need"
done <<< "$listed"
echo "  ${used//$'\n'/ }: every one in SSM_VARS, and set by rig.yml"

echo "3. the workflows and the rig's scripts"
actionlint .github/workflows/*.yml
shellcheck -x -s bash scripts/rig-lib.sh scripts/render-ssm.sh scripts/rig-walk.sh
echo "  actionlint and shellcheck: clean"

echo "4. the lockfile the instances install from (bun install --frozen-lockfile)"
bun install --frozen-lockfile --dry-run >/dev/null || fail "bun.lock does not match package.json: run bun install and commit bun.lock"
echo "  bun.lock matches package.json"

echo "5. the stack: tests and types"
(cd infra && bun test && bun x tsc --noEmit)
echo "  bun test and tsc: clean"

echo "6. the user data the stack synthesizes"
(cd infra && bun run bin/user-data.ts "$tmp/user-data")
shellcheck -s bash "$tmp/user-data/server.sh" "$tmp/user-data/client.sh"
echo "  shellcheck: clean"

echo "7. the user data, replayed in an ubuntu:24.04 arm64 container"
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "  skipped: no Docker here"
elif ! docker run --rm --platform linux/arm64 ubuntu:24.04 true >/dev/null 2>&1; then
  echo "  skipped: Docker here cannot run linux/arm64 images (qemu binfmt is not set up)"
else
  containers=()
  # shellcheck disable=SC2317,SC2329 # the EXIT trap calls it
  remove_containers() { if [ ${#containers[@]} -gt 0 ]; then docker rm -f "${containers[@]}" >/dev/null 2>&1 || true; fi; }
  trap remove_containers EXIT
  echo "  (emulated arm64 is slow: the client's build tools and Rust take a while)"
  for role in server client; do
    name=http-servers-walk-$role-$$
    containers+=("$name")
    docker run -d --name "$name" --platform linux/arm64 ubuntu:24.04 sleep infinity >/dev/null
    # a container has no init, no snaps and no kernel modules, and must not power off: stubs say what they skipped
    docker exec -i "$name" sh <<'STUBS'
for c in shutdown systemctl snap modprobe; do
  printf '#!/bin/sh\necho "stub: %s $*"\n' "$c" > "/usr/local/sbin/$c"
  chmod 755 "/usr/local/sbin/$c"
done
STUBS
    docker cp "$tmp/user-data/$role.sh" "$name:/root/user-data.sh" >/dev/null
    docker cp "$tmp/ssm/readiness.default.sh" "$name:/root/readiness.sh" >/dev/null
    start=$(date +%s)
    if ! docker exec "$name" bash /root/user-data.sh > "$tmp/replay-$role.log" 2>&1; then
      tail -n 40 "$tmp/replay-$role.log" >&2
      fail "the $role's user data failed in the container (the full log is $tmp/replay-$role.log)"
    fi
    echo "  $role: user data done in $(($(date +%s) - start)) s"
    # the readiness gate under dash, then every tool the commands call, with SSM's bare environment
    docker exec "$name" dash /root/readiness.sh > "$tmp/readiness-$role.log" 2>&1 \
      || fail "the readiness gate failed on the replayed $role: $(cat "$tmp/readiness-$role.log")"
    sed 's/^/    /' "$tmp/readiness-$role.log"
    tools="aws bun curl jq tc ethtool"
    if [ "$role" = client ]; then tools="$tools cargo rustc oha"; fi
    for t in $tools; do
      docker exec "$name" env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -c "command -v $t >/dev/null" \
        || fail "the $role has no $t on SSM's PATH"
    done
    if [ "$role" = client ]; then
      docker exec "$name" env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin sh -c 'cargo --version && rustc --version && oha --version' | sed 's/^/    /'
    fi
    echo "  $role: $tools on SSM's PATH"
  done
fi

echo "rig-walk: all good (rendered commands and user data are in $tmp)"
