import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')
    path.chmod(0o600)


def canonical_rules(config, errors):
    require(not errors and config.valid, 'Rule resolution is incomplete.')
    require(type(config.missed_rule_count) is int and config.missed_rule_count >= 0, 'Unavailable-rule metadata is invalid.')
    rules = [rule.raw for rule in config.get_rules(no_rewrite_rule_ids=False)]
    require(rules and all(isinstance(rule, dict) and isinstance(rule.get('id'), str) and rule['id'] for rule in rules), 'Available rules are empty or malformed.')
    require(len({rule['id'] for rule in rules}) == len(rules), 'Available rule identities are duplicated.')
    return {'rules': rules}


def verify_roundtrip(original, loaded, errors):
    require(not errors and loaded.valid and loaded.missed_rule_count == 0, 'Local rule bundle validation is incomplete.')
    actual = {'rules': [rule.raw for rule in loaded.get_rules(no_rewrite_rule_ids=True)]}
    require(actual == original, 'Local rule bundle changed original rule bodies, order or identities.')


def git(cwd, args):
    result = subprocess.run(['git', *args], cwd=cwd, capture_output=True, check=True)
    return result.stdout


def sources(cwd, output):
    values = sorted(set(value.decode() for value in git(cwd, ['ls-files', '-co', '--exclude-standard', '-z']).split(b'\0') if value))
    rows = []
    for name in values:
        path = cwd / name
        if path.resolve() == output.resolve():
            continue
        require(path.is_file() or path.is_symlink(), 'Source input type is unsupported.')
        data = os.readlink(path).encode() if path.is_symlink() else path.read_bytes()
        rows.append({'path': name, 'sha256': digest(data), 'bytes': len(data), 'symlink': path.is_symlink()})
    return rows


def resolve_bundle(configs, expected_version, destination):
    from semgrep import __VERSION__
    from semgrep.config_resolver import Config
    from semgrep.metrics import MetricsState
    from semgrep.state import get_state
    from semgrep.env import Env

    require(__VERSION__ == expected_version, 'Installed resolver version differs from the configured engine.')
    sdk = Env()
    root = destination.parent
    require(all(path.resolve().is_relative_to(root) for path in [sdk.user_data_folder, sdk.user_log_file, sdk.user_settings_file, sdk.version_check_cache_path, Path(tempfile.gettempdir())]), 'Resolver state escaped the owned directory.')
    state = get_state()
    state.metrics.metrics_state = MetricsState.OFF
    state.app_session.trust_env = False
    require(not state.telemetry.enabled, 'Resolver telemetry must be disabled.')
    require(state.app_session.token is None and state.settings.get('api_token') is None, 'Rule resolution must use the configured anonymous coverage.')
    config, errors = Config.from_config_list(configs, project_url=None)
    require(len(config.valid) == len(configs), 'A requested rule config is missing.')
    document = canonical_rules(config, errors)
    write_json(destination, document)
    loaded, errors = Config.from_config_list([str(destination)], project_url=None)
    verify_roundtrip(document, loaded, errors)
    return {'version': __VERSION__, 'configs': configs, 'availableRules': len(document['rules']), 'reportedUnavailableProRulesSummedAcrossConfigs': config.missed_rule_count, 'uniqueUnavailableProRuleCountUnknown': True, 'localRoundtripEqual': True}


