'use client';

import { ChevronDown } from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import {
  DEVELOPER_AGENT_MODES,
  DEVELOPER_AGENT_MODE_LABELS,
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_REASONING_EFFORT_LABELS,
  type DeveloperAgentMode,
  type DeveloperReasoningEffort,
} from '@agiworkforce/local-runtime-contract';
import { LOCAL_AGENT_MODE_HINTS, LOCAL_CODE_COPY } from '../local-code';
import { menuCollisionPadding } from './LocalModelChip';
import styles from '../CloudCodePage.module.css';

const CHIP_GLYPH_SIZE = 13;

export interface LocalTurnControlsProps {
  agentMode: DeveloperAgentMode;
  reasoningEffort: DeveloperReasoningEffort | undefined;
  effortLevels: readonly DeveloperReasoningEffort[] | null;
  showMode: boolean;
  showEffort: boolean;
  disabled: boolean;
  onModeChange: (mode: DeveloperAgentMode) => void;
  onEffortChange: (effort: DeveloperReasoningEffort) => void;
}

function isMode(value: string): value is DeveloperAgentMode {
  return (DEVELOPER_AGENT_MODES as readonly string[]).includes(value);
}

function isEffort(value: string): value is DeveloperReasoningEffort {
  return (DEVELOPER_REASONING_EFFORTS as readonly string[]).includes(value);
}

export function LocalTurnControls({
  agentMode,
  reasoningEffort,
  effortLevels,
  showMode,
  showEffort,
  disabled,
  onModeChange,
  onEffortChange,
}: LocalTurnControlsProps) {
  const modeClass =
    agentMode === 'bypass'
      ? `${styles['controlButton']} ${styles['controlButtonWarning']}`
      : styles['controlButton'];

  return (
    <>
      {showMode && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={modeClass}
              disabled={disabled}
              aria-label={`${LOCAL_CODE_COPY.agentMode}: ${DEVELOPER_AGENT_MODE_LABELS[agentMode]}`}
              title={LOCAL_CODE_COPY.agentModeShortcut}
            >
              <span>{DEVELOPER_AGENT_MODE_LABELS[agentMode]}</span>
              <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="top"
            collisionPadding={menuCollisionPadding()}
            className="w-72"
          >
            <DropdownMenuLabel>{LOCAL_CODE_COPY.agentMode}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={agentMode}
              onValueChange={(value) => {
                if (isMode(value)) onModeChange(value);
              }}
            >
              {DEVELOPER_AGENT_MODES.map((mode) => (
                <DropdownMenuRadioItem key={mode} value={mode}>
                  <span className={styles['menuItemStack']}>
                    <span className={styles['menuItemLabel']}>
                      {DEVELOPER_AGENT_MODE_LABELS[mode]}
                    </span>
                    <span className={styles['menuItemOffer']}>{LOCAL_AGENT_MODE_HINTS[mode]}</span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {showEffort && effortLevels?.length !== 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={styles['controlButton']}
              disabled={disabled}
              aria-label={`${LOCAL_CODE_COPY.reasoningEffort}: ${
                reasoningEffort
                  ? DEVELOPER_REASONING_EFFORT_LABELS[reasoningEffort]
                  : LOCAL_CODE_COPY.reasoningDefault
              }`}
            >
              <span>
                {reasoningEffort
                  ? DEVELOPER_REASONING_EFFORT_LABELS[reasoningEffort]
                  : LOCAL_CODE_COPY.reasoningDefault}
              </span>
              <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" collisionPadding={menuCollisionPadding()}>
            <DropdownMenuLabel>{LOCAL_CODE_COPY.reasoningEffort}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={reasoningEffort ?? ''}
              onValueChange={(value) => {
                if (isEffort(value)) onEffortChange(value);
              }}
            >
              {(effortLevels ?? DEVELOPER_REASONING_EFFORTS).map((effort) => (
                <DropdownMenuRadioItem key={effort} value={effort}>
                  {DEVELOPER_REASONING_EFFORT_LABELS[effort]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}
