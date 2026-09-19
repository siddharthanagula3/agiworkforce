import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor

SCRIPT = Path(__file__).with_name('launch.py')
spec = importlib.util.spec_from_file_location('launch', SCRIPT)
launch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launch)


class LaunchHookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        for name in [launch.GOAL, launch.CONTINUE, launch.PROGRESS, '.codex/hooks.json', 'source.ts', 'proof.txt']:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('fixture content\n')
        (self.root / '.codex/hooks').mkdir()
        shutil.copy(SCRIPT, self.root / '.codex/hooks/launch.py')
        self.data = {'localScope': ['one', 'two'], 'cases': [
            {'id': 'one', 'status': 'pending', 'boundary': 'local', 'actionable': True, 'dependencies': ['source.ts']},
            {'id': 'two', 'status': 'blocked', 'boundary': 'local', 'actionable': False, 'dependency': 'login'}]}
        self.save()
        self.now = time.time()
        self.state = dict(version=1, sessionId='coordinator', worktree=str(self.root), enabled=True,
                          status='ACTIVE', deadline=self.now + 14400, continuations=0, noProgress=0,
                          limits={'continuations': 20, 'hours': 4}, scope=['one', 'two'], events=[],
                          configuration=launch.config_fingerprint(self.root), nextTask='one')
        self.event = dict(session_id='coordinator', cwd=str(self.root), hook_event_name='Stop',
                          turn_id='turn-1', stop_hook_active=False, last_assistant_message='checkpoint')

    def save(self):
        (self.root / launch.LEDGER).write_text(json.dumps(self.data))

    def stop(self, **extra):
        return launch.evaluate(self.root, self.state, {**self.event, **extra}, self.now)

    def test_active_requests_small_continuation(self):
        result = self.stop()
        self.assertEqual(result['decision'], 'block')
        self.assertLess(len(result['reason']), 3000)
        self.assertEqual(self.state['continuations'], 1)

    def test_unrelated_session_worktree_worker_and_inactive_do_not_continue(self):
        for extra in [dict(session_id='other'), dict(cwd='/tmp'), dict(agent_id='worker'), dict(hook_event_name='SubagentStop')]:
            self.assertEqual(self.stop(**extra), {})
        self.state['enabled'] = False
        self.assertEqual(self.stop(), {})

    def test_interrupt_and_new_user_prompt_preserve_control(self):
        self.stop(hook_event_name='Interrupt')
        self.assertEqual(self.state['status'], 'PAUSED_BY_USER')
        self.assertEqual(self.stop(), {})
        self.state['status'] = 'ACTIVE'
        self.stop(hook_event_name='UserPromptSubmit', prompt='Cancel this and work on something else')
        self.assertEqual(self.state['status'], 'WAITING_FOR_USER')
        self.assertEqual(self.stop(), {})

    def test_own_continuation_is_observed_without_resuming_paused_run(self):
        prompt = self.stop()['reason']
        self.state['status'] = 'PAUSED_BY_USER'
        self.stop(hook_event_name='UserPromptSubmit', prompt=prompt)
        self.assertIn('runtimeContinuationObservedAt', self.state)
        self.assertEqual(self.state['status'], 'PAUSED_BY_USER')

    def test_login_wait_and_expiry_never_repeat_login(self):
        self.state.update(status='WAITING_FOR_USER', waitUntil=self.now + 60)
        self.assertEqual(self.stop(), {})
        self.state['waitUntil'] = self.now - 1
        self.assertNotIn('decision', self.stop())
        self.assertEqual(self.state['status'], 'CHECKPOINT_REQUIRED')

    def test_one_blocked_task_does_not_hide_independent_work(self):
        self.state.update(status='BLOCKED', nextTask='two')
        self.assertEqual(self.stop()['decision'], 'block')
        self.assertEqual(self.state['nextTask'], 'one')

    def test_all_blocked_is_not_completion(self):
        self.data['cases'][0].update(status='blocked', actionable=False)
        self.save()
        self.stop()
        self.assertEqual(self.state['status'], 'BLOCKED')

    def test_verified_scope_requires_all_current_evidence_and_audit(self):
        for case in self.data['cases']:
            case.update(status='passed', verification={'assertions': ['observed behavior'],
                        'artifacts': {'proof.txt': launch.digest(self.root / 'proof.txt')},
                        'dependencies': {'source.ts': launch.digest(self.root / 'source.ts')}})
        self.data['completionAudit'] = {'caseIds': ['one', 'two'], 'artifacts': {'proof.txt': launch.digest(self.root / 'proof.txt')}}
        self.save()
        self.state['status'] = 'LOCAL_SCOPE_VERIFIED'
        self.assertEqual(self.stop(), {})
        (self.root / 'source.ts').write_text('changed implementation')
        self.assertNotIn('decision', self.stop())
        self.assertEqual(self.state['status'], 'CHECKPOINT_REQUIRED')

    def test_done_flag_or_missing_proof_cannot_complete(self):
        self.state.update(status='LOCAL_SCOPE_VERIFIED', done=True)
        self.stop()
        self.assertEqual(self.state['status'], 'CHECKPOINT_REQUIRED')

    def test_no_progress_replans_then_checkpoints(self):
        self.stop()
        for index in [2, 3]:
            (self.root / launch.PROGRESS).write_text('timestamp/reworded ' + str(index))
            result = self.stop(turn_id=str(index), stop_hook_active=True)
        self.assertIn('REPLAN NOW', result['reason'])
        self.assertNotIn('decision', self.stop(turn_id='4', stop_hook_active=True))
        self.assertEqual(self.state['status'], 'CHECKPOINT_REQUIRED')

    def test_implementation_progress_resets_stall_count_not_budget(self):
        self.stop()
        self.stop(turn_id='2', stop_hook_active=True)
        (self.root / 'source.ts').write_text('new correction')
        self.stop(turn_id='3', stop_hook_active=True)
        self.assertEqual(self.state['noProgress'], 0)
        self.assertEqual(self.state['continuations'], 3)

    def test_finite_limits(self):
        for change in [dict(continuations=20), dict(deadline=self.now - 1)]:
            state = copy.deepcopy(self.state)
            self.state.update(change)
            self.assertNotIn('decision', self.stop())
            self.assertEqual(self.state['status'], 'CHECKPOINT_REQUIRED')
            self.state = state

    def test_valid_pass_is_not_requeued_and_only_changed_dependencies_invalidate(self):
        self.data['cases'][0].update(status='passed', verification={'assertions': ['pass'],
            'artifacts': {'proof.txt': launch.digest(self.root / 'proof.txt')},
            'dependencies': {'source.ts': launch.digest(self.root / 'source.ts')}})
        self.data['cases'][1].update(status='pending', actionable=True)
        self.save()
        self.stop()
        self.assertEqual(self.state['nextTask'], 'two')
        (self.root / 'source.ts').write_text('changed')
        self.stop(turn_id='2', stop_hook_active=True)
        self.assertEqual(self.state['invalidatedEvidence'], ['one'])

    def test_scope_or_configuration_drift_checkpoints(self):
        self.data['localScope'].pop()
        self.save()
        self.stop()
        self.assertEqual(self.state['status'], 'CHECKPOINT_REQUIRED')

    def run_hook(self, event=None):
        return subprocess.run(['/usr/bin/python3', str(self.root / '.codex/hooks/launch.py'),
                               'hook', '--session', 'coordinator'],
                              input=json.dumps(event or self.event), text=True, capture_output=True, check=True)

    def state_path(self):
        path = self.root / '.codex/launch-runs/coordinator.json'
        path.parent.mkdir(exist_ok=True)
        return path

    def test_missing_and_malformed_state_have_diagnostics(self):
        self.assertIn('no bound run state', self.run_hook().stdout)
        self.state_path().write_text('{bad')
        self.assertIn('HOOK_ERROR', self.run_hook().stdout)
        self.assertNotIn('"decision": "block"', self.run_hook().stdout)

    def test_malformed_ledger_has_diagnostic_and_persists_hook_error(self):
        self.state_path().write_text(json.dumps(self.state))
        (self.root / launch.LEDGER).write_text('{}')
        self.assertIn('HOOK_ERROR', self.run_hook().stdout)
        self.assertEqual(json.loads(self.state_path().read_text())['status'], 'HOOK_ERROR')

    def test_disabled_run_cannot_claim_completion(self):
        self.state['enabled'] = False
        self.state_path().write_text(json.dumps(self.state))
        result = subprocess.run(['/usr/bin/python3', str(self.root / '.codex/hooks/launch.py'),
                                 'verify-scope', '--session', 'coordinator'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('disabled runs cannot declare completion', result.stdout)

    def test_resume_cannot_reset_expired_run(self):
        self.state.update(deadline=self.now - 1, continuations=7)
        self.state_path().write_text(json.dumps(self.state))
        result = subprocess.run(['/usr/bin/python3', str(self.root / '.codex/hooks/launch.py'),
                                 'resume', '--session', 'coordinator', '--reason', 'owner resumed'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(self.state_path().read_text())['continuations'], 7)

    def test_concurrent_repeated_events_issue_one_continuation(self):
        self.state_path().write_text(json.dumps(self.state))
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.run_hook().stdout, range(8)))
        self.assertEqual(sum('"decision": "block"' in result for result in results), 1)
        self.assertEqual(json.loads(self.state_path().read_text())['continuations'], 1)


if __name__ == '__main__':
    unittest.main()