def stop_owned(child):
    if child is None:
        return
    def alive():
        child.poll()
        try:
            os.killpg(child.pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
    if not alive():
        return
    for action in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(child.pid, action)
        except ProcessLookupError:
            return
        deadline = time.monotonic() + 2
        while alive() and time.monotonic() < deadline:
            time.sleep(0.05)
        if not alive():
            return
    raise RuntimeError('Owned scanner descendants remain active.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--expected-version', required=True)
    parser.add_argument('--config', action='append', required=True)
    parser.add_argument('--timeout', type=int, required=True)
    parser.add_argument('--jobs', type=int, required=True)
    parser.add_argument('--state-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    require(args.timeout > 0 and args.jobs > 0, 'Scanner resource configuration is invalid.')
    cwd = Path.cwd().resolve()
    state = args.state_dir.resolve()
    require(not state.is_relative_to(cwd), 'Scanner state must be outside the repository source scope.')
    require(not state.exists(), 'Scanner state directory must be fresh.')
    state.mkdir(parents=True, mode=0o700)
    os.umask(0o077)
    sys.dont_write_bytecode = True
    inherited = {name: os.environ[name] for name in ('PATH', 'SSL_CERT_FILE', 'LANG') if name in os.environ}
    os.environ.clear()
    os.environ.update(inherited)
    for name, value in {'HOME': state, 'XDG_CONFIG_HOME': state, 'XDG_CACHE_HOME': state, 'XDG_DATA_HOME': state, 'TMPDIR': state, 'SEMGREP_SETTINGS_FILE': state/'settings.yml', 'SEMGREP_LOG_FILE': state/'semgrep.log', 'SEMGREP_VERSION_CACHE_PATH': state/'version-cache', 'SEMGREP_SEND_METRICS': 'off', 'SEMGREP_ENABLE_VERSION_CHECK': '0', 'SEMGREP_OTEL_METRICS': '0', 'PYTHONDONTWRITEBYTECODE': '1'}.items():
        os.environ[name] = str(value)
    tempfile.tempdir = str(state)
    scanner = shutil.which('semgrep')
    require(scanner is not None, 'Installed scanner executable is missing.')
    output = args.output.resolve()
    require(not output.exists(), 'Scanner report must be a fresh output.')
    bundle = state/'rules.json'
    provenance = resolve_bundle(args.config, args.expected_version, bundle)
    head = git(cwd, ['rev-parse', 'HEAD']).decode().strip()
    tree = git(cwd, ['rev-parse', 'HEAD^{tree}']).decode().strip()
    before = sources(cwd, output)
    child = None
    def interrupted(_signum, _frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        with (state/'scanner.stdout.private').open('wb') as stdout, (state/'scanner.stderr.private').open('wb') as stderr:
            child = subprocess.Popen([scanner, 'scan', '--config', str(bundle), '--no-rewrite-rule-ids', '--metrics=off', f'--timeout={args.timeout}', f'--jobs={args.jobs}', '--time', '--json', '--output', str(output), '.'], cwd=cwd, stdout=stdout, stderr=stderr, start_new_session=True)
            deadline = time.monotonic() + 1800
            while child.poll() is None:
                require(time.monotonic() < deadline, 'Scanner execution deadline exceeded.')
                require(stdout.tell() + stderr.tell() <= 64*1024*1024, 'Scanner stream limit exceeded.')
                time.sleep(0.1)
            code = child.returncode
            require(stdout.tell() + stderr.tell() <= 64*1024*1024, 'Scanner stream limit exceeded.')
    finally:
        stop_owned(child)
    require(code in (0, 1), 'Scanner execution failed. This is a broken scanner, not a clean scan.')
    require(output.is_file() and not output.is_symlink() and output.stat().st_size <= 192*1024*1024, 'Scanner report is missing or oversized.')
    output.chmod(0o600)
    report = json.loads(output.read_bytes())
    require(isinstance(report, dict) and report.get('version') == args.expected_version and isinstance(report.get('results'), list), 'Scanner report version or results are invalid.')
    require(head == git(cwd, ['rev-parse', 'HEAD']).decode().strip() and tree == git(cwd, ['rev-parse', 'HEAD^{tree}']).decode().strip(), 'Source revision changed during the scan.')
    require(before == sources(cwd, output), 'Source bytes changed during the scan.')
    write_json(state/'source-context.json', {**provenance, 'head': head, 'tree': tree, 'sources': before, 'rulesSha256': digest(bundle.read_bytes()), 'reportSha256': digest(output.read_bytes()), 'actualScannerExit': code, 'sourceBeforeAfterEqual': True})
    print(f'Semgrep completed with {len(report["results"])} finding(s); the report and coverage gate determine acceptance.')


if __name__ == '__main__':
    try:
        main()
    except BaseException:
        sys.stderr.write('Semgrep execution or source/rule binding failed. This is a broken scanner, not a clean scan.\n')
        sys.exit(1)
