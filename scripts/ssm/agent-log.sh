export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
export HOME=/root
# The agent's log, on the server, before the instance goes: the unit's journal, which otherwise ends with the
# instance.
journalctl -u bench-agent --no-pager -o short-iso-precise > /var/log/bench-agent.log
aws s3 cp /var/log/bench-agent.log 's3://${BUCKET}/runs/${RUN_ID}/agent.log' --only-show-errors
echo "agent log: $(wc -l < /var/log/bench-agent.log) lines"
