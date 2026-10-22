#!/bin/bash
# usage: scripts/dev/light-job.sh <cmd...>
# Two slots machine-wide for scoped work: one test file or package, lint on touched files.
# Builds, tsc, full suites, dev servers, browsers and emulators go through heavy-job.sh.
exec python3 -c '
import fcntl, os, subprocess, sys, time
if len(sys.argv) < 2:
    raise SystemExit("light-job.sh requires a command")
slots = ["/tmp/agi-light.slot%d.lock" % i for i in (1, 2)]
fds = [os.open(p, os.O_CREAT | os.O_RDWR, 0o600) for p in slots]
held = None
while held is None:
    for fd in fds:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            held = fd
            break
        except BlockingIOError:
            pass
    if held is None:
        time.sleep(2)
result = subprocess.run(sys.argv[1:])
raise SystemExit(result.returncode)
' "$@"
