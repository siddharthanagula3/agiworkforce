'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from '@agiworkforce/icons';
import { Spinner, useConfirmAction } from '@agiworkforce/ui';
import { codeSessionPath } from '@/features/code/code-surface';
import { toUserMessage } from '@/lib/user-error-message';

import type {
  SecurityScanCompletedReport,
  SecurityScanDecision,
  SecurityScanDeliveryResult,
  SecurityScanFinding,
  SecurityScanStateResponse,
} from '@agiworkforce/cloud-contracts';
import {
  SECURITY_SCAN_SCOPE_MAX_LENGTH,
  SECURITY_SCAN_STATUS,
} from '@agiworkforce/cloud-contracts';
import {
  SECURITY_SCAN_COPY,
  SEVERITY_LABEL,
  approveDescription,
  coverageSummary,
  droppedSummary,
  findingsSummary,
} from '../copy';
import { securityScanApi, type SecurityScanApi } from '../services/security-scan-api';
import styles from './SecurityScanPage.module.css';

const GLYPH_SIZE = 16;
const SHORT_COMMIT_LENGTH = 7;
const RUNNING_POLL_MS = 15_000;

export interface SecurityScanPageProps {
  sessionId: string;
  api?: SecurityScanApi;
}

const PATCH_META_RE = /^(diff |--- |\+\+\+ |@@)/;

