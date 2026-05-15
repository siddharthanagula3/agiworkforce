# Light theme strategy for `[data-design='agi']` pages

Marketing pages (`/pricing`, `/login`, `/partner-perks`, etc.) use CSS custom properties
(`--agi-bg`, `--agi-ink`, etc.) scoped to the `[data-design='agi']` attribute. The default
values are dark-surfaced. To activate light mode, set `data-theme="light"` on `<html>` or any
ancestor element.

The override block lives at the bottom of `app/globals.css` under the comment
"light-mode token overrides". A theme switcher UI component (and user preference persistence)
is a separate UX decision deferred to a later sprint.
