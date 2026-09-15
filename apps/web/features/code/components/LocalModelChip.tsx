'use client';

import { useState } from 'react';
import { ChevronDown } from '@agiworkforce/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';
import {
  LOCAL_FAILURE_ACTION_LABELS,
  LOCAL_MODEL_EVIDENCE_LABELS,
  LOCAL_MODEL_SETUP_HEADING,
  localModelLabel,
  localModelSetupCount,
  type LocalModelChoice,
  type LocalProviderSetup,
} from '../local-code';
import styles from '../CloudCodePage.module.css';

const CHIP_GLYPH_SIZE = 13;
const MENU_EDGE_GAP = 12;

/**
 * The shell's title strip is a drag region, so a popover reaching into it is
 * untouchable. The height is read from its token rather than repeated here.
 */
export function menuCollisionPadding(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const strip =
    typeof window === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue('--chat-window-title-strip');
  const top = Number.parseFloat(strip);
  return {
    top: Number.isFinite(top) && top > 0 ? top + MENU_EDGE_GAP : MENU_EDGE_GAP,
    bottom: MENU_EDGE_GAP,
    left: MENU_EDGE_GAP,
    right: MENU_EDGE_GAP,
  };
}

function ProviderSetupRow({ setup }: { setup: LocalProviderSetup }) {
  const [copied, setCopied] = useState(false);
  const offer = setup.offer;

  if (offer === null || offer.kind !== 'copy') {
    return (
      <DropdownMenuItem className="pl-8" disabled>
        <span className={styles['menuItemStack']}>
          <span className={styles['menuItemTop']}>
            <span className={styles['menuItemLabel']}>{setup.label}</span>
            <span className={styles['menuItemCount']}>{localModelSetupCount(setup)}</span>
          </span>
        </span>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      className="pl-8"
      onSelect={(event) => {
        event.preventDefault();
        void navigator.clipboard.writeText(offer.text).then(() => setCopied(true));
      }}
    >
      <span className={styles['menuItemStack']}>
        <span className={styles['menuItemTop']}>
          <span className={styles['menuItemLabel']}>{setup.label}</span>
          <span className={styles['menuItemCount']}>{localModelSetupCount(setup)}</span>
        </span>
        <span className={styles['menuItemOffer']}>
          {copied ? LOCAL_FAILURE_ACTION_LABELS.copied : LOCAL_FAILURE_ACTION_LABELS.copy}
        </span>
      </span>
    </DropdownMenuItem>
  );
}

export interface LocalModelChipProps {
  choices: LocalModelChoice[];
  setups: LocalProviderSetup[];
  selected: string;
  unreachable: boolean;
  disabled: boolean;
  onSelect: (modelId: string) => void;
}

export function LocalModelChip({
  choices,
  setups,
  selected,
  unreachable,
  disabled,
  onSelect,
}: LocalModelChipProps) {
  const groupsByEvidence = [...new Set(choices.map((choice) => choice.evidence))];
  const triggerClass = unreachable
    ? `${styles['controlButton']} ${styles['controlButtonWarning']}`
    : styles['controlButton'];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={triggerClass} disabled={disabled}>
          <span>{localModelLabel(selected) ?? selected}</span>
          <ChevronDown size={CHIP_GLYPH_SIZE} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        collisionPadding={menuCollisionPadding()}
        className={`w-80 ${styles['menuScroll']}`}
      >
        <DropdownMenuRadioGroup value={selected} onValueChange={onSelect}>
          {groupsByEvidence.map((evidence, index) => (
            <div key={evidence}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{LOCAL_MODEL_EVIDENCE_LABELS[evidence]}</DropdownMenuLabel>
              {choices
                .filter((choice) => choice.evidence === evidence)
                .map((choice) => (
                  <DropdownMenuRadioItem key={choice.id} value={choice.id}>
                    {choice.label}
                  </DropdownMenuRadioItem>
                ))}
            </div>
          ))}
        </DropdownMenuRadioGroup>
        {setups.length > 0 && (
          <div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{LOCAL_MODEL_SETUP_HEADING}</DropdownMenuLabel>
            {setups.map((setup) => (
              <ProviderSetupRow key={setup.provider} setup={setup} />
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
