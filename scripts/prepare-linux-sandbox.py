import hashlib
import json
import os
from pathlib import Path
import re
import signal
import socket
import stat
import subprocess
import sys
import threading
import time
import uuid


PROFILE = Path('/usr/share/apparmor/extra-profiles/bwrap-userns-restrict')
ENV = {'PATH': '/usr/bin:/bin:/usr/sbin:/sbin', 'LC_ALL': 'C'}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def policy_blocks(text):
    text = re.sub(r'#[^\n]*', '', text)
    blocks = re.findall(r'^profile\s+(\w+)([^{}\n]*)\{(.*?)^\}', text, re.M | re.S)
    require([block[0] for block in blocks] == ['bwrap', 'unpriv_bwrap'], 'Expected packaged policy owners')
    require(not re.search(r'\b(?:complain|unconfined|default_allow)\b', text), 'Policy must enforce restrictions')
    outer, child = blocks
    require(re.search(r'^\s*/usr/bin/bwrap\s', outer[1]), 'Policy must attach to the system executable')
    require(re.search(r'\ballow\s+capability\s*,', outer[2]), 'Setup capability permission required')
    require(re.search(r'\ballow\s+userns\s*,', outer[2]), 'Setup namespace permission required')
    require(re.search(r'allow\s+p(?:i)?x\s+/\*\*\s*->\s*&?bwrap//&unpriv_bwrap\s*,', outer[2]), 'Executed children must enter the capability restriction')
    require(re.search(r'\baudit\s+deny\s+capability\s*,', child[2]), 'Child capabilities must be denied')
    require(not re.search(r'\ballow\s+(?:all|capability)\b', child[2]), 'Child capability permission refused')
    require(re.search(r'allow\s+pix\s+/\*\*\s*->\s*&unpriv_bwrap\s*,', child[2]), 'Descendants must retain the capability restriction')
    return text


def status():
    text = Path('/proc/self/status').read_text()
    return {key: re.search(rf'^{key}:\s*(\S+)', text, re.M)[1] for key in ('CapEff', 'CapPrm', 'NoNewPrivs')}


def namespaces():
    return {name: os.readlink(f'/proc/self/ns/{name}') for name in ('net', 'user', 'mnt')}


def child_report(request):
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        with socket.create_connection(listener.getsockname(), timeout=2):
            connection, _ = listener.accept()
            connection.close()
    blocked = False
    try:
        with socket.create_connection(('127.0.0.1', request['port']), timeout=2):
            pass
    except OSError:
        blocked = True
    return {'sentinel': request['sentinel'], 'hostListenerBlocked': blocked, 'privateLoopbackReached': True,
            'namespaces': namespaces(), 'status': status(), 'profile': Path('/proc/self/attr/current').read_text().strip()}


def validate_child(report, request, parent):
    require(report['sentinel'] == request['sentinel'] and report['privateLoopbackReached'] is True, 'Actual child sentinel and loopback required')
    require(report['hostListenerBlocked'] is True, 'Host listener must be isolated')
    require(all(report['namespaces'][name] != parent[name] for name in parent), 'Separate child namespaces required')
    require(int(report['status']['CapEff'], 16) == 0 and int(report['status']['CapPrm'], 16) == 0, 'Child effective and permitted capabilities must be empty')
    require(report['status']['NoNewPrivs'] == '1', 'Child no-new-privileges required')
    require(report['profile'] == 'bwrap//&unpriv_bwrap (enforce)', 'Enforced capability-stripping child profile required')


def require_stopped_group(pid):
    try:
        os.killpg(pid, 0)
    except ProcessLookupError:
        return
    raise RuntimeError('Prerequisite command process group must be absent')


