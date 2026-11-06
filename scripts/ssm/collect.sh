export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root
# Collect, on the client: the final log and the run's results to the bucket. A run still going at the workflow's
# deadline is stopped first, so what it wrote so far is all there is.
systemctl stop bench-run 2>/dev/null || true
aws s3 cp /var/log/bench-run.log 's3://${BUCKET}/runs/${RUN_ID}/run.log' --only-show-errors
if [ ! -d '/opt/bench/results/${RUN_ID}' ]; then
  echo "run.ts left no /opt/bench/results/${RUN_ID}" >&2
  exit 1
fi
aws s3 cp '/opt/bench/results/${RUN_ID}/' 's3://${BUCKET}/runs/${RUN_ID}/results/' --recursive --only-show-errors
echo "collected $(find '/opt/bench/results/${RUN_ID}' -type f | wc -l) result files"
