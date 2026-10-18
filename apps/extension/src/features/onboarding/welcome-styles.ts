import { getExtensionTokensCssAuto } from '../../tokens';

export function welcomeStyles(): string {
  return `
    ${getExtensionTokensCssAuto()}

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: var(--agi-ext-text);
      background: var(--agi-ext-bg);
    }

    .wl-page {
      max-width: 640px;
      margin: 0 auto;
      padding: 40px 16px 56px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .wl-title {
      font-size: 24px;
      line-height: 1.25;
      font-weight: 700;
    }

    .wl-lead {
      margin-top: 6px;
      color: var(--agi-ext-text-muted);
    }

    .wl-card {
      background: var(--agi-ext-surface);
      border: 1px solid var(--agi-ext-border);
      border-radius: 10px;
      padding: 16px;
      min-width: 0;
    }

    .wl-card-title {
      font-size: 15px;
      font-weight: 600;
    }

    .wl-card-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }

    .wl-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }

    .wl-text {
      color: var(--agi-ext-text-muted);
    }

    .wl-warning {
      color: var(--agi-ext-text);
    }

    .wl-list {
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      color: var(--agi-ext-text-muted);
    }

    .wl-details summary {
      cursor: pointer;
      min-height: 24px;
      font-weight: 500;
    }

    .wl-details p {
      margin-top: 6px;
    }

    .wl-link {
      color: var(--agi-ext-accent-text);
    }

    .wl-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .wl-btn {
      min-height: 32px;
      padding: 6px 16px;
      border-radius: 6px;
      font: inherit;
      font-weight: 500;
      cursor: pointer;
      align-self: flex-start;
    }

    .wl-btn-primary {
      background: var(--agi-ext-primary);
      color: var(--agi-ext-on-primary);
      border: 0;
    }

    .wl-btn-primary:hover:not(:disabled) {
      background: var(--agi-ext-primary-hover);
    }

    .wl-btn-secondary {
      background: none;
      color: var(--agi-ext-text);
      border: 1px solid var(--agi-ext-border);
    }

    .wl-btn:disabled {
      cursor: wait;
      opacity: 0.7;
    }

    .wl-btn:focus-visible,
    .wl-link:focus-visible,
    .wl-details summary:focus-visible {
      outline: 2px solid var(--agi-ext-focus);
      outline-offset: 2px;
    }
  `;
}
