import hashlib, json, os, re, stat, subprocess, sys, time

def read(path, pattern, limit=8192):
    try:
        with open(path, "rb") as handle:
            data = handle.read(limit + 1)
        if len(data) > limit:
            return {"state": "oversized"}
        value = data.decode("utf-8").strip()
        return {"state": "ok", "value": value} if re.fullmatch(pattern, value) else {"state": "malformed"}
    except OSError as error:
        return {"state": "unavailable", "errno": error.errno}
    except UnicodeError:
        return {"state": "malformed"}

def opaque(path):
    result = read(path, r"[\s\S]{0,8192}")
    if result["state"] == "ok":
        value = result.pop("value")
        result.update(sha256=hashlib.sha256(value.encode()).hexdigest(), isUnconfined=value == "unconfined")
    return result

def command(program, arguments, pattern):
    if not os.path.isfile(program) or not os.access(program, os.X_OK):
        return {"state": "unavailable"}
    try:
        result = subprocess.run([program, *arguments], capture_output=True, timeout=5, env={"PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LC_ALL": "C"})
        if result.returncode != 0:
            return {"state": "command-failed", "exit": result.returncode, "stderrSha256": hashlib.sha256(result.stderr).hexdigest()}
        value = result.stdout.decode("utf-8").strip()
        return {"state": "ok", "value": value} if len(result.stdout) <= 8192 and re.fullmatch(pattern, value) else {"state": "malformed"}
    except subprocess.TimeoutExpired:
        return {"state": "timed-out"}
    except (OSError, UnicodeError):
        return {"state": "unavailable"}

def binary(path):
    try:
        with os.fdopen(os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC), "rb") as handle:
            before = os.fstat(handle.fileno())
            if not stat.S_ISREG(before.st_mode) or before.st_size > 4194304:
                return {"state": "unsupported"}
            data = handle.read(4194305)
            if len(data) > 4194304:
                return {"state": "oversized"}
            digest = hashlib.sha256(data).hexdigest()
            capabilities = capability_attribute(handle.fileno())
            after = os.fstat(handle.fileno())
        identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_uid, item.st_gid, item.st_size, item.st_mtime_ns, item.st_ctime_ns)
        if identity(before) != identity(after):
            return {"state": "changed-during-read"}
        real = os.path.realpath(path)
        return {"state": "ok", "pathSha256": hashlib.sha256(os.fsencode(path)).hexdigest(), "systemPath": real if real in ("/usr/bin/bwrap", "/bin/bwrap") else None, "realPathSha256": hashlib.sha256(os.fsencode(real)).hexdigest(), "device": before.st_dev, "inode": before.st_ino, "mode": oct(stat.S_IMODE(before.st_mode)), "uid": before.st_uid, "gid": before.st_gid, "bytes": before.st_size, "sha256": digest, "accessible": os.access(path, os.X_OK), "fileCapabilities": capabilities}
    except OSError as error:
        return {"state": "unavailable", "errno": error.errno}

def loaded_profiles():
    result = read("/sys/kernel/security/apparmor/profiles", r"[\s\S]{0,1048576}", 1048576)
    if result["state"] == "ok":
        result["bwrapModes"] = re.findall(r"^(?:bwrap|/usr/bin/bwrap|/bin/bwrap) \((enforce|complain|unconfined)\)$", result.pop("value"), re.M)
    return result

def capability_attribute(path):
    try:
        value = os.getxattr(path, "security.capability")
        return {"state": "ok", "bytes": len(value), "sha256": hashlib.sha256(value).hexdigest()}
    except OSError as error:
        return {"state": "unavailable", "errno": error.errno}
    except AttributeError:
        return {"state": "unsupported"}

def runner_context():
    context = {}
    for name, pattern in {"GITHUB_SHA": r"[0-9a-f]{40}", "GITHUB_RUN_ID": r"\d{1,20}", "GITHUB_RUN_ATTEMPT": r"\d{1,10}", "GITHUB_JOB": r"rust-desktop-cli", "RUNNER_OS": r"Linux", "ImageOS": r"ubuntu24", "ImageVersion": r"[0-9.]{1,64}"}.items():
        value = os.environ.get(name)
        context[name] = {"state": "unavailable"} if value is None else ({"state": "ok", "value": value} if re.fullmatch(pattern, value) else {"state": "unexpected"})
    return context

