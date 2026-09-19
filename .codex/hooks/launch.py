#!/usr/bin/env python3
"""Finite, coordinator-scoped launch continuation; no model or network calls."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
LEDGER = 'docs/specs/website-launch/QA_COVERAGE.json'
GOAL = 'docs/specs/website-launch/AGENT_GOAL.md'
CONTINUE = 'docs/specs/website-launch/CONTINUE_GOAL.md'
PROGRESS = 'docs/specs/website-launch/PROGRESS.md'
STATES = {'ACTIVE', 'WAITING_FOR_USER', 'BLOCKED', 'CHECKPOINT_REQUIRED',
          'PAUSED_BY_USER', 'LOCAL_SCOPE_VERIFIED', 'HOOK_ERROR'}
MAX_BYTES = 2_000_000


def read_json(path):
    raw = path.read_bytes()
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError('missing/oversized JSON: ' + str(path))
    return json.loads(raw)


def digest(path):
    data = path.read_bytes()
    if not data or len(data) > MAX_BYTES:
        raise ValueError('missing/oversized evidence: ' + str(path))
    return hashlib.sha256(data).hexdigest()


def local(root, name):
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError('reference outside worktree')
    return path


def atomic(path, state):
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.write-')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(state, f, indent=2)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


@contextlib.contextmanager
def locked(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def config_fingerprint(root):
    return {p: digest(local(root, p)) for p in
            [GOAL, CONTINUE, '.codex/hooks.json', '.codex/hooks/launch.py']}


def coverage(root):
    data = read_json(local(root, LEDGER))
    cases = data.get('cases')
    scope = data.get('localScope')
    if not isinstance(cases, list) or not cases or not isinstance(scope, list) or not scope:
        raise ValueError('coverage must include nonempty cases and localScope')
    indexed = {c['id']: c for c in cases}
    if len(indexed) != len(cases) or len(set(scope)) != len(scope):
        raise ValueError('duplicate case or scope IDs')
    if any(case_id not in indexed for case_id in scope):
        raise ValueError('scope references missing case')
    if any(indexed[i].get('status') not in {'pending', 'failed', 'passed', 'blocked'} for i in scope):
        raise ValueError('invalid case status')
    return data, indexed


def evidence_current(root, case):
    proof = case.get('verification', {})
    artifacts, dependencies = proof.get('artifacts', {}), proof.get('dependencies', {})
    if not artifacts or not dependencies or not proof.get('assertions'):
        return False
    return all(digest(local(root, p)) == h for p, h in {**artifacts, **dependencies}.items())


def completion_current(root, data, cases, state):
    if data['localScope'] != state['scope'] or config_fingerprint(root) != state['configuration']:
        return False
    if not all(cases[i]['status'] == 'passed' and evidence_current(root, cases[i]) for i in state['scope']):
        return False
    audit = data.get('completionAudit', {})
    return (audit.get('caseIds') == state['scope'] and bool(audit.get('artifacts'))
            and all(digest(local(root, p)) == h for p, h in audit['artifacts'].items()))


def evidence_view(root, data, cases):
    sources, proofs, invalid = {}, {}, []
    for case_id in data['localScope']:
        c = cases[case_id]
        paths = c.get('dependencies', [])
        if len(paths) > 64:
            raise ValueError('too many dependencies')
        for name in paths:
            sources[name] = digest(local(root, name))
        proof = c.get('verification', {})
        for name, expected in proof.get('dependencies', {}).items():
            current = digest(local(root, name))
            sources[name] = current
            if c['status'] == 'passed' and current != expected:
                invalid.append(case_id)
        for name, expected in proof.get('artifacts', {}).items():
            if digest(local(root, name)) != expected:
                invalid.append(case_id)
            else:
                proofs[case_id + ':' + name] = expected
    value = json.dumps({'sources': sources, 'proofs': proofs}, sort_keys=True)
    return hashlib.sha256(value.encode()).hexdigest(), sorted(set(invalid)), sources


def diagnostic(state, mode, reason):
    state.update(status=mode, reason=reason)
    return {'systemMessage': 'Launch continuation: ' + mode + ': ' + reason}


def evaluate(root, state, event, now=None):
    now = time.time() if now is None else now
    if event.get('session_id') != state['sessionId'] or event.get('agent_id'):
        return {}
    if Path(event.get('cwd', '/')).resolve() != Path(state['worktree']):
        return {}
    name = event.get('hook_event_name')
    if name not in {'Stop', 'Interrupt', 'UserPromptSubmit'}:
        return {}
    if name == 'Interrupt':
        return diagnostic(state, 'PAUSED_BY_USER', 'Runtime interruption; explicit resume required.')
    if name == 'UserPromptSubmit':
        prompt = event.get('prompt', '')
        if hashlib.sha256(prompt.encode()).hexdigest() == state.get('issuedPromptHash'):
            state['runtimeContinuationObservedAt'] = now
            return {}
        if state['enabled'] and state['status'] == 'ACTIVE':
            return diagnostic(state, 'WAITING_FOR_USER',
                              'New user instruction: coordinator must honor it before explicitly resuming.')
        return {}
    state['runtimeStopObservedAt'] = now
    if not state['enabled'] or state['status'] in {'PAUSED_BY_USER', 'HOOK_ERROR', 'CHECKPOINT_REQUIRED'}:
        return {}
    if now >= state['deadline'] or state['continuations'] >= state['limits']['continuations']:
        return diagnostic(state, 'CHECKPOINT_REQUIRED', 'Run limit reached; counters/deadline cannot be reset by resume.')
    if state['status'] == 'WAITING_FOR_USER':
        if state.get('waitUntil') and now >= state['waitUntil']:
            return diagnostic(state, 'CHECKPOINT_REQUIRED', 'Login handoff expired; await owner confirmation, do not retry login.')
        return {}
    if config_fingerprint(root) != state['configuration']:
        return diagnostic(state, 'CHECKPOINT_REQUIRED', 'Goal or hook configuration changed; review binding before continuing.')
    data, cases = coverage(root)
    if data['localScope'] != state['scope']:
        return diagnostic(state, 'CHECKPOINT_REQUIRED', 'Local scope accounting changed; do not silently shrink the goal.')
    signature, invalid, sources = evidence_view(root, data, cases)
    state.update(sourceFingerprint=sources, invalidatedEvidence=invalid,
                 evidenceRefs=[LEDGER, PROGRESS])
    actionable = [i for i in state['scope'] if
                  (cases[i]['status'] in {'pending', 'failed'} or i in invalid)
                  and cases[i].get('actionable') is True and cases[i].get('boundary') == 'local']
    if state['status'] == 'LOCAL_SCOPE_VERIFIED':
        if completion_current(root, data, cases, state):
            return {}
        return diagnostic(state, 'CHECKPOINT_REQUIRED', 'Completion evidence is missing, changed or incomplete; no completion claim.')
    if not actionable:
        if all(cases[i]['status'] == 'blocked' or cases[i]['status'] == 'passed' for i in state['scope']):
            return diagnostic(state, 'BLOCKED', 'No authorized actionable local case remains; inspect recorded prerequisites. Not launch completion.')
        return diagnostic(state, 'CHECKPOINT_REQUIRED', 'No actionable selection; reconcile incomplete scope and prerequisites.')
    state['status'] = 'ACTIVE'
    key = hashlib.sha256(json.dumps([event.get('turn_id'), event.get('stop_hook_active'),
                                    event.get('last_assistant_message')], sort_keys=True).encode()).hexdigest()
    if not event.get('turn_id') or not isinstance(event.get('stop_hook_active'), bool):
        return diagnostic(state, 'HOOK_ERROR', 'Stop event lacks documented turn identity or repeated-stop indicator.')
    if key in state['events']:
        return {}
    if state.get('lastSignature') == signature:
        state['noProgress'] += 1
    else:
        state['noProgress'] = 0
    state['lastSignature'] = signature
    if state['noProgress'] > 2:
        return diagnostic(state, 'CHECKPOINT_REQUIRED', 'Replanning produced no substantive change; checkpoint instead of looping.')
    next_id = state.get('nextTask') if state.get('nextTask') in actionable else actionable[0]
    state['nextTask'] = next_id
    prefix = 'AGI launch continuation for the bound coordinator only.\n'
    reason = prefix + local(root, CONTINUE).read_text().strip() + '\nNext case: ' + next_id
    if invalid:
        reason += '\nRecheck only affected evidence: ' + ', '.join(invalid)
    if state['noProgress'] == 2:
        reason += '\nREPLAN NOW: two continuations without substantive progress. Change hypothesis or choose another actionable case; do not rerun the unchanged failure.'
    if len(reason) > 2900:
        raise ValueError('continuation message exceeds 2900 characters')
    state['continuations'] += 1
    state['events'] = (state['events'] + [key])[-80:]
    state['issuedPromptHash'] = hashlib.sha256(reason.encode()).hexdigest()
    state['lastStopWasRepeated'] = event['stop_hook_active']
    return {'decision': 'block', 'reason': reason}


def validate_state(state):
    if state.get('version') != 1 or state.get('status') not in STATES:
        raise ValueError('invalid run state')
    for field in ['sessionId', 'worktree', 'scope', 'configuration', 'limits', 'events', 'enabled', 'deadline', 'continuations', 'noProgress']:
        if field not in state:
            raise ValueError('state missing ' + field)
    if not isinstance(state['continuations'], int) or state['continuations'] < 0:
        raise ValueError('invalid continuation count')
    if not isinstance(state['enabled'], bool) or not math.isfinite(state['deadline']):
        raise ValueError('invalid activation or deadline')
    if not 1 <= state['limits']['continuations'] <= 20 or not 0 < state['limits']['hours'] <= 4:
        raise ValueError('limits exceed authorization')
    if not isinstance(state['noProgress'], int) or state['noProgress'] < 0:
        raise ValueError('invalid progress count')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['hook', 'enable', 'status', 'pause', 'resume', 'disable', 'wait', 'checkpoint', 'verify-scope', 'observed'])
    parser.add_argument('--session', default=os.environ.get('CODEX_SESSION_ID'))
    parser.add_argument('--reason', default='')
    parser.add_argument('--next')
    parser.add_argument('--max-continuations', type=int, default=20)
    parser.add_argument('--hours', type=float, default=4)
    args = parser.parse_args()
    event = read_json_stdin() if args.command == 'hook' else None
    if event and event.get('session_id') != args.session:
        print('{}')
        return
    session = event.get('session_id') if event else args.session
    if not isinstance(session, str) or not session or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in session):
        raise ValueError('valid session identifier required')
    path = ROOT / '.codex/launch-runs' / (session + '.json')
    if args.command == 'hook' and not path.exists():
        print(json.dumps({'systemMessage': 'Launch hook inactive: no bound run state for this session.'}))
        return
    with locked(path):
        if args.command == 'enable':
            if path.exists():
                raise ValueError('run already exists; resume never resets limits')
            if not 1 <= args.max_continuations <= 20 or not 0 < args.hours <= 4:
                raise ValueError('limits must stay within the owner-authorized20 continuations/four hours')
            data, cases = coverage(ROOT)
            now = time.time()
            state = dict(version=1, sessionId=session, worktree=str(ROOT), enabled=True,
                         status='ACTIVE', startedAt=now, deadline=now + args.hours * 3600,
                         limits={'continuations': args.max_continuations, 'hours': args.hours}, continuations=0,
                         noProgress=0, events=[], scope=data['localScope'],
                         configuration=config_fingerprint(ROOT), nextTask=args.next,
                         evidenceRefs=[LEDGER, PROGRESS], reason='Explicit owner-authorized launch run',
                         runtimeActivation='unverified; trust review remains user-owned')
        else:
            state = read_json(path)
            validate_state(state)
        if args.command == 'hook':
            try:
                result = evaluate(ROOT, state, event)
            except Exception as exc:
                result = diagnostic(state, 'HOOK_ERROR', str(exc))
            atomic(path, state)
            print(json.dumps(result))
            return
        if args.command in {'pause', 'disable', 'wait', 'checkpoint'}:
            if not args.reason:
                raise ValueError('reason required')
            state['status'] = {'pause': 'PAUSED_BY_USER', 'disable': 'PAUSED_BY_USER',
                               'wait': 'WAITING_FOR_USER', 'checkpoint': 'CHECKPOINT_REQUIRED'}[args.command]
            state['reason'] = args.reason
            if args.command == 'disable':
                state['enabled'] = False
            if args.command == 'wait':
                state['waitUntil'] = time.time() + 60
        if args.command == 'resume':
            if not args.reason:
                raise ValueError('explicit user authorization/steering reference required')
            if time.time() >= state['deadline'] or state['continuations'] >= state['limits']['continuations']:
                raise ValueError('run exhausted; explicit owner authorization for new limits required')
            if config_fingerprint(ROOT) != state['configuration']:
                raise ValueError('configuration changed; cannot resume the old binding')
            state.update(status='ACTIVE', enabled=True, reason=args.reason)
        if args.command == 'verify-scope':
            if not state['enabled']:
                raise ValueError('disabled runs cannot declare completion')
            data, cases = coverage(ROOT)
            if not completion_current(ROOT, data, cases, state):
                raise ValueError('complete current scope and functional evidence references required')
            state['status'] = 'LOCAL_SCOPE_VERIFIED'
        if args.command == 'observed':
            if not state.get('runtimeContinuationObservedAt'):
                raise ValueError('no runtime UserPromptSubmit matched the issued continuation')
            state['runtimeActivation'] = 'verified by Stop and matching continuation UserPromptSubmit'
        if args.next:
            _, cases = coverage(ROOT)
            if args.next not in state['scope'] or args.next not in cases:
                raise ValueError('next task must reference bound local scope')
            state['nextTask'] = args.next
        atomic(path, state)
        print(json.dumps(state, indent=2))


def read_json_stdin():
    raw = sys.stdin.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('oversized hook event')
    return json.loads(raw)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'systemMessage': 'Launch continuation HOOK_ERROR: ' + str(error)}))
        sys.exit(0 if 'hook' in sys.argv[1:2] else 1)
