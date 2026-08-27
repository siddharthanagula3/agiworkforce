/**
 * MV3 evicts the service worker aggressively, and the extension's answer to
 * that has to be visible in the source: no unconditional periodic wake, a
 * terminal event for every run that dies with the worker, and a way for a
 * reopened panel to find a run that outlived it.
 *
 * These are source assertions because the pieces live in a 5,000-line worker
 * module that cannot be imported without a full Chrome surface. Each one names
 * the behaviour it protects rather than the line it matches.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const readSource = (rel: string): string => readFileSync(join(here, rel), 'utf8');

const background = readSource('../src/background.ts');
const panel = readSource('../src/features/side-panel/computerUsePanel.ts');
const content = readSource('../src/content.ts');

describe('the worker is only woken when there is work', () => {
  it('registers exactly one periodic alarm, and only from the arming helper', () => {
    const created = [...background.matchAll(/chrome\.alarms\.create\(([^,]+),/g)].map((match) =>
      match[1]!.trim(),
    );
    expect(created).toEqual(['MAINTENANCE_ALARM']);
    expect(background).not.toContain("chrome.alarms.create('keep-alive'");
    expect(background).toMatch(
      /function armMaintenanceAlarm\(\)[\s\S]*?chrome\.alarms\.create\(MAINTENANCE_ALARM/,
    );
  });

  it('disarms the maintenance alarm when a pass finds nothing outstanding', () => {
    expect(background).toMatch(
      /async function settleMaintenanceAlarm\(\)[\s\S]*?if \(await runMaintenancePass\(\)\) armMaintenanceAlarm\(\);\s*else disarmMaintenanceAlarm\(\);/,
    );
    expect(background).toContain('void chrome.alarms.clear(MAINTENANCE_ALARM)');
  });

  it('clears the alarms older builds registered, which Chrome would keep firing', () => {
    expect(background).toContain("const RETIRED_ALARM_NAMES = ['keep-alive', SYNC_SWEEP_ALARM]");
    expect(background).toMatch(
      /for \(const retired of RETIRED_ALARM_NAMES\) \{\s*void chrome\.alarms\.clear\(retired\);/,
    );
  });

  it('re-arms when work is queued that the worker may not live to finish', () => {
    const syncHandler = background.slice(
      background.indexOf("case 'SYNC_CONVERSATION'"),
      background.indexOf("case 'DELETE_CLOUD_CONVERSATION'"),
    );
    expect(syncHandler).toContain('armMaintenanceAlarm()');
  });
});

describe('a computer-use run that dies with the worker ends visibly', () => {
  it('has a panel-side inactivity watchdog that asks the background before giving up', () => {
    expect(panel).toContain('RUN_ACTIVITY_TIMEOUT_MS');
    expect(panel).toMatch(/runActivityTimer = setTimeout\(\s*\(\) => \{\s*void reconcileRunState/);
    expect(panel).toMatch(
      /async function reconcileRunState\(\)[\s\S]*?await readBackgroundRunState\(\)[\s\S]*?setRunState\(false, runId\);\s*showHandoffBanner\(RUN_LOST_MESSAGE/,
    );
    expect(panel).toMatch(
      /async function readBackgroundRunState\(\)[\s\S]*?type: 'GET_COMPUTER_USE_STATE'/,
    );
  });

  it('rearms that watchdog on every lifecycle event of an owned run', () => {
    const sidePanel = readSource('../src/side_panel.ts');
    for (const messageType of ['AGI_CU_STEP', 'AGI_CU_USAGE', 'AGI_CU_ESCALATE']) {
      const handler = sidePanel.slice(
        sidePanel.indexOf(`m['type'] === '${messageType}'`),
        sidePanel.indexOf(`m['type'] === '${messageType}'`) + 200,
      );
      expect(handler, `${messageType} does not note run activity`).toContain(
        'cuPanel.noteRunActivity()',
      );
    }
  });

  it('answers a state query so a reopened panel can adopt a live run', () => {
    expect(background).toMatch(
      /case 'GET_COMPUTER_USE_STATE'[\s\S]*computerUseRuns\.getActive\(\)[\s\S]*running: true[\s\S]*runId: activeLease\.runId/,
    );
    expect(panel).toContain('void adoptBackgroundRun();');
  });

  it("treats Chrome's own debugger Cancel as a stop, not a hiccup", () => {
    expect(background).toMatch(
      /onDebuggerDetachedByUser: \(\) => \{[\s\S]*cancelActiveComputerUseRun\('debugger_detached', lease\.runId\)/,
    );
  });
});

describe('a page load does not wake the worker on a site the user never approved', () => {
  it('gates both startup calls behind the approved-origin read', () => {
    expect(content).toMatch(
      /void originApproved\.then\(\(approved\) => \{\s*if \(!approved\) return;\s*void checkConnectionStatus\(\);\s*void notifyTabReady\(\);/,
    );
  });

  it('injects no UI of its own into an arbitrary page', () => {
    expect(content).not.toContain('data-agi-workforce-indicator');
    expect(content).not.toContain('addAutomationIndicator');
  });

  it('decides an approved origin once per document rather than per call', () => {
    expect(content).toContain('const originApproved: Promise<boolean>');
    expect(content.match(/originApproved/g)?.length).toBeGreaterThan(1);
  });
});
