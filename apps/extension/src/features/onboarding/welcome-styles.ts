import { getExtensionTokensCssAuto } from '../../tokens';

export function welcomeStyles(): string {
  return `
    ${getExtensionTokensCssAuto()}
    body { font: 1rem/1.55 system-ui, sans-serif; color: var(--agi-ext-text); background: var(--agi-ext-bg); }
    .wl-page { width: min(100% - 2.5rem, 46rem); margin: auto; padding-bottom: 4rem; }
    .wl-bar { display: flex; align-items: center; justify-content: space-between; padding-block: 1rem; border-bottom: 1px solid var(--agi-ext-border); }
    .wl-settings, .wl-btn { font: inherit; font-weight: 550; cursor: pointer; }
    .wl-settings { display: inline-flex; align-items: center; gap: .5rem; background: transparent; color: var(--agi-ext-text-muted); border: 0; min-height: 44px; }
    .wl-settings:hover, summary:hover { color: var(--agi-ext-text); }
    .wl-header { padding-block: clamp(2.5rem, 7vw, 5rem) 2.5rem; }
    .wl-title { font-size: clamp(2.5rem, 6vw, 4rem); letter-spacing: -.055em; line-height: 1.06; font-weight: 620; }
    .wl-lead { max-width: 48ch; margin-block: 1rem 1.5rem; font-size: 1.125rem; color: var(--agi-ext-text-muted); }
    .wl-actions { display: flex; flex-wrap: wrap; gap: .65rem; }
    .wl-btn { padding: .55rem 1.1rem; min-height: 44px; border-radius: var(--corner-menu); background: transparent; border: 1px solid var(--agi-ext-border-control); color: var(--agi-ext-text); }
    .wl-btn-primary { color: var(--agi-ext-on-primary); background: var(--agi-ext-primary); border-color: transparent; }
    .wl-btn-primary:hover { background: var(--agi-ext-primary-hover); }
    .wl-btn:disabled { cursor: wait; opacity: .7; }
    .wl-header [role=status]:not(:empty) { margin-top: .65rem; }
    .wl-text, .wl-list { color: var(--agi-ext-text-muted); }
    .wl-card, .wl-scope { border-top: 1px solid var(--agi-ext-border); padding-block: 1.2rem; }
    .wl-card-title, .wl-scope > summary { font-size: 1.125rem; font-weight: 600; }
    .wl-card-body { margin-top: .4rem; }
    .wl-scope .wl-card { border: 0; padding-block: .8rem 0; }
    .wl-scope .wl-card-title { font-size: 1rem; }
    .wl-list { padding-inline-start: 1.2rem; }
    summary { cursor: pointer; min-height: 44px; align-content: center; }
    .wl-scope { padding-block: .5rem; }
    .wl-warning { margin-bottom: 1rem; }
    .wl-details { border-top: 1px solid var(--agi-ext-border); }
    .wl-details p { padding-block: .25rem 1rem; }
    .wl-link { color: var(--agi-ext-accent-text); text-underline-offset: .18em; }
    .wl-page :focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 3px; }
  `;
}
