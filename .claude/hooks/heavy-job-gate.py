#!/usr/bin/env python3
import json
import os
import re
import shlex
import subprocess
import sys

SMALL_MACHINE_GB = 24
LOCKS = ("heavy-job.sh", "light-job.sh", "heavy.sh", "light.sh")
RUNNERS = {"pnpm", "npm", "yarn", "bun"}
HEAVY_SCRIPTS = re.compile(
    r"^(build|dev|test|e2e|typecheck|tsc|lint|knip|storybook)(:|$)"
    r"|^check:(llm-operability|trust-boundaries|protocol-types)$"
)
HEAVY_TOOLS = {
    "tsc", "vitest", "jest", "playwright", "next", "expo", "eas", "turbo", "xcodebuild",
    "gradle", "gradlew", "./gradlew", "electron-builder", "electron-forge", "storybook",
    "knip", "webpack", "vite",
}
CARGO_HEAVY = {"build", "test", "check", "clippy", "run", "bench", "nextest"}
WRAPPERS = {"timeout", "nohup", "time", "nice", "env", "caffeinate"}


def machine_gb():
    try:
        out = subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True, check=True)
        return int(out.stdout.strip()) / 2**30
    except (OSError, ValueError, subprocess.CalledProcessError):
        try:
            with open("/proc/meminfo") as f:
                return int(re.search(r"MemTotal:\s+(\d+)", f.read()).group(1)) / 2**20
        except (OSError, AttributeError):
            return None


def words(segment):
    try:
        tokens = shlex.split(segment)
    except ValueError:
        tokens = segment.split()
    while tokens and (re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", tokens[0]) or tokens[0] in WRAPPERS):
        head = tokens.pop(0)
        if head == "timeout" and tokens and re.match(r"^\d", tokens[0]):
            tokens.pop(0)
    return tokens


def is_heavy(tokens):
    if not tokens or any(t in ("--version", "-v", "--help", "-h") for t in tokens[1:3]):
        return False
    tool = os.path.basename(tokens[0])
    rest = tokens[1:]
    if tool in LOCKS:
        return False
    if tool in ("next", "vite") and rest and rest[0] in ("start", "preview"):
        return False
    if tool == "git":
        return bool(rest) and rest[0] == "push"
    if tool == "cargo":
        return bool(rest) and rest[0] in CARGO_HEAVY
    if tool == "npx":
        return bool(rest) and is_heavy(rest)
    if tool in RUNNERS:
        args = []
        skip = False
        for t in rest:
            if skip:
                skip = False
                continue
            if t in ("--filter", "-F", "-C", "--dir", "--workspace"):
                skip = True
                continue
            if t.startswith("-"):
                continue
            args.append(t)
        if not args:
            return False
        if args[0] in ("exec", "dlx", "x"):
            return len(args) > 1 and is_heavy(args[1:])
        if args[0] == "run":
            args = args[1:]
        return bool(args) and bool(HEAVY_SCRIPTS.search(args[0]))
    return tool in HEAVY_TOOLS


def main():
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    command = (payload.get("tool_input") or {}).get("command") or ""
    if not command:
        return
    size = machine_gb()
    if size is None or size > SMALL_MACHINE_GB:
        return
    for segment in re.split(r"&&|\|\||;|\||\n", command):
        if is_heavy(words(segment.strip())):
            reason = (
                "This machine has %d GB of RAM, so heavy local jobs run one at a time. "
                "Prefix the command with scripts/dev/heavy-job.sh (builds, full test suites, tsc, cargo, "
                "dev servers, browsers, emulators, git push) or scripts/dev/light-job.sh "
                "(one test file or package, lint on touched files)." % round(size)
            )
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }))
            return


main()
