'use client';

import type { Icon } from '@agiworkforce/icons';
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { CODE_COPY, codeRailItemPinned, type CodeRailItemId } from '../code-surface';
import styles from '../CloudCodePage.module.css';

const ROW_GLYPH_SIZE = 16;

export interface CodeRailItem {
  id: CodeRailItemId;
  href: string;
  label: string;
  glyph: Icon;
}

export interface CodeCustomizeSidebarModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly CodeRailItem[];
}

export function CodeCustomizeSidebarModal({
  open,
  onOpenChange,
  items,
}: CodeCustomizeSidebarModalProps) {
  const pins = useSettingsStore((state) => state.codeRailPins);
  const setPinned = useSettingsStore((state) => state.setCodeRailItemPinned);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`w-[min(96vw,440px)] ${styles['customizeDialog']}`}
        closeLabel={CODE_COPY.customizeSidebarClose}
      >
        <DialogHeader>
          <DialogTitle className={styles['customizeTitle']}>
            {CODE_COPY.customizeSidebar}
          </DialogTitle>
          <DialogDescription className={styles['customizeDescription']}>
            {CODE_COPY.customizeSidebarDescription}
          </DialogDescription>
        </DialogHeader>

        <ul className={styles['customizeList']}>
          {items.map(({ id, label, glyph: Glyph }) => {
            const checkboxId = `code-rail-pin-${id}`;
            return (
              <li key={id}>
                <label htmlFor={checkboxId} className={styles['customizeRow']}>
                  <Checkbox
                    id={checkboxId}
                    checked={codeRailItemPinned(id, pins)}
                    onCheckedChange={(checked) => setPinned(id, checked === true)}
                  />
                  <Glyph size={ROW_GLYPH_SIZE} aria-hidden="true" />
                  <span>{label}</span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className={styles['customizeActions']}>
          <button
            type="button"
            className={styles['pillButton']}
            onClick={() => onOpenChange(false)}
          >
            {CODE_COPY.customizeSidebarDone}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
