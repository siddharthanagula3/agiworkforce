# Legacy desktop locale copy — not loaded at runtime

Desktop translates through `@agiworkforce/i18n` (`packages/ui/i18n/locales`).
Nothing here is bundled: `src/i18n/index.ts` never reads this directory, so a
key added here renders as its own name in the running app — that is exactly how
the sidebar shipped literal `sidebar.noConversations` text (native WDIO run,
2026-08-01).

The other 95 bundles were deleted for that reason. `en/v3.json` survives only
because `src/stores/__tests__/appModeStore.desktopCloudGate.test.ts` still
imports it as a fixture; repoint that assertion at the shared corpus and this
directory can go too.

Add translations to `packages/ui/i18n/locales/<lang>/` instead, and keep every
locale at parity (`pnpm check:i18n-parity`).
