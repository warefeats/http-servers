export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root
# The run, on the client: src/run.ts as a transient unit, so it outlives this command, with its output in
# /var/log/bench-run.log. RemainAfterExit keeps the unit's result after run.ts exits, for status.sh to read.
# A companion unit copies the log to the bucket every 30 s while run.ts runs, and once more when it stops.
mkdir -p '/opt/bench/results/${RUN_ID}'
systemd-run --unit=bench-run --service-type=exec --remain-after-exit --working-directory=/opt/bench \
  --setenv=HOME=/root --setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  --property=LimitNOFILE=1048576 \
  --property=StandardOutput=truncate:/var/log/bench-run.log --property=StandardError=inherit \
  /usr/local/bin/bun run src/run.ts '--lane=${LANE}' '--mode=${MODE}' '--candidates=${CANDIDATES}' \
  '--agent=http://${SERVER_IP}:9000' '--target-host=${SERVER_IP}' --nic=auto '--first-pass=${PASS}' \
  '--out=/opt/bench/results/${RUN_ID}'
systemd-run --unit=bench-run-log --service-type=exec \
  --setenv=HOME=/root --setenv=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  /bin/sh -c 'while systemctl show bench-run --property=SubState --value | grep -qx running; do aws s3 cp /var/log/bench-run.log s3://${BUCKET}/runs/${RUN_ID}/run.log --only-show-errors || true; sleep 30; done; aws s3 cp /var/log/bench-run.log s3://${BUCKET}/runs/${RUN_ID}/run.log --only-show-errors'
echo "bench-run started: lane ${LANE}, mode ${MODE}, candidates '${CANDIDATES}', agent ${SERVER_IP}:9000"
