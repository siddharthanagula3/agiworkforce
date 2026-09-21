import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRODUCTION_DEPENDENCIES } from '@/lib/config/dependency-readiness';
import {
  ALL_KILL_SWITCH_CAPABILITIES,
  TENANT_LOCKDOWN_FLAG_KEY,
  capabilityKillSwitchKey,
} from '@/lib/feature-flags/kill-switches';
import {
  ESCALATION_LEVELS,
  ONCALL_ROTATION_ENV,
  levelForElapsedMinutes,
  resolveOnCallRotation,
  responderAt,
  respondersForLevel,
} from '@/lib/server/incident/on-call';
import { SLO_CATALOGUE } from '@/lib/server/slo/catalogue';
import { SERVICE_DASHBOARDS } from '../dashboards';
import { OPERATIONAL_DOMAINS, criticalDomains, findOperationalDomain } from '../ownership';

const repoRoot = resolve(import.meta.dirname, '../../../../..');

const dashboardIds = new Set(SERVICE_DASHBOARDS.map((dashboard) => dashboard.id));
const dependencyIds = new Set(PRODUCTION_DEPENDENCIES.map((dependency) => dependency.id));
const killSwitchKeys = new Set([
  TENANT_LOCKDOWN_FLAG_KEY,
  ...ALL_KILL_SWITCH_CAPABILITIES.map(capabilityKillSwitchKey),
]);

/** The rules CODEOWNERS states explicitly; the catch-all is not an owner. */
function explicitCodeownersPaths(): Set<string> {
  const source = readFileSync(join(repoRoot, '.github/CODEOWNERS'), 'utf8');
  const paths = new Set<string>();
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const [pattern, ...owners] = trimmed.split(/\s+/u);
    if (!pattern || pattern === '*' || owners.length === 0) continue;
    paths.add(pattern.replace(/^\/+/u, '').replace(/\/+$/u, ''));
  }
  return paths;
}

describe('every measured domain has an operational owner', () => {
  it('covers the service-level catalogue exactly, with nothing invented', () => {
    const sloIds = SLO_CATALOGUE.map((slo) => slo.id);
    const owned = OPERATIONAL_DOMAINS.map((domain) => domain.sloId);

    expect(sloIds.filter((id) => !owned.includes(id))).toEqual([]);
    expect(owned.filter((id) => !sloIds.includes(id))).toEqual([]);
    expect(new Set(owned).size).toBe(owned.length);
  });

  it('names a dashboard the dashboard catalogue defines', () => {
    for (const domain of OPERATIONAL_DOMAINS) {
      expect(dashboardIds.has(domain.dashboardId), `${domain.sloId} -> ${domain.dashboardId}`).toBe(
        true,
      );
    }
  });

  it('names a runbook that is on disk and says something', () => {
    for (const domain of OPERATIONAL_DOMAINS) {
      const path = join(repoRoot, domain.runbook);
      expect(existsSync(path), `${domain.sloId} -> ${domain.runbook}`).toBe(true);
      expect(readFileSync(path, 'utf8').trim().length, domain.runbook).toBeGreaterThan(500);
    }
  });

  it('names dependencies the production dependency registry declares', () => {
    for (const domain of OPERATIONAL_DOMAINS) {
      expect(domain.dependencies.length, `${domain.sloId} declares no dependency`).toBeGreaterThan(
        0,
      );
      for (const dependency of domain.dependencies) {
        expect(dependencyIds.has(dependency), `${domain.sloId} -> ${dependency}`).toBe(true);
      }
    }
  });

  it('gives every dependency an owner of its own', () => {
    for (const dependency of PRODUCTION_DEPENDENCIES) {
      const owned = dependency.owner === null || dependency.owner.trim().length > 0;
      expect(owned, `${dependency.id} has a blank owner`).toBe(true);
      expect(dependency.criticality, dependency.id).toMatch(/^(core|degradable|optional)$/u);
    }
  });

  it('routes every domain to a path CODEOWNERS names explicitly', () => {
    const explicit = explicitCodeownersPaths();
    for (const domain of OPERATIONAL_DOMAINS) {
      const covered = [...explicit].some(
        (path) => domain.codeownersPath === path || domain.codeownersPath.startsWith(`${path}/`),
      );
      expect(covered, `${domain.sloId} -> ${domain.codeownersPath}`).toBe(true);
    }
  });

  it('points every runtime owner at a directory that exists', () => {
    for (const domain of OPERATIONAL_DOMAINS) {
      expect(existsSync(join(repoRoot, domain.runtimePath)), domain.runtimePath).toBe(true);
    }
  });

  it('gives every critical domain a kill switch the flag store mints', () => {
    expect(criticalDomains().length).toBeGreaterThan(0);
    for (const domain of criticalDomains()) {
      expect(domain.killSwitch, `${domain.sloId} is critical with no kill switch`).not.toBeNull();
      expect(killSwitchKeys.has(domain.killSwitch as string), `${domain.sloId}`).toBe(true);
    }
  });

  it('declares a kill switch the flag store knows even when it is not critical', () => {
    for (const domain of OPERATIONAL_DOMAINS) {
      if (domain.killSwitch === null) continue;
      expect(killSwitchKeys.has(domain.killSwitch), `${domain.sloId} -> ${domain.killSwitch}`).toBe(
        true,
      );
    }
  });
});

describe('alerting covers what ownership promises', () => {
  it('gives every domain an objective the burn-rate evaluation can read', () => {
    for (const domain of OPERATIONAL_DOMAINS) {
      const slo = SLO_CATALOGUE.find((entry) => entry.id === domain.sloId);
      expect(slo, domain.sloId).toBeDefined();
      const measured = slo?.source !== null;
      const explained = (slo?.missingInstrument ?? '').trim().length > 0;
      expect(measured || explained, `${domain.sloId} is neither measured nor explained`).toBe(true);
    }
  });

  it('pages from the catalogue rather than a second list of domains', () => {
    const cron = readFileSync(
      join(repoRoot, 'apps/web/app/api/cron/evaluate-slo-burn/route.ts'),
      'utf8',
    );
    expect(cron).toContain('evaluateBurnRates');
    expect(cron).toContain('notifyIncident');
    for (const domain of OPERATIONAL_DOMAINS) {
      expect(cron, `${domain.sloId} is hard-coded into the pager`).not.toContain(
        `'${domain.sloId}'`,
      );
    }
  });

  it('escalates a critical domain to a named responder rather than a mailbox', () => {
    const rotation = resolveOnCallRotation({
      [ONCALL_ROTATION_ENV]: 'primary:first@example.com,secondary:second@example.com',
    });
    expect(rotation.responders.length).toBeGreaterThan(1);
    expect(responderAt(new Date(rotation.startedAtMs), rotation)).not.toBeNull();
    expect(
      respondersForLevel(ESCALATION_LEVELS.secondary, new Date(rotation.startedAtMs), rotation)
        .length,
    ).toBeGreaterThan(0);
    expect(levelForElapsedMinutes(rotation.escalateAfterMinutes * 2, rotation)).toBeGreaterThan(
      ESCALATION_LEVELS.primary,
    );
  });

  it('is looked up by objective id', () => {
    expect(findOperationalDomain('chat')?.tier).toBe('critical');
    expect(findOperationalDomain('not-a-domain')).toBeNull();
  });
});
