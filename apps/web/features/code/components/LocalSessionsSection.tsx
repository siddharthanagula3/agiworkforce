'use client';

import { Folder, Plus, TerminalSquare } from '@agiworkforce/icons';
import { Spinner } from '@agiworkforce/ui';
import type { DeveloperSession, DeveloperSessionGroup } from '@agiworkforce/local-runtime-contract';
import { formatRelativeTime } from '@shared/utils/format';
import {
  LOCAL_CODE_COPY,
  localModelLabel,
  localSessionOriginLabel,
  newSessionLabel,
} from '../local-code';
import styles from '../CloudCodePage.module.css';

const RAIL_GLYPH_SIZE = 16;
const GROUP_GLYPH_SIZE = 13;

export interface LocalSessionsSectionProps {
  groups: DeveloperSessionGroup[];
  loading: boolean;
  adding: boolean;
  error: string | null;
  unavailable: string | null;
  selectedId: string | null;
  onSelect: (session: DeveloperSession) => void;
  onNewSession: (rootId: string) => void;
  onAddFolder: () => void;
}

export function LocalSessionsSection({
  groups,
  loading,
  adding,
  error,
  unavailable,
  selectedId,
  onSelect,
  onNewSession,
  onAddFolder,
}: LocalSessionsSectionProps) {
  const empty = groups.length === 0 ? LOCAL_CODE_COPY.emptyNoFolders : LOCAL_CODE_COPY.empty;
  const nothingToShow =
    !loading && unavailable === null && groups.every((group) => group.sessions.length === 0);

  return (
    <section aria-label={LOCAL_CODE_COPY.heading} data-testid="local-code-section">
      <div className={styles['railSectionHeader']}>
        <span className={styles['railSectionLabel']}>{LOCAL_CODE_COPY.heading}</span>
      </div>

      {loading && (
        <div className={styles['railEmpty']}>
          <Spinner size="sm" aria-label={LOCAL_CODE_COPY.loading} />
        </div>
      )}

      {error !== null && (
        <p className={styles['railEmpty']} role="alert">
          {error}
        </p>
      )}

      {unavailable !== null && <p className={styles['railEmpty']}>{unavailable}</p>}

      {unavailable === null &&
        groups.map((group) => (
          <div key={group.rootId}>
            <div className={styles['railGroup']}>
              <Folder size={GROUP_GLYPH_SIZE} aria-hidden="true" />
              <span className={styles['railGroupName']}>{group.name}</span>
              {group.branch && <span className={styles['railGroupBranch']}>{group.branch}</span>}
            </div>

            {group.unavailable && (
              <p className={styles['railEmpty']}>{group.unavailable.message}</p>
            )}

            {group.sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                className={`${styles['railRow']} ${styles['railLocalRow']} ${
                  selectedId === session.id ? styles['railRowActive'] : ''
                }`}
                aria-current={selectedId === session.id ? 'true' : undefined}
                onClick={() => onSelect(session)}
              >
                <span className={styles['railRowGlyph']}>
                  <TerminalSquare size={RAIL_GLYPH_SIZE} aria-hidden="true" />
                </span>
                <span className={styles['railLocalText']}>
                  <span className={styles['railRowLabel']}>{session.title}</span>
                  <span className={styles['railRowMeta']}>
                    {[
                      localSessionOriginLabel(session),
                      localModelLabel(session.model),
                      formatRelativeTime(session.updatedAt),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </button>
            ))}

            <button
              type="button"
              className={`${styles['railRow']} ${styles['railSubRow']}`}
              onClick={() => onNewSession(group.rootId)}
            >
              <span className={styles['railRowLabel']}>{newSessionLabel(group.name)}</span>
            </button>
          </div>
        ))}

      {nothingToShow && groups.length === 0 && <p className={styles['railEmpty']}>{empty}</p>}

      <button type="button" className={styles['railRow']} disabled={adding} onClick={onAddFolder}>
        <span className={styles['railRowGlyph']}>
          <Plus size={RAIL_GLYPH_SIZE} aria-hidden="true" />
        </span>
        <span className={styles['railRowLabel']}>
          {adding ? LOCAL_CODE_COPY.addingFolder : LOCAL_CODE_COPY.addFolder}
        </span>
      </button>
    </section>
  );
}