def snapshot(parent):
    path = os.environ.get("PATH", "")
    candidates = []
    for position, directory in enumerate(path.split(os.pathsep)) if "PATH" in os.environ else []:
        candidate = os.path.join(directory, "bwrap")
        try:
            details = os.stat(candidate)
        except OSError:
            continue
        if stat.S_ISREG(details.st_mode) and details.st_mode & 0o111:
            candidates.append({"pathPosition": position, **binary(candidate)})
    status = read(f"/proc/{parent}/status", r"[\s\S]{1,8192}")
    fields = {}
    if status["state"] == "ok":
        for key, pattern in {"Uid": r"\d+(?:\s+\d+){3}", "Gid": r"\d+(?:\s+\d+){3}", "CapEff": r"[0-9a-fA-F]+", "CapPrm": r"[0-9a-fA-F]+", "CapBnd": r"[0-9a-fA-F]+", "NoNewPrivs": r"[01]", "Seccomp": r"[012]"}.items():
            match = re.search(rf"^{key}:\s*(.*?)$", status["value"], re.M)
            fields[key] = {"state": "ok", "value": match[1]} if match and re.fullmatch(pattern, match[1]) else {"state": "malformed-or-missing"}
    sysctls = {name: read(file, r"\d{1,20}") for name, file in {"apparmorRestrictUnprivilegedUserns": "/proc/sys/kernel/apparmor_restrict_unprivileged_userns", "unprivilegedUsernsClone": "/proc/sys/kernel/unprivileged_userns_clone", "maxUserNamespaces": "/proc/sys/user/max_user_namespaces"}.items()}
    namespaces = {}
    for name in ("user", "net", "mnt", "pid"):
        try:
            value = os.readlink(f"/proc/{parent}/ns/{name}")
            namespaces[name] = {"state": "ok", "value": value} if re.fullmatch(rf"{name}:\[\d+\]", value) else {"state": "malformed"}
        except OSError as error:
            namespaces[name] = {"state": "unavailable", "errno": error.errno}
    return {"schemaVersion": 1, "kind": "bubblewrap-parent-prerequisite-metadata", "observedAtUnixNs": time.time_ns(), "shellPid": parent, "runnerContext": runner_context(), "kernelRelease": read("/proc/sys/kernel/osrelease", r"[0-9A-Za-z._+~\-]{1,128}"), "collectorParentMatchesShell": os.getppid() == parent, "bootId": opaque("/proc/sys/kernel/random/boot_id"), "parentStatus": {"state": status["state"], "fields": fields}, "parentAppArmor": opaque(f"/proc/{parent}/attr/current"), "parentNamespaces": namespaces, "sysctls": sysctls, "loadedBwrapProfiles": loaded_profiles(), "apparmorEnabled": read("/sys/module/apparmor/parameters/enabled", r"[YN]"), "bwrapProfileSource": opaque("/etc/apparmor.d/bwrap"), "pathSha256": hashlib.sha256(os.fsencode(path)).hexdigest(), "pathPresent": "PATH" in os.environ, "bwrapCandidates": candidates, "uniqueAccessibleBinary": len({(entry["device"], entry["inode"], entry["sha256"]) for entry in candidates if entry["state"] == "ok" and entry["accessible"]}) == 1 and all(entry["state"] == "ok" and entry["accessible"] for entry in candidates), "packageVersion": command("/usr/bin/dpkg-query", ["-W", "-f=${Version}", "bubblewrap"], r"[0-9A-Za-z.+:~\-]{1,128}"), "childCapabilitiesObserved": False, "childAppArmorObserved": False, "actualCliExecIdentityObserved": False, "cause": "unknown"}

try:
    if len(sys.argv) != 2 or not re.fullmatch(r"\d+", sys.argv[1]):
        raise ValueError()
    print(json.dumps(snapshot(int(sys.argv[1])), sort_keys=True))
except Exception as error:
    print(json.dumps({"schemaVersion": 1, "kind": "bubblewrap-parent-prerequisite-metadata", "state": "collector-failed", "errorClass": type(error).__name__}))
