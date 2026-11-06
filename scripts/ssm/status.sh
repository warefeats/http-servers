export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e
# Status, on the client, once a minute: one line the workflow reads. bench-run is "running" while run.ts runs;
# after that RemainAfterExit keeps the unit loaded, exited or failed, with run.ts's result and exit status.
load=$(systemctl show bench-run --property=LoadState --value)
if [ "$load" != loaded ]; then
  echo "bench-run: missing (LoadState=$load)"
  exit 0
fi
sub=$(systemctl show bench-run --property=SubState --value)
case "$sub" in
  running | start* | reload* | stop* | final*)
    echo "bench-run: running"
    ;;
  *)
    echo "bench-run: stopped result=$(systemctl show bench-run --property=Result --value) status=$(systemctl show bench-run --property=ExecMainStatus --value) substate=$sub"
    ;;
esac
