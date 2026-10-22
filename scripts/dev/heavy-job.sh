#!/bin/bash
# usage: scripts/dev/heavy-job.sh <cmd...>
# One heavy local job at a time machine-wide (builds, full suites, tsc, cargo, dev servers,
# browsers, emulators, git push). Waits for free memory before starting. Not re-entrant:
# never call it from inside a command it is already running.
exec python3 -c '
import fcntl, os, re, subprocess, sys, time

if len(sys.argv) < 2:
    raise SystemExit("heavy-job.sh requires a command")

def available_gb():
    try:
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, check=True).stdout
        size = int(re.search(r"page size of (\d+)", out).group(1))
        pages = 0
        for key in ("Pages free", "Pages inactive", "Pages speculative", "Pages purgeable"):
            m = re.search(key + r":\s+(\d+)", out)
            if m:
                pages += int(m.group(1))
        return pages * size / 2**30
    except (OSError, subprocess.CalledProcessError, AttributeError):
        try:
            with open("/proc/meminfo") as f:
                kb = int(re.search(r"MemAvailable:\s+(\d+)", f.read()).group(1))
            return kb / 2**20
        except (OSError, AttributeError):
            return None

need = float(os.environ.get("AGI_HEAVY_MIN_FREE_GB", "3"))
fd = os.open("/tmp/agi-heavy.kernel.lock", os.O_CREAT | os.O_RDWR, 0o600)
with os.fdopen(fd, "a") as mutex:
    fcntl.flock(mutex.fileno(), fcntl.LOCK_EX)
    deadline = time.time() + 900
    free = available_gb()
    while free is not None and free < need and time.time() < deadline:
        sys.stderr.write("heavy-job: %.1f GB free, waiting for %.1f GB\n" % (free, need))
        time.sleep(15)
        free = available_gb()
    result = subprocess.run(sys.argv[1:])
    raise SystemExit(result.returncode)
' "$@"