function patchLineKind(line: string): 'meta' | 'added' | 'removed' | 'context' {
  if (PATCH_META_RE.test(line)) return 'meta';
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

function PatchView({ patch }: { patch: string }) {
  return (
    <pre className={styles['patch']}>
      {patch
        .replace(/\n$/, '')
        .split('\n')
        .map((line, index) => (
          <span
            key={`${index}:${line}`}
            className={`${styles['patchLine']} ${styles[patchLineKind(line)]}`}
          >
            {line}
          </span>
        ))}
    </pre>
  );
}

interface FindingCardProps {
  finding: SecurityScanFinding;
  busy: boolean;
  delivery: SecurityScanDeliveryResult | null;
  pullRequestUrl: string | null;
  onDecide: (finding: SecurityScanFinding, decision: SecurityScanDecision) => void;
}

function FindingCard({ finding, busy, delivery, pullRequestUrl, onDecide }: FindingCardProps) {
  const [expanded, setExpanded] = useState(finding.state === 'open');
  const regionId = useId();
  const linkedPullRequest = delivery?.pullRequestUrl ?? pullRequestUrl;

  return (
    <li className={styles['finding']}>
      <button
        type="button"
        className={styles['findingHeader']}
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? (
          <ChevronDown size={GLYPH_SIZE} aria-hidden="true" />
        ) : (
          <ChevronRight size={GLYPH_SIZE} aria-hidden="true" />
        )}
        <span className={`${styles['severity']} ${styles[`severity-${finding.severity}`]}`}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <span className={styles['findingTitle']}>{finding.title}</span>
        {finding.state !== 'open' && (
          <span className={styles['stateChip']}>
            {finding.state === 'approved'
              ? SECURITY_SCAN_COPY.approved
              : SECURITY_SCAN_COPY.dismissed}
          </span>
        )}
      </button>
      <p className={styles['location']}>
        <code>
          {finding.path}:{finding.line}
        </code>
        <span>{finding.category}</span>
      </p>
      {expanded && (
        <div id={regionId} className={styles['findingBody']}>
          <section>
            <h3 className={styles['label']}>{SECURITY_SCAN_COPY.explanation}</h3>
            <p className={styles['prose']}>{finding.explanation}</p>
          </section>
          <section>
            <h3 className={styles['label']}>{SECURITY_SCAN_COPY.evidence}</h3>
            <pre className={styles['code']}>{finding.evidence}</pre>
          </section>
          <section>
            <h3 className={styles['label']}>{SECURITY_SCAN_COPY.verification}</h3>
            <p className={styles['prose']}>{finding.verification}</p>
          </section>
          <section>
            <h3 className={styles['label']}>{SECURITY_SCAN_COPY.patch}</h3>
            <PatchView patch={finding.patch} />
          </section>
          {finding.state === 'open' ? (
            <div className={styles['actions']}>
              <button
                type="button"
                className={styles['primaryButton']}
                disabled={busy}
                onClick={() => onDecide(finding, 'approve')}
              >
                {SECURITY_SCAN_COPY.approve}
              </button>
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={busy}
                onClick={() => onDecide(finding, 'dismiss')}
              >
                {SECURITY_SCAN_COPY.dismiss}
              </button>
              {busy && <Spinner size="sm" />}
            </div>
          ) : finding.state === 'approved' ? (
            <div className={styles['actions']}>
              {delivery?.error && (
                <p className={styles['help']} role="alert">
                  {delivery.error}
                </p>
              )}
              {linkedPullRequest && (
                <a
                  className={styles['secondaryButton']}
                  href={linkedPullRequest}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={GLYPH_SIZE} aria-hidden="true" />
                  <span>{SECURITY_SCAN_COPY.pullRequest}</span>
                </a>
              )}
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}

function ReportSummary({ report }: { report: SecurityScanCompletedReport }) {
  const dropped =
    report.dropped.unanchored +
    report.dropped.patchRejected +
    report.dropped.refuted +
    report.dropped.unparsable;
  const details = [
    coverageSummary(report.coverage.scannedFiles, report.coverage.candidateFiles),
    report.coverage.scope,
    report.model,
    report.commit?.slice(0, SHORT_COMMIT_LENGTH),
  ].filter((value): value is string => Boolean(value));
  const setAside = droppedSummary(dropped);
  return (
    <div className={styles['summary']}>
      <p className={styles['summaryTitle']}>{findingsSummary(report.findings.length)}</p>
      <p className={styles['help']}>{details.join(' · ')}</p>
      {setAside && <p className={styles['help']}>{setAside}</p>}
    </div>
  );
}

export function SecurityScanPage({ sessionId, api = securityScanApi }: SecurityScanPageProps) {
  const [state, setState] = useState<SecurityScanStateResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [scope, setScope] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Record<string, SecurityScanDeliveryResult>>({});
  const { confirm, dialog } = useConfirmAction();
  const scopeId = useId();
  const consentId = useId();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setState(await api.read(sessionId));
    } catch (error: unknown) {
      setLoadError(toUserMessage(error, SECURITY_SCAN_COPY.loadFailed));
    }
  }, [api, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const report = state?.report ?? null;
  const reportStatus = report?.status ?? null;
  const running = scanning || reportStatus === SECURITY_SCAN_STATUS.running;
  const runningElsewhere = !scanning && reportStatus === SECURITY_SCAN_STATUS.running;

  useEffect(() => {
    if (!runningElsewhere) return undefined;
    const timer = window.setTimeout(() => void load(), RUNNING_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [runningElsewhere, load, report]);

  const startScan = async () => {
    setScanning(true);
    setScanError(null);
    setDecisionError(null);
    try {
      const trimmed = scope.trim();
      const completed = await api.scan(sessionId, { scope: trimmed ? trimmed : null });
      setDeliveries({});
      setConsent(false);
      setState((current) => (current ? { ...current, report: completed } : current));
    } catch (error: unknown) {
      setScanError(toUserMessage(error, SECURITY_SCAN_COPY.scanFailed));
    } finally {
      setScanning(false);
    }
  };

  const decide = (finding: SecurityScanFinding, decision: SecurityScanDecision) => {
    if (report?.status !== SECURITY_SCAN_STATUS.completed) return;
    const scanId = report.scanId;
    const run = async () => {
      setDecidingId(finding.id);
      setDecisionError(null);
      try {
        const result = await api.decide(sessionId, {
          scanId,
          findingId: finding.id,
          decision,
        });
        const delivery = result.delivery;
        if (delivery) {
          setDeliveries((current) => ({ ...current, [finding.id]: delivery }));
        }
        setState((current) => (current ? { ...current, report: result.report } : current));
      } catch (error: unknown) {
        setDecisionError(toUserMessage(error, SECURITY_SCAN_COPY.decisionFailed));
      } finally {
        setDecidingId(null);
      }
    };
    confirm(
      decision === 'approve'
        ? {
            title: SECURITY_SCAN_COPY.approveTitle,
            description: approveDescription(finding.path, state?.session.workingBranch ?? null),
            confirmLabel: SECURITY_SCAN_COPY.approveConfirm,
            onConfirm: run,
          }
        : {
            title: SECURITY_SCAN_COPY.dismissTitle,
            description: SECURITY_SCAN_COPY.dismissDescription,
            confirmLabel: SECURITY_SCAN_COPY.dismissConfirm,
            destructive: true,
            onConfirm: run,
          },
    );
  };

  const header = (
    <header className={styles['header']}>
      <Link className={styles['back']} href={codeSessionPath(sessionId)}>
        <ChevronLeft size={GLYPH_SIZE} aria-hidden="true" />
        <span>{SECURITY_SCAN_COPY.back}</span>
      </Link>
      <h1 className={styles['title']}>{SECURITY_SCAN_COPY.title}</h1>
      <p className={styles['help']}>
        {state ? state.session.title : SECURITY_SCAN_COPY.description}
      </p>
    </header>
  );

  if (!state) {
    return (
      <main className={styles['page']}>
        {header}
        {loadError ? (
          <div className={styles['notice']} role="alert">
            <p>{loadError}</p>
            <button type="button" className={styles['secondaryButton']} onClick={() => void load()}>
              {SECURITY_SCAN_COPY.retry}
            </button>
          </div>
        ) : (
          <div className={styles['notice']}>
            <Spinner size="sm" />
          </div>
        )}
      </main>
    );
  }

  if (!state.session.repositoryUrl) {
    return (
      <main className={styles['page']}>
        {header}
        <p className={styles['notice']}>{SECURITY_SCAN_COPY.noRepository}</p>
      </main>
    );
  }

  const completed = report?.status === SECURITY_SCAN_STATUS.completed ? report : null;
  const failure =
    scanError ?? (report?.status === SECURITY_SCAN_STATUS.failed ? report.error : null);

  return (
    <main className={styles['page']}>
      {header}
      <section className={styles['launcher']} aria-label={SECURITY_SCAN_COPY.title}>
        <p className={styles['prose']}>{SECURITY_SCAN_COPY.description}</p>
        <label className={styles['field']} htmlFor={scopeId}>
          <span className={styles['label']}>{SECURITY_SCAN_COPY.scopeLabel}</span>
          <input
            id={scopeId}
            className={styles['input']}
            value={scope}
            maxLength={SECURITY_SCAN_SCOPE_MAX_LENGTH}
            placeholder={SECURITY_SCAN_COPY.scopePlaceholder}
            disabled={running}
            onChange={(event) => setScope(event.target.value)}
          />
        </label>
        <label className={styles['consent']} htmlFor={consentId}>
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            disabled={running}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>{SECURITY_SCAN_COPY.consentLabel}</span>
        </label>
        <div className={styles['actions']}>
          <button
            type="button"
            className={styles['primaryButton']}
            disabled={!consent || running}
            onClick={() => void startScan()}
          >
            {completed || failure ? SECURITY_SCAN_COPY.rescan : SECURITY_SCAN_COPY.scan}
          </button>
          {running && (
            <span className={styles['inline']} aria-live="polite">
              <Spinner size="sm" />
              <span>{SECURITY_SCAN_COPY.scanning}</span>
            </span>
          )}
        </div>
        {failure && !running && (
          <p className={styles['error']} role="alert">
            {failure}
          </p>
        )}
      </section>

      {completed && (
        <section className={styles['results']} aria-live="polite">
          <ReportSummary report={completed} />
          {decisionError && (
            <p className={styles['error']} role="alert">
              {decisionError}
            </p>
          )}
          {completed.findings.length === 0 ? (
            <p className={styles['help']}>{SECURITY_SCAN_COPY.noFindings}</p>
          ) : (
            <ul className={styles['findings']}>
              {completed.findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  busy={decidingId !== null}
                  delivery={deliveries[finding.id] ?? null}
                  pullRequestUrl={state.session.pullRequestUrl}
                  onDecide={decide}
                />
              ))}
            </ul>
          )}
        </section>
      )}
      {dialog}
    </main>
  );
}
