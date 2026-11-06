# shellcheck shell=bash
# Shared by the rig workflow (.github/workflows/rig.yml) and the offline checks (scripts/render-ssm.sh,
# scripts/rig-walk.sh): rendering, sending and waiting on the SSM commands in scripts/ssm/, and launching an
# instance. Sourcing it only defines things.

RIG_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# The only variables envsubst fills into scripts/ssm/*.sh, where each is written ${NAME}. Every other $ in those
# files belongs to the instance's shell (dash): its own variables are lower case, and an upper-case name braced
# alone is always one of these.
# shellcheck disable=SC2016 # a list for envsubst, not an expansion
SSM_VARS='${BUCKET} ${RUN_ID} ${LANE} ${MODE} ${CANDIDATES} ${SERVER_IP} ${PASS}'

# The names in SSM_VARS, one a line.
ssm_var_names() { grep -oE '[A-Z_][A-Z0-9_]*' <<< "$SSM_VARS"; }

# ssm_render <name>: scripts/ssm/<name>.sh with SSM_VARS filled in from the environment. Every one of them must be
# exported, an empty one too (CANDIDATES is empty for a lane's default set), and no ${NAME} may be left over.
ssm_render() {
  local name=$1 var text left
  for var in $(ssm_var_names); do
    printenv "$var" >/dev/null || { echo "ssm_render $name: $var is not exported" >&2; return 1; }
  done
  text=$(envsubst "$SSM_VARS" < "$RIG_ROOT/scripts/ssm/$name.sh") || return 1
  left=$(grep -oE '\$\{[A-Z_][A-Z0-9_]*\}' <<< "$text" | sort -u | tr '\n' ' ') || true
  if [ -n "$left" ]; then
    echo "ssm_render $name: ${left}is not in SSM_VARS" >&2
    return 1
  fi
  printf '%s\n' "$text"
}

# How long SSM may take to deliver a command before it gives up on it (send-command's --timeout-seconds). The
# status polls lower it, so an instance that stopped answering costs minutes, not quarter hours.
SSM_DELIVERY_S=${SSM_DELIVERY_S:-600}

# ssm_send <name> <execution-timeout-s> <instance>...: send the rendered command to the instances; prints its id.
# The full output goes to the bucket too, under runs/<run>/ssm/<name>/ (SSM's own answer keeps only the first
# 24,000 characters of stdout), except a status poll's: small, and one a minute.
ssm_send() {
  local name=$1 timeout=$2 script params
  shift 2
  local output=(--output-s3-bucket-name "$BUCKET" --output-s3-key-prefix "runs/$RUN_ID/ssm/$name")
  if [ "$name" = status ]; then output=(); fi
  script=$(ssm_render "$name") || return 1
  params=$(jq -n --arg c "$script" --arg t "$timeout" '{commands: [$c], executionTimeout: [$t]}') || return 1
  aws ssm send-command --instance-ids "$@" --document-name AWS-RunShellScript --comment "$RUN_ID $name" \
    --timeout-seconds "$SSM_DELIVERY_S" --parameters "$params" "${output[@]}" --query Command.CommandId --output text
}

# ssm_wait <command-id> <instance> <execution-timeout-s>: wait until the command has a final status on the
# instance, and print it (Unfinished when it still has none well past its timeout and SSM's delivery window).
ssm_wait() {
  local id=$1 instance=$2 deadline status
  deadline=$(($(date +%s) + $3 + SSM_DELIVERY_S + 60))
  while :; do
    sleep 5
    status=$(aws ssm get-command-invocation --command-id "$id" --instance-id "$instance" --query Status --output text 2>/dev/null) || status=Pending
    case "$status" in
      Pending | InProgress | Delayed | Cancelling) ;;
      *)
        echo "$status"
        return 0
        ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo Unfinished
      return 0
    fi
  done
}

# ssm_output <command-id> <instance>: what the command wrote to stdout there.
ssm_output() {
  aws ssm get-command-invocation --command-id "$1" --instance-id "$2" --query StandardOutputContent --output text
}

# ssm_run <name> <execution-timeout-s> <instance>...: send the command, wait for it on every instance, and print what
# each wrote (stdout here, stderr to stderr). Fails unless it succeeded on all of them.
ssm_run() {
  local name=$1 timeout=$2 id instance status answer text failed=0
  shift 2
  id=$(ssm_send "$name" "$timeout" "$@") || return 1
  for instance in "$@"; do
    status=$(ssm_wait "$id" "$instance" "$timeout")
    echo "--- $name on $instance (SSM command $id): $status" >&2
    answer=$(aws ssm get-command-invocation --command-id "$id" --instance-id "$instance" --output json) || answer='{}'
    text=$(jq -r '.StandardOutputContent // empty' <<< "$answer")
    if [ -n "$text" ]; then printf '%s\n' "$text"; fi
    text=$(jq -r '.StandardErrorContent // empty' <<< "$answer")
    if [ -n "$text" ]; then printf '%s\n' "$text" >&2; fi
    if [ "$status" != Success ]; then failed=1; fi
  done
  return "$failed"
}

# wait_online <instance>...: until SSM answers for each, up to 15 minutes. User data may still be running then:
# scripts/ssm/readiness.sh is the real gate.
wait_online() {
  local id ping
  for id in "$@"; do
    ping=""
    for _ in $(seq 1 90); do
      ping=$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$id" --query 'InstanceInformationList[0].PingStatus' --output text 2>/dev/null) || ping=""
      if [ "$ping" = Online ]; then break; fi
      sleep 10
    done
    if [ "$ping" != Online ]; then
      echo "SSM never came online on $id" >&2
      return 1
    fi
    echo "$id: SSM online" >&2
  done
}

# launch <template-id> <role> <subnet>...: an instance from the template's latest version (CloudFormation never
# moves a template's default version) in the first of the subnets with room, tagged Name=<run>-<role> and
# Project=$PROJECT_TAG. Prints "<instance-id> <private-ip> <zone> <subnet>". A throttled launch, or no capacity
# in any of the subnets, waits 30, 60, then 120 s and tries again; any other error fails at once.
launch() {
  local template=$1 role=$2
  shift 2
  local err out wait subnet tags
  err=$(mktemp)
  tags="{Key=Name,Value=$RUN_ID-$role},{Key=Project,Value=$PROJECT_TAG}"
  for wait in 0 30 60 120; do
    if [ "$wait" -gt 0 ]; then
      echo "$role: trying again in $wait s" >&2
      sleep "$wait"
    fi
    for subnet in "$@"; do
      if out=$(aws ec2 run-instances --launch-template "LaunchTemplateId=$template,Version=\$Latest" --subnet-id "$subnet" \
        --tag-specifications "ResourceType=instance,Tags=[$tags]" "ResourceType=volume,Tags=[$tags]" \
        --query 'Instances[0].[InstanceId,PrivateIpAddress,Placement.AvailabilityZone]' --output text 2>"$err"); then
        rm -f "$err"
        echo "$out $subnet"
        return 0
      fi
      if grep -q RequestLimitExceeded "$err"; then
        echo "$role: throttled (RequestLimitExceeded)" >&2
        break
      fi
      if grep -qE 'InsufficientInstanceCapacity|Unsupported' "$err"; then
        echo "$role: no capacity in $subnet: $(tr '\n' ' ' < "$err")" >&2
        continue
      fi
      cat "$err" >&2
      rm -f "$err"
      return 1
    done
  done
  rm -f "$err"
  echo "$role: still throttled or without capacity after waiting 30, 60 and 120 s" >&2
  return 1
}