def command(arguments, timeout=30, input_data=None):
    child = subprocess.Popen(arguments, stdin=subprocess.PIPE if input_data is not None else subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=ENV, start_new_session=True)
    streams = [bytearray(), bytearray()]
    oversized = [False, False]

    def drain(handle, index):
        while True:
            data = handle.read(8192)
            if not data:
                return
            remaining = 1048576 - len(streams[index])
            streams[index].extend(data[:remaining])
            oversized[index] |= len(data) > remaining

    readers = [threading.Thread(target=drain, args=(handle, index), daemon=True)
               for index, handle in enumerate((child.stdout, child.stderr))]
    for reader in readers:
        reader.start()
    try:
        if input_data is not None:
            child.stdin.write(input_data)
            child.stdin.close()
        code = child.wait(timeout=timeout)
    finally:
        for action in (signal.SIGTERM, signal.SIGKILL):
            try:
                os.killpg(child.pid, action)
            except ProcessLookupError:
                break
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                child.poll()
                try:
                    os.killpg(child.pid, 0)
                except ProcessLookupError:
                    break
                time.sleep(0.05)
            else:
                continue
            break
        child.wait(timeout=5)
        for reader in readers:
            reader.join(timeout=5)
        require(not any(reader.is_alive() for reader in readers), 'Prerequisite command descendants must stop')
        require_stopped_group(child.pid)
    require(not any(oversized), 'Bounded prerequisite command output required')
    return subprocess.CompletedProcess(arguments, code, bytes(streams[0]), bytes(streams[1]))


def probe():
    parent = namespaces()
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        listener.listen(2)
        with socket.create_connection(listener.getsockname(), timeout=2):
            connection, _ = listener.accept()
            connection.close()
        request = {'sentinel': str(uuid.uuid4()), 'port': listener.getsockname()[1]}
        argv = ['/usr/bin/bwrap', '--die-with-parent', '--new-session', '--unshare-user', '--unshare-pid',
                '--unshare-net', '--unshare-ipc', '--unshare-uts', '--ro-bind', '/', '/', '--dev', '/dev',
                '--proc', '/proc', '--tmpfs', '/tmp', '--chdir', '/', '--', '/usr/bin/python3', '-I', '-S',
                str(Path(__file__).resolve()), '--child']
        completed = command(argv, input_data=json.dumps(request).encode())
        receipt = {'exit': completed.returncode, 'stdoutBytes': len(completed.stdout), 'stderrBytes': len(completed.stderr),
                   'stderrSha256': hashlib.sha256(completed.stderr).hexdigest(),
                   'loopbackSetupDenied': b'loopback: Failed RTM_NEWADDR: Operation not permitted' in completed.stderr}
        if completed.returncode != 0:
            return receipt
        require(len(completed.stdout) <= 8192 and not completed.stderr, 'Exact bounded child output required')
        report = json.loads(completed.stdout)
        validate_child(report, request, parent)
        receipt.update(childReached=True, networkIsolated=True, childCapabilitiesEmpty=True, childProfileEnforced=True)
        return receipt


def packaged_profile():
    metadata = PROFILE.lstat()
    require(stat.S_ISREG(metadata.st_mode) and metadata.st_uid == 0 and metadata.st_mode & 0o022 == 0, 'Root-owned regular packaged profile required')
    data = PROFILE.read_bytes()
    require(len(data) <= 16384, 'Bounded packaged profile required')
    checksums = Path('/var/lib/dpkg/info/apparmor-profiles.md5sums').read_text().splitlines()
    expected = [line.split()[0] for line in checksums if line.split()[1:] == [str(PROFILE).lstrip('/')]]
    require(len(expected) == 1 and hashlib.md5(data, usedforsecurity=False).hexdigest() == expected[0], 'Installed package profile checksum required')
    version = command(['/usr/bin/dpkg-query', '-W', '-f=${Version}', 'apparmor-profiles'])
    require(version.returncode == 0 and re.fullmatch(rb'[0-9A-Za-z.+:~\-]+', version.stdout), 'Installed package version required')
    policy_blocks(data.decode())
    for name in ('bwrap-userns-restrict', 'unpriv_bwrap'):
        local = Path('/etc/apparmor.d/local') / name
        if local.exists() or local.is_symlink():
            require(local.is_file() and not local.is_symlink() and not re.sub(r'#[^\n]*', '', local.read_text()).strip(), 'Existing local policy additions require review')
    return {'version': version.stdout.decode(), 'profileSha256': hashlib.sha256(data).hexdigest()}


