import type * as vscode from 'vscode';
import {
  getSurfaceCapabilityAvailability,
  type DiscoverableSurfaceCapability,
} from '@agiworkforce/types';
import type { SettingsPanelState, SettingsSection } from './settingsProtocol';

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</gu, '\\u003c')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

const VSCODE_DISCOVERABLE_CAPABILITIES: readonly DiscoverableSurfaceCapability[] = [
  'managed-plugins',
  'browser-control',
  'computer-use',
];

export function getSettingsWebviewContent(
  webview: vscode.Webview,
  nonce: string,
  initialState: SettingsPanelState,
  initialSection: SettingsSection,
  showDeveloperControls: boolean = false,
): string {
  const serializedState = serializeForInlineScript(initialState);
  const serializedSection = serializeForInlineScript(initialSection);
  const capabilityAvailabilityRows = VSCODE_DISCOVERABLE_CAPABILITIES.map((capability) => {
    const presentation = getSurfaceCapabilityAvailability(capability, 'vscode');
    return `
              <div
                class="capability-availability-row${presentation.available ? '' : ' is-unavailable'}"
                data-capability-id="${escapeHtml(presentation.id)}"
                data-capability-available="${String(presentation.available)}"
                role="listitem"
              >
                <div class="capability-availability-copy">
                  <div class="capability-availability-heading">
                    <span class="capability-availability-name">${escapeHtml(presentation.label)}</span>
                    <span class="capability-availability-status">${escapeHtml(presentation.statusLabel)}</span>
                  </div>
                  <span class="setting-description">${escapeHtml(presentation.description)}</span>
                </div>
                <span class="surface-availability">${escapeHtml(presentation.tooltip)}</span>
              </div>`;
  }).join('');

  return /* html */ `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AGI Settings</title>
    <style nonce="${nonce}">
      :root {
        color-scheme: light dark;
        font-family: var(--vscode-font-family, system-ui, sans-serif);
        font-size: var(--vscode-font-size, 13px);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
      }

      * {
        box-sizing: border-box;
      }

      [hidden] {
        display: none !important;
      }

      html,
      body {
        min-height: 100%;
        margin: 0;
        background: var(--vscode-editor-background);
      }

      button,
      input,
      select,
      textarea {
        font: inherit;
      }

      button,
      select,
      input,
      textarea {
        color: var(--vscode-input-foreground);
      }

      button:focus-visible,
      select:focus-visible,
      input:focus-visible,
      textarea:focus-visible {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
      }

      .settings-shell {
        display: grid;
        grid-template-columns: minmax(190px, 232px) minmax(0, 1fr);
        min-height: 100vh;
      }

      .sidebar {
        position: sticky;
        top: 0;
        align-self: start;
        height: 100vh;
        padding: 24px 14px;
        border-right: 1px solid var(--vscode-panel-border);
        background: var(--vscode-sideBar-background);
        overflow-y: auto;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 8px 20px;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border: 1px solid var(--vscode-activityBarBadge-background);
        border-radius: 9px;
        color: var(--vscode-activityBarBadge-foreground);
        background: var(--vscode-activityBarBadge-background);
        font-weight: 700;
        letter-spacing: -0.04em;
      }

      .brand-copy {
        min-width: 0;
      }

      .brand-title {
        display: block;
        font-size: 14px;
        font-weight: 650;
      }

      .brand-subtitle {
        display: block;
        margin-top: 1px;
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
      }

      .nav-label {
        margin: 6px 10px 8px;
        color: var(--vscode-descriptionForeground);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .nav-rail {
        position: relative;
      }

      .nav {
        display: grid;
        gap: 12px;
      }

      .nav-overflow-button {
        display: none;
      }

      .nav-group {
        display: grid;
        gap: 3px;
      }

      .nav-group-label {
        margin: 0 10px 3px;
        color: var(--vscode-descriptionForeground);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .nav-button {
        width: 100%;
        padding: 8px 10px;
        border: 0;
        border-radius: 6px;
        color: var(--vscode-sideBar-foreground);
        background: transparent;
        text-align: left;
        cursor: pointer;
      }

      .nav-button:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .nav-button[aria-current='page'] {
        color: var(--vscode-list-activeSelectionForeground);
        background: var(--vscode-list-activeSelectionBackground);
        font-weight: 600;
      }

      .sidebar-footer {
        margin-top: 22px;
        padding: 14px 8px 0;
        border-top: 1px solid var(--vscode-panel-border);
      }

      .raw-settings-button {
        width: 100%;
        padding: 7px 10px;
        border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
        border-radius: 5px;
        color: var(--vscode-button-secondaryForeground);
        background: var(--vscode-button-secondaryBackground);
        cursor: pointer;
      }

      .raw-settings-button:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .content {
        width: min(100%, 980px);
        padding: 40px clamp(28px, 5vw, 68px) 64px;
      }

      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 24px;
        margin-bottom: 26px;
      }

      .page-kicker {
        margin: 0 0 7px;
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .page-title {
        margin: 0;
        font-size: clamp(24px, 4vw, 32px);
        font-weight: 650;
        letter-spacing: -0.025em;
      }

      .page-description {
        max-width: 650px;
        margin: 9px 0 0;
        color: var(--vscode-descriptionForeground);
        line-height: 1.55;
      }

      .scope-stack {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 7px;
      }

      .pill {
        padding: 4px 8px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 999px;
        color: var(--vscode-descriptionForeground);
        background: var(--vscode-editorWidget-background);
        font-size: 11px;
        white-space: nowrap;
      }

      .pill.warning {
        color: var(--vscode-inputValidation-warningForeground);
        border-color: var(--vscode-inputValidation-warningBorder);
        background: var(--vscode-inputValidation-warningBackground);
      }

      .status {
        min-height: 20px;
        margin: -12px 0 12px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
      }

      .status[data-kind='error'] {
        color: var(--vscode-errorForeground);
      }

      .plan-status {
        min-height: 0;
        margin: 0;
        padding: 0 18px 15px;
      }

      .usage-progress {
        position: relative;
        width: min(220px, 100%);
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: var(--vscode-progressBar-background, color-mix(in srgb, var(--vscode-foreground) 16%, transparent));
      }

      .usage-progress > span {
        display: block;
        width: 0;
        height: 100%;
        border-radius: inherit;
        background: var(--vscode-button-background);
        transition: width 160ms ease;
      }

      .usage-progress.is-warning > span {
        background: var(--vscode-editorWarning-foreground, var(--agi-vscode-warning));
      }

      .override-notice {
        margin-bottom: 18px;
        padding: 12px 14px;
        border: 1px solid var(--vscode-inputValidation-infoBorder);
        border-radius: 7px;
        background: var(--vscode-inputValidation-infoBackground);
        color: var(--vscode-inputValidation-infoForeground);
        line-height: 1.45;
      }

      .section[hidden] {
        display: none;
      }

      .section-heading {
        margin-bottom: 14px;
      }

      .section-heading h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 650;
      }

      .section-heading p {
        margin: 6px 0 0;
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
      }

      .card {
        margin-bottom: 14px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 9px;
        background: var(--vscode-editorWidget-background);
        overflow: hidden;
      }

      .card-heading {
        padding: 15px 18px 10px;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .card-heading h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 650;
      }

      .card-heading p {
        margin: 5px 0 0;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        line-height: 1.45;
      }

      .diagnostic-card > summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 18px;
        cursor: pointer;
        color: var(--vscode-editor-foreground);
        font-weight: 600;
        list-style: none;
      }

      .diagnostic-card > summary::-webkit-details-marker { display: none; }
      .diagnostic-card > summary::after {
        content: 'Show';
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        font-weight: 400;
      }
      .diagnostic-card[open] > summary::after { content: 'Hide'; }
      .diagnostic-card[open] > summary { border-bottom: 1px solid var(--vscode-panel-border); }

      .setting-row {
        display: grid;
        /* 168px could not hold an input AND a button; 220px can. */
        grid-template-columns: minmax(0, 1fr) minmax(220px, 42%);
        align-items: center;
        /*
         * One right edge for every control in the second column.
         *
         * Controls are placed inconsistently: some wrapped in .control-stack
         * (which right-aligns via flex-end), some dropped straight into the grid
         * cell. A bare toggle or button in a cell aligns LEFT, a width:100% input
         * fills the cell, and a max-width input stops short — so toggles, number
         * inputs, selects and buttons each landed on a different edge inside the
         * same card. justify-items:end normalises them; the label column below
         * opts back out.
         */
        justify-items: end;
        gap: 22px;
        padding: 15px 18px;
      }

      /* The label column is text and must stay left-aligned and full-width. */
      .setting-row > *:first-child {
        justify-self: stretch;
      }

      .setting-row + .setting-row {
        border-top: 1px solid var(--vscode-panel-border);
      }

      .setting-name {
        display: block;
        font-weight: 600;
      }

      .setting-description {
        display: block;
        margin-top: 4px;
        color: var(--vscode-descriptionForeground);
        font-size: 12px;
        line-height: 1.45;
      }

      .setting-description.danger {
        /*
         * Fallback chain, because inputValidation.warningForeground is NOT
         * defined by the default Dark+ and Light+ themes. With a single
         * undefined variable the property is invalid-at-computed-value and the
         * text inherits the ordinary description colour — so a safety warning
         * rendered as plain body copy and lost the one signal that marks it as a
         * warning. editorWarning.foreground is defined everywhere.
         */
        color: var(
          --vscode-inputValidation-warningForeground,
          var(--vscode-editorWarning-foreground, var(--agi-vscode-warning))
        );
      }

      .control-stack {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        min-width: 0;
        width: 100%;
      }

      /*
       * An input sharing a stack with a button must take the remaining space, not
       * compete with it. width:100% on the input plus an intrinsic-width button
       * left Model preference about 103px wide — narrower than the model ids it
       * exists to display (including long catalog IDs), so the field truncated its
       * own value. min-width:0 is what allows the flex child to shrink at all.
       */
      .control-stack > .text-input,
      .control-stack > .select-input {
        flex: 1 1 auto;
        min-width: 0;
      }

      .control-stack > .secondary-button,
      .control-stack > .primary-button,
      .control-stack > .pill {
        flex-shrink: 0;
      }

      .text-input,
      .number-input,
      .select-input {
        width: 100%;
        min-height: 30px;
        padding: 5px 8px;
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 4px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
      }

      .number-input {
        max-width: 130px;
      }

      .select-input {
        cursor: pointer;
      }

      .config-path {
        display: inline-block;
        margin-top: 8px;
        padding: 3px 6px;
        border-radius: 4px;
        color: var(--vscode-textPreformat-foreground);
        background: var(--vscode-textPreformat-background);
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
        word-break: break-all;
      }

      .instruction-editor {
        padding: 16px 18px;
      }

      .instruction-editor + .instruction-editor {
        border-top: 1px solid var(--vscode-panel-border);
      }

      .instruction-textarea {
        width: 100%;
        min-height: 132px;
        margin-top: 9px;
        padding: 9px 10px;
        resize: vertical;
        border: 1px solid var(--vscode-input-border, transparent);
        border-radius: 5px;
        color: var(--vscode-input-foreground);
        background: var(--vscode-input-background);
        line-height: 1.45;
      }

      .instruction-footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 9px;
      }

      .character-count {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
      }

      .instruction-preview {
        max-height: 260px;
        margin: 10px 0 0;
        padding: 12px;
        overflow: auto;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        color: var(--vscode-editor-foreground);
        background: var(--vscode-textCodeBlock-background);
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 11px;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      .instruction-subheading {
        margin-top: 14px;
      }

      .instruction-sources {
        display: grid;
        gap: 7px;
        margin: 10px 0 0;
        padding: 0;
        list-style: none;
      }

      .instruction-source {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
        padding: 8px 10px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 5px;
      }

      .instruction-source span {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        /*
         * Left-aligned, not right. These are discovered FILE PATHS, which have no
         * spaces: right-aligning them made a long path wrap ragged-left and break
         * mid-segment, so the reader could not scan the directory structure. Paths
         * read left-to-right from the root; align them that way and break on the
         * separators instead.
         */
        text-align: left;
        word-break: break-word;
        overflow-wrap: anywhere;
      }

      .secondary-button,
      .primary-button {
        min-height: 30px;
        padding: 5px 11px;
        border-radius: 4px;
        white-space: nowrap;
        cursor: pointer;
      }

      .secondary-button {
        border: 1px solid var(--vscode-button-border, var(--vscode-panel-border));
        color: var(--vscode-button-secondaryForeground);
        background: var(--vscode-button-secondaryBackground);
      }

      .secondary-button:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .primary-button {
        border: 1px solid var(--vscode-button-border, transparent);
        color: var(--vscode-button-foreground);
        background: var(--vscode-button-background);
      }

      .primary-button:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .toggle {
        position: relative;
        display: inline-flex;
        align-items: center;
        width: 38px;
        height: 22px;
        flex: 0 0 auto;
      }

      .toggle input {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
      }

      .toggle-track {
        width: 38px;
        height: 22px;
        border: 1px solid var(--vscode-checkbox-border, var(--vscode-panel-border));
        border-radius: 999px;
        background: var(--vscode-checkbox-background);
        transition:
          background 120ms ease,
          border-color 120ms ease;
      }

      .toggle-track::after {
        content: '';
        position: absolute;
        top: 4px;
        left: 4px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--vscode-checkbox-foreground);
        transition: transform 120ms ease;
      }

      .toggle input:checked + .toggle-track {
        border-color: var(--vscode-button-background);
        background: var(--vscode-button-background);
      }

      .toggle input:checked + .toggle-track::after {
        transform: translateX(16px);
        background: var(--vscode-button-foreground);
      }

      .toggle input:focus-visible + .toggle-track {
        outline: 1px solid var(--vscode-focusBorder);
        outline-offset: 2px;
      }

      .account-summary,
      .empty-capability {
        padding: 20px 18px;
      }

      .account-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .account-state {
        display: flex;
        align-items: center;
        gap: 9px;
        font-weight: 600;
      }

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--vscode-descriptionForeground);
      }

      .status-dot.connected {
        background: var(--vscode-testing-iconPassed);
      }

      .empty-capability h3 {
        margin: 0;
        font-size: 14px;
      }

      .empty-capability p {
        max-width: 680px;
        margin: 7px 0 14px;
        color: var(--vscode-descriptionForeground);
        line-height: 1.5;
      }

      .setting-row + .empty-capability {
        border-top: 1px solid var(--vscode-panel-border);
      }

      .capability-availability-list {
        display: grid;
      }

      .capability-availability-row {
        display: grid;
        /*
         * The second column was minmax(170px, auto). An auto max lets a long
         * "Available in Pro, Max 5x, Max 15x, Team and Enterprise" string grow
         * without bound, so the SECONDARY column ended up wider than the
         * capability name and description it qualifies. Cap it: the primary
         * content keeps the space, and the availability text wraps.
         */
        grid-template-columns: minmax(0, 1fr) minmax(140px, 30%);
        align-items: center;
        gap: 18px;
        min-height: 72px;
        padding: 14px 18px;
      }

      .capability-availability-row + .capability-availability-row {
        border-top: 1px solid var(--vscode-panel-border);
      }

      .capability-availability-row.is-unavailable .capability-availability-name {
        color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
      }

      .capability-availability-copy {
        min-width: 0;
      }

      .capability-availability-heading {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 7px;
        margin-bottom: 4px;
      }

      .capability-availability-name {
        font-weight: 600;
      }

      .capability-availability-status {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
      }

      .surface-availability {
        color: var(--vscode-descriptionForeground);
        font-size: 11px;
        text-align: right;
      }

      .action-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .plan-actions {
        flex-wrap: wrap;
      }

      .override-notice-action {
        background: none;
        border: 0;
        padding: 0;
        font: inherit;
        color: var(--vscode-textLink-foreground);
        text-decoration: underline;
        cursor: pointer;
      }
      .override-notice-action:hover {
        color: var(--vscode-textLink-activeForeground);
      }

      @media (max-width: 760px) {
        .settings-shell {
          display: block;
        }

        .sidebar {
          position: sticky;
          z-index: 2;
          height: auto;
          padding: 12px 14px 10px;
          border-right: 0;
          border-bottom: 1px solid var(--vscode-panel-border);
        }

        .brand {
          padding: 0 2px 10px;
        }

        .nav-label,
        .sidebar-footer {
          display: none;
        }

        .nav {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          padding: 0 30px 2px;
          scroll-snap-type: x proximity;
          scrollbar-width: thin;
          scroll-behavior: smooth;
        }

        .nav-overflow-button {
          position: absolute;
          z-index: 1;
          top: 0;
          bottom: 2px;
          display: grid;
          place-items: center;
          width: 28px;
          padding: 0;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 6px;
          color: var(--vscode-sideBar-foreground);
          background: var(--vscode-sideBar-background);
          box-shadow: 0 0 10px 6px var(--vscode-sideBar-background);
          cursor: pointer;
        }

        .nav-overflow-button:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .nav-overflow-button--back {
          left: 0;
        }

        .nav-overflow-button--forward {
          right: 0;
        }

        .nav-group {
          display: flex;
          flex: 0 0 auto;
          gap: 5px;
        }

        .nav-group-label { display: none; }

        .nav-button {
          scroll-snap-align: start;
        }

        .nav-button {
          width: auto;
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .content {
          padding: 26px 18px 48px;
        }

        .capability-availability-row {
          grid-template-columns: minmax(0, 1fr);
          gap: 6px;
        }

        .surface-availability {
          text-align: left;
        }

        .page-header {
          display: block;
        }

        .scope-stack {
          justify-content: flex-start;
          margin-top: 14px;
        }

        .setting-row {
          grid-template-columns: 1fr;
          gap: 11px;
        }

        .control-stack {
          justify-content: flex-start;
        }

        .plan-actions {
          justify-content: flex-start;
        }

        .number-input {
          max-width: none;
        }
      }

      @media (forced-colors: active) {
        button:focus-visible,
        select:focus-visible,
        input:focus-visible,
        textarea:focus-visible,
        .toggle input:focus-visible + .toggle-track {
          outline: 2px solid Highlight;
        }

        .card,
        .pill,
        .override-notice,
        .text-input,
        .number-input,
        .select-input,
        .instruction-textarea,
        .instruction-preview,
        .instruction-source,
        .secondary-button,
        .primary-button,
        .raw-settings-button,
        .toggle-track {
          border-color: CanvasText;
        }

        .nav-button[aria-current='page'] {
          color: HighlightText;
          background: Highlight;
        }

        .primary-button,
        .toggle input:checked + .toggle-track,
        .usage-progress > span,
        .status-dot.connected {
          color: HighlightText;
          background: Highlight;
        }

        .usage-progress {
          border: 1px solid CanvasText;
          background: Canvas;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="settings-shell">
      <aside class="sidebar" aria-label="Settings navigation">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">A</span>
          <span class="brand-copy">
            <span class="brand-title">AGI Settings</span>
            <span class="brand-subtitle">VS Code extension</span>
          </span>
        </div>
        <p class="nav-label">Settings</p>
        <div class="nav-rail">
        <nav class="nav" id="settingsNav" aria-label="Settings sections">
          <div class="nav-group" role="group" aria-labelledby="nav-workspace-label">
            <span class="nav-group-label" id="nav-workspace-label">Workspace</span>
            <button class="nav-button" type="button" data-section="general">Session</button>
            <button class="nav-button" type="button" data-section="configuration">Runtime</button>
            <button class="nav-button" type="button" data-section="personalization">Instructions &amp; editor</button>
          </div>
          <div class="nav-group" role="group" aria-labelledby="nav-integrations-label">
            <span class="nav-group-label" id="nav-integrations-label">Integrations</span>
            <button class="nav-button" type="button" data-section="mcp">MCP servers</button>
            <button class="nav-button" type="button" data-section="plugins">Plugins</button>
            <button class="nav-button" type="button" data-section="hooks">Hooks</button>
          </div>
          <div class="nav-group" role="group" aria-labelledby="nav-account-label">
            <span class="nav-group-label" id="nav-account-label">Account</span>
            <button class="nav-button" type="button" data-section="usage">Usage &amp; billing</button>
            <button class="nav-button" type="button" data-section="account">Cloud account</button>
          </div>
        </nav>
        <button
          class="nav-overflow-button nav-overflow-button--back"
          id="navScrollBack"
          type="button"
          aria-label="Show previous settings sections"
          aria-controls="settingsNav"
          hidden
        ><span aria-hidden="true">‹</span></button>
        <button
          class="nav-overflow-button nav-overflow-button--forward"
          id="navScrollForward"
          type="button"
          aria-label="Show more settings sections"
          aria-controls="settingsNav"
          hidden
        ><span aria-hidden="true">›</span></button>
        </div>
        <div class="sidebar-footer">
          <button
            class="raw-settings-button"
            type="button"
            data-command="openRawSettings"
          >
            Open VS Code settings
          </button>
        </div>
      </aside>

      <main class="content">
        <header class="page-header">
          <div>
            <p class="page-kicker">Workspace-scoped developer tools</p>
            <h1 class="page-title" id="pageTitle" tabindex="-1">Settings</h1>
            <p class="page-description" id="pageDescription">
              Configure how AGI works in VS Code. Changes are stored in your VS Code user settings.
            </p>
          </div>
          <div class="scope-stack" aria-label="Configuration scope">
            <span class="pill">User settings</span>
            <span class="pill" id="trustPill">Trusted workspace</span>
          </div>
        </header>

        <div class="status" id="status" role="status" aria-live="polite"></div>
        <div class="override-notice" id="overrideNotice" hidden></div>

        <section class="section" id="section-general" data-settings-section="general">
          <div class="card">
            <div class="card-heading">
              <h3>Model and reasoning</h3>
              <p>The local runtime remains the owner of workspace chat and tool execution.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-model">Model preference</label>
                <span class="setting-description">
                  Auto selects from models admitted for the active Local, provider BYOK, or Managed Cloud boundary. Managed Cloud availability follows the signed-in AGI plan.
                </span>
              </div>
              <div class="control-stack">
                <input
                  class="text-input"
                  id="setting-model"
                  data-setting="model"
                  data-kind="string"
                  type="text"
                  readonly
                  aria-readonly="true"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="secondary-button" type="button" data-command="selectModel">
                  Choose
                </button>
              </div>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-agent-mode">Agent mode</label>
                <span class="setting-description">
                  Controls when the agent asks before editing files or running commands.
                </span>
                <span class="setting-description danger">
                  Bypass Permissions requires a separate risk confirmation before it can activate.
                </span>
              </div>
              <select
                class="select-input"
                id="setting-agent-mode"
                data-setting="agent.mode"
                data-kind="string"
              >
                <option value="ask">Ask before edits and commands</option>
                <option value="auto">Auto — safe reads, approve writes</option>
                <option value="plan">Plan before changes</option>
                <option value="bypass">Bypass Permissions</option>
              </select>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-agent-effort">Reasoning effort</label>
                <span class="setting-description">
                  Used only by providers that expose an explicit reasoning-effort control.
                </span>
              </div>
              <select
                class="select-input"
                id="setting-agent-effort"
                data-setting="agent.effort"
                data-kind="string"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="max">Max</option>
              </select>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-agent-thinking">Extended thinking</label>
                <span class="setting-description">
                  Used by supported cloud-backed utilities. It does not enable Managed Cloud or change a Local or BYOK session boundary.
                </span>
              </div>
              <label class="toggle" title="Extended thinking">
                <input
                  id="setting-agent-thinking"
                  data-setting="agent.thinking"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
          </div>

          <div class="card">
            <div class="card-heading">
              <h3>Session behavior</h3>
              <p>Defaults used when the extension starts a new workspace-scoped session.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-follow-up-behavior">Active-turn send</label>
                <span class="setting-description">
                  Queue starts a new turn after the current response. Steer adds the message to the current turn. Cmd/Ctrl+Enter uses the other behavior once.
                </span>
              </div>
              <select
                class="select-input"
                id="setting-follow-up-behavior"
                data-setting="composer.followUpBehavior"
                data-kind="string"
              >
                <option value="queue">Queue next turn</option>
                <option value="steer">Steer current turn</option>
              </select>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-context-lines">Context lines</label>
                <span class="setting-description">
                  Surrounding editor lines included with cloud-backed utility requests.
                </span>
              </div>
              <input
                class="number-input"
                id="setting-context-lines"
                data-setting="contextLines"
                data-kind="number"
                type="number"
                min="0"
                max="500"
                step="1"
              />
            </div>
          </div>
        </section>

        <section
          class="section"
          id="section-configuration"
          data-settings-section="configuration"
          hidden
        >
          <div class="card">
            <div class="card-heading">
              <h3>Workspace developer runtime</h3>
              <p>The CLI owns this workspace-scoped developer session. Local stays on this device, provider BYOK goes directly to the selected provider, and Managed Cloud is used only when that boundary is explicitly selected.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-cli-path">AGI CLI path</label>
                <span class="setting-description">
                  Executable used to start the local <code>app-server</code>. Existing runtimes restart after a change.
                </span>
              </div>
              <input
                class="text-input"
                id="setting-cli-path"
                data-setting="cliPath"
                data-kind="string"
                type="text"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <div class="empty-capability">
              <h3>Agent configuration file</h3>
              <p>
                The CLI reads this host-local TOML file when a workspace runtime starts. Existing
                developer sessions keep their current process until you restart the local runtime.
              </p>
              <code class="config-path" id="agentConfigPath">~/.agiworkforce/config.toml</code>
              <div class="action-row">
                <button class="primary-button" type="button" data-command="openAgentConfig">
                  Open config.toml
                </button>
                <button class="secondary-button" type="button" data-command="restartLocalRuntime">
                  Restart local runtime
                </button>
                <button class="secondary-button" type="button" data-command="openConfigDocs">
                  Configuration docs
                </button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-heading">
              <h3>Cloud-backed editor utilities</h3>
              <p>These settings do not move local chat history into Web, Mobile, or Desktop chat.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-api-endpoint">API endpoint</label>
                <span class="setting-description">
                  User-scoped endpoint for legacy cloud editor utilities.
                </span>
              </div>
              <input
                class="text-input"
                id="setting-api-endpoint"
                data-setting="apiEndpoint"
                data-kind="string"
                type="url"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-auto-apply">Auto-apply fixes</label>
                <span class="setting-description danger">
                  Applies AI-suggested fixes without opening a review diff. Leave off for review-first workflows.
                </span>
              </div>
              <label class="toggle" title="Auto-apply fixes">
                <input
                  id="setting-auto-apply"
                  data-setting="autoApplyFixes"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
          </div>

          <div class="card">
            <div class="card-heading">
              <h3>Desktop availability bridge</h3>
              <p>Shows authenticated Desktop availability. It does not route, send, or move IDE sessions.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-desktop-bridge">Enable bridge</label>
                <span class="setting-description">Connect to the local authenticated health bridge.</span>
              </div>
              <label class="toggle" title="Desktop availability bridge">
                <input
                  id="setting-desktop-bridge"
                  data-setting="desktopBridge.enabled"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-desktop-port">Bridge port</label>
                <span class="setting-description">Local port exposed by AGI Desktop.</span>
              </div>
              <input
                class="number-input"
                id="setting-desktop-port"
                data-setting="desktopBridge.port"
                data-kind="number"
                type="number"
                min="1024"
                max="65535"
                step="1"
              />
            </div>
          </div>
        </section>

        <section
          class="section"
          id="section-personalization"
          data-settings-section="personalization"
          hidden
        >
          <div class="card">
            <div class="card-heading">
              <h3>Custom instructions</h3>
              <p>
                Host instructions apply to VS Code developer sessions on this extension host.
                A non-empty workspace value replaces the host default for this workspace.
              </p>
            </div>
            <div class="instruction-editor">
              <label class="setting-name" for="hostCustomInstructions">Host default</label>
              <span class="setting-description">
                Private to this VS Code extension host; it is not written into the repository.
              </span>
              <textarea
                class="instruction-textarea"
                id="hostCustomInstructions"
                maxlength="8000"
                placeholder="For example: Prefer focused changes, explain tradeoffs, and run relevant tests."
              ></textarea>
              <div class="instruction-footer">
                <span class="character-count" id="hostInstructionCount">0 / 8,000</span>
                <button
                  class="primary-button"
                  type="button"
                  data-instruction-save="host"
                >
                  Save host instructions
                </button>
              </div>
            </div>
            <div class="instruction-editor">
              <label class="setting-name" for="workspaceCustomInstructions">
                Workspace override
              </label>
              <span class="setting-description">
                Leave empty to inherit the host default. Stored in VS Code workspace state, not in a project file.
              </span>
              <textarea
                class="instruction-textarea"
                id="workspaceCustomInstructions"
                maxlength="8000"
                placeholder="Optional instructions for only this workspace."
              ></textarea>
              <div class="instruction-footer">
                <span class="character-count" id="workspaceInstructionCount">0 / 8,000</span>
                <button
                  class="primary-button"
                  type="button"
                  data-instruction-save="workspace"
                >
                  Save workspace override
                </button>
              </div>
            </div>
            <div class="instruction-editor">
              <span class="setting-name">Effective turn prelude</span>
              <span class="setting-description">
                This is the exact custom-instruction block prepended to new local developer turns.
                Repository instruction files are loaded separately by the local runtime to avoid duplication.
              </span>
              <pre class="instruction-preview" id="instructionPrelude">No custom instructions are active.</pre>
              <span class="setting-name instruction-subheading">Runtime-discovered project sources</span>
              <ul class="instruction-sources" id="instructionSources"></ul>
              <div class="action-row">
                <button class="secondary-button" type="button" data-command="openInstructionDocs">
                  Custom-instruction docs
                </button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-heading">
              <h3>Editor surfaces</h3>
              <p>All editor decorations are opt-in so AGI does not crowd native VS Code controls.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-hover">Hover actions</label>
                <span class="setting-description">Show AGI quick actions when hovering identifiers.</span>
              </div>
              <label class="toggle" title="Hover actions">
                <input
                  id="setting-hover"
                  data-setting="hoverEnabled"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-code-lens">Code lenses</label>
                <span class="setting-description">
                  Show AGI actions above functions and classes.
                </span>
              </div>
              <label class="toggle" title="Code lenses">
                <input
                  id="setting-code-lens"
                  data-setting="codeLensEnabled"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
          </div>

          <div class="card">
            <div class="card-heading">
              <h3>Inline completions</h3>
              <p>
                Opting in sends bounded surrounding code to the cloud completion utility. Sensitive files are excluded.
              </p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-inline-completions">Ghost-text completions</label>
                <span class="setting-description">
                  Requires AGI Cloud sign-in or a configured API key.
                </span>
              </div>
              <label class="toggle" title="Inline completions">
                <input
                  id="setting-inline-completions"
                  data-setting="inlineCompletions.enabled"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-inline-delay">Request delay</label>
                <span class="setting-description">Milliseconds to wait after typing.</span>
              </div>
              <input
                class="number-input"
                id="setting-inline-delay"
                data-setting="inlineCompletions.debounceMs"
                data-kind="number"
                type="number"
                min="50"
                max="2000"
                step="10"
              />
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-inline-length">Maximum suggestion length</label>
                <span class="setting-description">Maximum returned characters per suggestion.</span>
              </div>
              <input
                class="number-input"
                id="setting-inline-length"
                data-setting="inlineCompletions.maxLength"
                data-kind="number"
                type="number"
                min="50"
                max="5000"
                step="50"
              />
            </div>
          </div>

          <div class="card">
            <div class="card-heading">
              <h3>Telemetry</h3>
              <p>Extension telemetry remains off unless both VS Code and this setting allow it.</p>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-telemetry">Share anonymous telemetry</label>
                <span class="setting-description">Send bounded product-usage events.</span>
              </div>
              <label class="toggle" title="Anonymous telemetry">
                <input
                  id="setting-telemetry"
                  data-setting="telemetryEnabled"
                  data-kind="boolean"
                  type="checkbox"
                />
                <span class="toggle-track" aria-hidden="true"></span>
              </label>
            </div>
            <div class="setting-row">
              <div>
                <label class="setting-name" for="setting-telemetry-endpoint">Telemetry endpoint</label>
                <span class="setting-description">User-scoped destination for extension telemetry.</span>
              </div>
              <input
                class="text-input"
                id="setting-telemetry-endpoint"
                data-setting="telemetryEndpoint"
                data-kind="string"
                type="url"
                autocomplete="off"
                spellcheck="false"
              />
            </div>
          </div>
        </section>

        <section class="section" id="section-usage" data-settings-section="usage" hidden>
          <!--
            Leads with the plan the user is actually on. This section previously
            opened with the debug tier-override dropdown and showed no plan name,
            no allowance and no reset date — a user clicking "Usage & billing"
            found only a developer control. The comparable surface (Codex's
            Usage & billing) opens with the plan, then the balance, then meters.
          -->
          <div class="card">
            <div class="card-heading">
              <h3>Your plan</h3>
              <p>Resolved from the AGI Cloud account signed in to this editor.</p>
            </div>
            <div class="setting-row">
              <div>
                <span class="setting-name" id="currentTierLabel">Unknown</span>
                <span class="setting-description" id="currentTierSource">
                  Sign in on Web to resolve your plan.
                </span>
              </div>
              <div class="control-stack plan-actions">
                <button class="primary-button" id="planSignInButton" type="button" data-command="signIn">
                  Sign in to AGI Cloud
                </button>
                <button class="secondary-button" type="button" data-command="viewPlans">
                  Compare plans
                </button>
                <button class="secondary-button" id="planBillingButton" type="button" data-command="manageBilling" hidden>
                  Billing
                </button>
              </div>
            </div>
            <div class="setting-row" id="planUsageRow" hidden>
              <div>
                <span class="setting-name">Plan usage</span>
                <span class="setting-description" id="planUsageCopy">Usage unavailable</span>
              </div>
              <div
                class="usage-progress"
                id="planUsageProgress"
                role="progressbar"
                aria-label="AGI Cloud plan usage"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="0"
              >
                <span id="planUsageFill"></span>
              </div>
            </div>
            <div class="status plan-status" id="planStatus" role="status" aria-live="polite"></div>
          </div>

          <details class="card diagnostic-card"${showDeveloperControls ? '' : ' hidden'}>
            <summary>Developer diagnostics</summary>
            <div class="card-heading">
              <h3>Resolved entitlement</h3>
              <p>Read-only account state used to diagnose model admission.</p>
            </div>
            <div class="setting-row">
              <div>
                <span class="setting-name">Current resolved tier</span>
                <span class="setting-description">Read-only value cached from the last account-tier refresh.</span>
              </div>
              <div class="control-stack">
                <span class="pill" id="currentTier">Unknown</span>
              </div>
            </div>
          </details>

          <div class="card">
            <div class="empty-capability">
              <h3>Account-level controls live on Web</h3>
              <p>
                Usage limits, invoices, payment recovery, and organization administration are account-scoped and never inferred from workspace files.
              </p>
              <div class="action-row">
                <button class="primary-button" type="button" data-command="showAccountUsage">
                  Session usage
                </button>
                <button class="secondary-button" type="button" data-command="manageUsage">
                  Manage usage on Web
                </button>
                <button class="secondary-button" type="button" data-command="manageBilling">
                  Billing
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section" id="section-mcp" data-settings-section="mcp" hidden>
          <div class="card">
            <div class="empty-capability">
              <h3>Local MCP is runtime-owned</h3>
              <p>
                The workspace-scoped AGI CLI discovers local MCP servers and reports their status in chat. Cloud connectors are a separate Managed Cloud capability.
              </p>
              <div class="action-row">
                <button class="secondary-button" type="button" data-command="manageConnectors">
                  Manage Cloud connectors
                </button>
                <button class="secondary-button" type="button" data-command="openDocs">
                  Open AGI docs
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section" id="section-hooks" data-settings-section="hooks" hidden>
          <div class="card">
            <div class="empty-capability">
              <h3>No extension hooks to configure</h3>
              <p>
                This VS Code extension does not currently contribute hook settings. Configure supported hooks through the local AGI CLI so they remain workspace scoped and reviewable.
              </p>
              <div class="action-row">
                <button class="secondary-button" type="button" data-command="openDocs">
                  Open AGI docs
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section" id="section-plugins" data-settings-section="plugins" hidden>
          <div class="card">
            <div
              class="capability-availability-list"
              role="list"
              aria-label="Capability availability in VS Code"
            >
${capabilityAvailabilityRows}
            </div>
          </div>
          <div class="card">
            <div class="empty-capability">
              <h3>No VS Code plugin registry is installed</h3>
              <p>
                Local developer tools come from the AGI CLI and MCP configuration. Managed Cloud connectors are installed and permissioned on Web; they do not silently gain access to this workspace.
              </p>
              <div class="action-row">
                <button class="secondary-button" type="button" data-command="manageConnectors">
                  Open Cloud directory
                </button>
                <button class="secondary-button" type="button" data-command="openDocs">
                  Learn about extensions
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="section" id="section-account" data-settings-section="account" hidden>
          <div class="card">
            <div class="account-summary">
              <div class="account-line">
                <div class="account-state">
                  <span class="status-dot" id="accountDot" aria-hidden="true"></span>
                  <span id="accountStatus" role="status" aria-live="polite">Checking AGI Cloud connection…</span>
                </div>
                <div class="action-row">
                  <button
                    class="primary-button"
                    id="signInButton"
                    type="button"
                    data-command="signIn"
                  >
                    Sign in
                  </button>
                  <button
                    class="secondary-button"
                    id="signOutButton"
                    type="button"
                    data-command="signOut"
                    hidden
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="empty-capability">
              <h3>Account and organization</h3>
              <p>
                Review session usage here or continue to Web for plan usage, billing, connectors, and Team administration.
              </p>
              <div class="action-row">
                <button class="secondary-button" type="button" data-command="showAccountUsage">
                  Account &amp; usage
                </button>
                <button class="secondary-button" type="button" data-command="manageUsage">
                  Usage on Web
                </button>
                <button class="secondary-button" type="button" data-command="manageTeam">
                  Team &amp; Enterprise
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>

    <script nonce="${nonce}">
      (function () {
        var vscode = acquireVsCodeApi();
        var state = ${serializedState};
        var activeSection = ${serializedSection};
        var statusTimer;
        var settingsNav = document.getElementById('settingsNav');
        var navScrollBack = document.getElementById('navScrollBack');
        var navScrollForward = document.getElementById('navScrollForward');
        var sectionCopy = {
          general: {
            title: 'Session',
            description: 'Configure the model, autonomy, reasoning, and session defaults used by AGI in VS Code.'
          },
          configuration: {
            title: 'Runtime',
            description: 'Manage the local runtime, cloud utility endpoints, and Desktop availability bridge.'
          },
          personalization: {
            title: 'Instructions & editor',
            description: 'Manage custom instructions and choose where AGI appears in the editor.'
          },
          usage: {
            title: 'Usage & billing',
            description: 'Review the resolved plan and continue to Web for account-level usage and billing.'
          },
          mcp: {
            title: 'MCP servers',
            description: 'Review runtime-owned MCP and Managed Cloud connector boundaries.'
          },
          hooks: {
            title: 'Hooks',
            description: 'Understand which automation belongs to the local AGI runtime.'
          },
          plugins: {
            title: 'Plugins',
            description: 'Review the explicit installation and permission boundaries for extension capabilities.'
          },
          account: {
            title: 'Cloud account',
            description: 'Manage explicit AGI Cloud sign-in while keeping local workspace chat independent.'
          }
        };
        var settingLabels = {
          apiEndpoint: 'API endpoint',
          model: 'Model',
          cliPath: 'CLI path',
          'composer.followUpBehavior': 'Active-turn send',
          contextLines: 'Context lines',
          telemetryEnabled: 'Telemetry',
          hoverEnabled: 'Hover actions',
          codeLensEnabled: 'Code lenses',
          autoApplyFixes: 'Auto-apply fixes',
          'inlineCompletions.enabled': 'Inline completions',
          'inlineCompletions.debounceMs': 'Inline completion delay',
          'inlineCompletions.maxLength': 'Inline completion length',
          'agent.mode': 'Agent mode',
          'agent.effort': 'Reasoning effort',
          'agent.thinking': 'Extended thinking',
          'desktopBridge.enabled': 'Desktop bridge',
          'desktopBridge.port': 'Desktop bridge port',
          telemetryEndpoint: 'Telemetry endpoint'
        };

        function setStatus(message, kind) {
          var status = document.getElementById('status');
          window.clearTimeout(statusTimer);
          status.textContent = message || '';
          status.dataset.kind = kind || '';
          if (message && kind !== 'error') {
            statusTimer = window.setTimeout(function () {
              status.textContent = '';
              status.dataset.kind = '';
            }, 2600);
          }
        }

        function updateNavOverflow() {
          if (!settingsNav || !navScrollBack || !navScrollForward) return;
          var maxScrollLeft = Math.max(0, settingsNav.scrollWidth - settingsNav.clientWidth);
          navScrollBack.hidden = maxScrollLeft <= 1 || settingsNav.scrollLeft <= 1;
          navScrollForward.hidden = maxScrollLeft <= 1 || settingsNav.scrollLeft >= maxScrollLeft - 1;
        }

        function scrollSettingsNav(direction) {
          if (!settingsNav) return;
          var distance = Math.max(160, Math.round(settingsNav.clientWidth * 0.7));
          if (typeof settingsNav.scrollBy === 'function') {
            settingsNav.scrollBy({ left: direction * distance, behavior: 'smooth' });
          } else {
            settingsNav.scrollLeft += direction * distance;
          }
          window.requestAnimationFrame(updateNavOverflow);
        }

        function setSection(section, moveFocus) {
          if (!sectionCopy[section]) return;
          activeSection = section;
          document.querySelectorAll('[data-settings-section]').forEach(function (panel) {
            panel.hidden = panel.getAttribute('data-settings-section') !== section;
          });
          document.querySelectorAll('.nav-button[data-section]').forEach(function (button) {
            var selected = button.getAttribute('data-section') === section;
            if (selected) {
              button.setAttribute('aria-current', 'page');
              // Below 760px the nav becomes a horizontal scroller wider than its
              // box, so a section selected from anywhere other than a click —
              // restored state, a deep link, keyboard navigation — left its own
              // tab off-screen with no indication of where you were.
              if (typeof button.scrollIntoView === 'function') {
                button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
              }
              window.requestAnimationFrame(updateNavOverflow);
            } else {
              button.removeAttribute('aria-current');
            }
          });
          document.getElementById('pageTitle').textContent = sectionCopy[section].title;
          document.getElementById('pageDescription').textContent = sectionCopy[section].description;
          if (moveFocus) {
            // The per-section <h2> blocks were removed: they restated the same
            // title and description the JS-driven page header already sets, so
            // every section rendered its heading twice, stacked. #pageTitle is
            // now the single heading and therefore the focus target.
            var heading = document.getElementById('pageTitle');
            if (heading) heading.focus();
          }
        }

        function applySnapshot(nextState) {
          state = nextState;
          document.querySelectorAll('[data-setting]').forEach(function (control) {
            var key = control.getAttribute('data-setting');
            if (!key || !Object.prototype.hasOwnProperty.call(state.values, key)) return;
            var value = state.values[key];
            if (control instanceof HTMLInputElement && control.type === 'checkbox') {
              control.checked = Boolean(value);
            } else if (
              control instanceof HTMLInputElement ||
              control instanceof HTMLSelectElement
            ) {
              control.value = String(value);
            }
            control.disabled = false;
          });

          var modelPreference = document.getElementById('setting-model');
          if (modelPreference) modelPreference.value = String(state.values.model || 'auto');

          // Raw id stays on the developer pill; the plan card gets the canonical
          // catalog label the rest of the product uses ("Max 15x", not "max 15x").
          document.getElementById('currentTier').textContent =
            String(state.values.currentTier || 'unknown');
          var tierLabelEl = document.getElementById('currentTierLabel');
          var tierSourceEl = document.getElementById('currentTierSource');
          var planSignInButton = document.getElementById('planSignInButton');
          var planBillingButton = document.getElementById('planBillingButton');
          var planUsageRow = document.getElementById('planUsageRow');
          var planUsageCopy = document.getElementById('planUsageCopy');
          var planUsageProgress = document.getElementById('planUsageProgress');
          var planUsageFill = document.getElementById('planUsageFill');
          var planStatus = document.getElementById('planStatus');
          var accountAuthStatus = state.accountStatus ||
            (state.accountConnected === null ? 'loading' : state.accountConnected ? 'signed-in' : 'signed-out');
          var identity = state.accountIdentity || null;
          var tierInfo = state.tierInfo || null;
          var connected = accountAuthStatus === 'signed-in';

          if (tierLabelEl) {
            tierLabelEl.textContent = connected && identity
              ? identity.planName + ' plan'
              : connected
                ? 'AGI Cloud account'
                : accountAuthStatus === 'expired'
                  ? 'Session expired'
                  : accountAuthStatus === 'loading'
                    ? 'Checking plan…'
                    : 'No AGI subscription connected';
          }
          if (tierSourceEl) {
            tierSourceEl.textContent = connected && identity
              ? identity.displayName + (identity.email ? ' · ' + identity.email : '')
              : connected
                ? 'Your editor session is active, but account details are temporarily unavailable.'
                : accountAuthStatus === 'expired'
                  ? 'Sign in again to restore AGI subscription access. Local and provider BYOK remain separate.'
                  : accountAuthStatus === 'loading'
                    ? 'Resolving the browser-approved AGI Cloud session.'
                    : 'Sign in for AGI subscription features. Local and provider BYOK do not require an AGI plan.';
          }
          if (planSignInButton) planSignInButton.hidden = connected || accountAuthStatus === 'loading';
          if (planBillingButton) planBillingButton.hidden = !connected;
          if (planUsageRow) planUsageRow.hidden = !connected || !tierInfo || typeof tierInfo.usagePercentage !== 'number';
          if (planUsageCopy && tierInfo && typeof tierInfo.usagePercentage === 'number') {
            var used = Math.max(0, Math.min(100, Math.round(tierInfo.usagePercentage)));
            var resetCopy = tierInfo.resetsAt
              ? ' · resets ' + new Date(tierInfo.resetsAt).toLocaleDateString()
              : '';
            planUsageCopy.textContent = used + '% used' + resetCopy;
            if (planUsageProgress) {
              planUsageProgress.setAttribute('aria-valuenow', String(used));
              planUsageProgress.setAttribute('aria-valuetext', used + '% used' + resetCopy);
              planUsageProgress.classList.toggle('is-warning', used >= 80);
            }
            if (planUsageFill) planUsageFill.style.width = used + '%';
          }
          if (planStatus) {
            var billingIssue = Boolean(tierInfo && tierInfo.accountPlanTier);
            var scheduledCancellation = Boolean(
              identity && identity.cancelAtPeriodEnd && identity.currentPeriodEnd
            );
            var cancellationDate = scheduledCancellation
              ? new Date(identity.currentPeriodEnd).toLocaleDateString()
              : '';
            var billingOwner = identity && identity.subscriptionSource === 'apple'
              ? 'Apple App Store'
              : identity && identity.subscriptionSource === 'google'
                ? 'Google Play'
                : identity && identity.subscriptionSource === 'stripe'
                  ? 'Web billing'
                  : identity && identity.subscriptionSource === 'manual'
                    ? 'Organization-managed billing'
                    : '';
            planStatus.textContent = billingIssue
              ? (tierInfo.accountPlanTier + ' billing needs attention. Managed developer access is paused; Local and provider BYOK remain available.')
              : scheduledCancellation
                ? identity.planName + ' remains active through ' + cancellationDate +
                  ', then ends.' + (billingOwner ? ' Billing owner: ' + billingOwner + '.' : '')
              : connected && !tierInfo
                ? 'Plan usage is temporarily unavailable. Your runtime boundary is unchanged.'
                : connected && billingOwner
                  ? 'Billing owner: ' + billingOwner + '.'
                  : '';
            planStatus.dataset.kind = billingIssue ? 'error' : '';
          }

          var trustPill = document.getElementById('trustPill');
          trustPill.textContent = state.workspaceTrusted
            ? 'Trusted workspace'
            : 'Restricted workspace';
          trustPill.classList.toggle('warning', !state.workspaceTrusted);

          var overrideNotice = document.getElementById('overrideNotice');
          if (state.workspaceOverrides.length > 0) {
            var labels = state.workspaceOverrides.map(function (key) {
              return settingLabels[key] || key;
            });
            // Carry the ACTION inside the notice rather than pointing at a
            // button elsewhere. The sidebar footer that holds "Open raw settings"
            // is display:none below 760px, so at narrow widths this text was
            // instructing the user to click a control they could not see.
            overrideNotice.textContent = '';
            var overrideText = document.createElement('span');
            overrideText.textContent =
              'Workspace settings currently override these user values: ' +
              labels.join(', ') +
              '. ';
            var overrideAction = document.createElement('button');
            overrideAction.type = 'button';
            overrideAction.className = 'override-notice-action';
            overrideAction.setAttribute('data-command', 'openRawSettings');
            overrideAction.textContent = 'Open raw settings';
            overrideNotice.appendChild(overrideText);
            overrideNotice.appendChild(overrideAction);
            overrideNotice.hidden = false;
          } else {
            overrideNotice.hidden = true;
            overrideNotice.textContent = '';
          }

          connected = state.accountConnected;
          var accountDot = document.getElementById('accountDot');
          var accountStatus = document.getElementById('accountStatus');
          var signInButton = document.getElementById('signInButton');
          var signOutButton = document.getElementById('signOutButton');
          accountDot.classList.toggle('connected', connected === true);
          if (accountAuthStatus === 'loading') {
            accountStatus.textContent = 'Checking AGI Cloud connection…';
            signInButton.hidden = true;
            signOutButton.hidden = true;
          } else if (accountAuthStatus === 'expired') {
            accountStatus.textContent = 'AGI Cloud session expired';
            signInButton.textContent = 'Sign in again';
            signInButton.hidden = false;
            signOutButton.hidden = true;
          } else if (connected) {
            accountStatus.textContent = identity
              ? identity.displayName + ' · ' + identity.planName + ' plan'
              : 'Connected to AGI Cloud · account details unavailable';
            signInButton.textContent = 'Sign in';
            signInButton.hidden = true;
            signOutButton.hidden = false;
          } else {
            accountStatus.textContent = 'AGI Cloud not connected';
            signInButton.textContent = 'Sign in';
            signInButton.hidden = false;
            signOutButton.hidden = true;
          }

          document.getElementById('agentConfigPath').textContent =
            state.agentConfigPath || '~/.agiworkforce/config.toml';

          var instructionContext = state.instructionContext || {
            host: '',
            workspace: '',
            effective: '',
            effectiveScope: 'none',
            turnPrelude: '',
            projectSources: []
          };
          var hostInstructions = document.getElementById('hostCustomInstructions');
          var workspaceInstructions = document.getElementById('workspaceCustomInstructions');
          if (document.activeElement !== hostInstructions) {
            hostInstructions.value = instructionContext.host || '';
          }
          if (document.activeElement !== workspaceInstructions) {
            workspaceInstructions.value = instructionContext.workspace || '';
          }
          updateInstructionCount('host');
          updateInstructionCount('workspace');
          document.getElementById('instructionPrelude').textContent =
            instructionContext.turnPrelude || 'No custom instructions are active.';

          var instructionSources = document.getElementById('instructionSources');
          instructionSources.textContent = '';
          var projectSources = Array.isArray(instructionContext.projectSources)
            ? instructionContext.projectSources
            : [];
          if (projectSources.length === 0) {
            var emptySource = document.createElement('li');
            emptySource.className = 'instruction-source';
            emptySource.textContent =
              'No AGENTS.md, CLAUDE.md, or .agiworkforce/instructions.md source was found.';
            instructionSources.appendChild(emptySource);
          } else {
            projectSources.forEach(function (source) {
              var item = document.createElement('li');
              item.className = 'instruction-source';
              var name = document.createElement('strong');
              name.textContent = source.fileName || 'Instruction file';
              var detail = document.createElement('span');
              detail.textContent =
                (source.truncated ? 'Preview truncated · ' : '') + (source.path || '');
              item.appendChild(name);
              item.appendChild(detail);
              instructionSources.appendChild(item);
            });
          }
        }

        function updateInstructionCount(scope) {
          var textarea = document.getElementById(
            scope === 'host' ? 'hostCustomInstructions' : 'workspaceCustomInstructions'
          );
          var count = document.getElementById(
            scope === 'host' ? 'hostInstructionCount' : 'workspaceInstructionCount'
          );
          count.textContent = textarea.value.length.toLocaleString() + ' / 8,000';
        }

        function readControlValue(control) {
          if (control instanceof HTMLInputElement && control.type === 'checkbox') {
            return control.checked;
          }
          if (control.getAttribute('data-kind') === 'number') {
            return Number(control.value);
          }
          return control.value;
        }

        document.querySelectorAll('.nav-button[data-section]').forEach(function (button) {
          button.addEventListener('click', function () {
            setSection(button.getAttribute('data-section'), true);
          });
        });

        if (settingsNav) settingsNav.addEventListener('scroll', updateNavOverflow, { passive: true });
        window.addEventListener('resize', updateNavOverflow);
        if (navScrollBack) {
          navScrollBack.addEventListener('click', function () { scrollSettingsNav(-1); });
        }
        if (navScrollForward) {
          navScrollForward.addEventListener('click', function () { scrollSettingsNav(1); });
        }

        document.querySelectorAll('[data-setting]').forEach(function (control) {
          control.addEventListener('change', function () {
            var key = control.getAttribute('data-setting');
            if (!key) return;
            control.disabled = true;
            setStatus('Saving ' + (settingLabels[key] || key) + '…');
            vscode.postMessage({
              type: 'settings.update',
              key: key,
              value: readControlValue(control)
            });
          });
        });

        // Delegated, not bound per element. querySelectorAll runs once at init,
        // so any [data-command] control created later — the override notice's
        // inline "Open raw settings" action, for one — silently did nothing when
        // clicked. Delegation covers every present and future command button.
        document.addEventListener('click', function (event) {
          var target = event.target;
          if (!(target instanceof Element)) return;
          var button = target.closest('[data-command]');
          if (!button) return;
          var command = button.getAttribute('data-command');
          if (!command) return;
          vscode.postMessage({ type: 'settings.command', command: command });
        });

        ['host', 'workspace'].forEach(function (scope) {
          var textarea = document.getElementById(
            scope === 'host' ? 'hostCustomInstructions' : 'workspaceCustomInstructions'
          );
          textarea.addEventListener('input', function () {
            updateInstructionCount(scope);
          });
        });

        document.querySelectorAll('[data-instruction-save]').forEach(function (button) {
          button.addEventListener('click', function () {
            var scope = button.getAttribute('data-instruction-save');
            if (scope !== 'host' && scope !== 'workspace') return;
            var textarea = document.getElementById(
              scope === 'host' ? 'hostCustomInstructions' : 'workspaceCustomInstructions'
            );
            setStatus('Saving ' + (scope === 'host' ? 'host instructions' : 'workspace override') + '…');
            vscode.postMessage({
              type: 'settings.instructions.update',
              scope: scope,
              value: textarea.value
            });
          });
        });

        window.addEventListener('message', function (event) {
          var message = event.data;
          if (!message || typeof message !== 'object') return;
          if (message.type === 'settings.snapshot') {
            applySnapshot(message.state);
          } else if (message.type === 'settings.saved') {
            setStatus((settingLabels[message.key] || message.key) + ' saved.');
          } else if (message.type === 'settings.instructions.saved') {
            setStatus(
              message.scope === 'workspace'
                ? 'Workspace instruction override saved.'
                : 'Host instructions saved.'
            );
          } else if (message.type === 'settings.error') {
            setStatus(message.message || 'The setting could not be saved.', 'error');
            applySnapshot(state);
          } else if (message.type === 'settings.navigate') {
            setSection(message.section, true);
          }
        });

        applySnapshot(state);
        setSection(activeSection, false);
        updateNavOverflow();
        vscode.postMessage({ type: 'settings.ready' });
      })();
    </script>
  </body>
</html>`;
}