def preparation_action(before, loaded):
    matches = re.findall(rb'^((?:bwrap|unpriv_bwrap)(?:\S*?)) \((\w+)\)$', loaded, re.M)
    qualified = before.get('exit') == 0 and all(before.get(key) is True for key in
        ('childReached', 'networkIsolated', 'childCapabilitiesEmpty', 'childProfileEnforced'))
    if qualified:
        require(sorted(matches) == [(b'bwrap', b'enforce'), (b'unpriv_bwrap', b'enforce')], 'Existing successful policy must have the enforced packaged owners')
        return 'reuse'
    require(not matches, 'Existing Bubblewrap profiles must be preserved and reviewed')
    require(before.get('exit') != 0 and before.get('loopbackSetupDenied') is True, 'Unproven prerequisite failure requires review before policy mutation')
    return 'add'


def prepare():
    require(sys.platform == 'linux' and os.geteuid() != 0, 'Run prerequisite as the ordinary Linux CI user')
    parent_status = status()
    require(int(parent_status['CapEff'], 16) == 0 and int(parent_status['CapPrm'], 16) == 0, 'Ordinary parent capabilities required')
    require(Path('/sys/module/apparmor/parameters/enabled').read_text().strip() == 'Y', 'AppArmor must remain enabled')
    sysctl = Path('/proc/sys/kernel/apparmor_restrict_unprivileged_userns')
    before_sysctl = sysctl.read_bytes()
    require(before_sysctl.strip() == b'1', 'Unprivileged namespace restriction must remain enabled')
    package = packaged_profile()
    before = probe()
    print(json.dumps({'kind': 'linux-sandbox-prerequisite-before', 'package': package, 'probe': before}), flush=True)
    loaded = command(['/usr/bin/sudo', '-n', '/usr/bin/timeout', '--foreground', '--signal=KILL', '20', '/bin/cat', '/sys/kernel/security/apparmor/profiles'])
    require(loaded.returncode == 0, 'Loaded profile inventory required')
    action = preparation_action(before, loaded.stdout)
    names = command(['/sbin/apparmor_parser', '--base', '/etc/apparmor.d', '--skip-cache', '--names', str(PROFILE)])
    require(names.returncode == 0 and names.stdout.splitlines() == [b'bwrap', b'unpriv_bwrap'], 'Exact packaged parser owners required')
    if action == 'add':
        loaded = command(['/usr/bin/sudo', '-n', '/usr/bin/timeout', '--foreground', '--signal=KILL', '20', '/sbin/apparmor_parser', '--base', '/etc/apparmor.d', '--skip-cache', '--add', str(PROFILE)])
        require(loaded.returncode == 0, 'Add-only packaged profile load failed; no replacement permitted')
        after = probe()
    else:
        after = before
    require(after.get('childReached') is True, 'Actual ordinary-user sandbox prerequisite failed')
    require(sysctl.read_bytes() == before_sysctl, 'Global namespace restriction changed')
    require(Path('/sys/module/apparmor/parameters/enabled').read_text().strip() == 'Y', 'AppArmor changed')
    require(packaged_profile() == package, 'Installed profile changed during load/probe')
    print(json.dumps({'kind': 'linux-sandbox-prerequisite-after', 'package': package, 'probe': after,
                      'action': action, 'globalRestrictionUnchanged': True, 'AppArmorEnabled': True}), flush=True)


if __name__ == '__main__':
    def interrupt(signum, frame):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGTERM, interrupt)
    try:
        if sys.argv[1:] == ['--child']:
            print(json.dumps(child_report(json.loads(sys.stdin.buffer.read(8193)))))
        else:
            require(not sys.argv[1:], 'No prerequisite override arguments permitted')
            prepare()
    except BaseException as error:
        print(json.dumps({'kind': 'linux-sandbox-prerequisite-refusal', 'errorClass': type(error).__name__,
                          'reason': str(error) if isinstance(error, RuntimeError) else None}), file=sys.stderr)
        raise SystemExit(1)
