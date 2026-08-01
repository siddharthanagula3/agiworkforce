# apps/mobile/src/features/legal

Status: Current
Owner role: Mobile lead
Last updated: 2026-08-01
Purpose: In-app legal notices — currently the open-source attribution list required for store review.

## Public API

- `index.ts` is the only import surface for route screens: `OSS_PACKAGES`,
  `OSS_LICENSE_BODIES`, `OSS_LICENSES_GENERATED_AT`, and `groupOssPackages()`.
- `types.ts` owns the record shapes.
- `licenses.generated.ts` is generated — do not edit it by hand.

## Generating

```bash
node apps/mobile/scripts/generate-oss-licenses.mjs
```

The script walks the app's production dependency graph (`dependencies`, then
each resolved package's own `dependencies`; devDependencies and first-party
`@agiworkforce/*` packages are excluded), reads each package's declared license
id and bundled license file, and writes the generated module. Re-run it after
changing dependencies and commit the result: the screen renders the generated
data directly, so a stale file is a stale attribution notice.

License bodies are deduplicated — packages that ship byte-identical text share
one body, and each package keeps its own copyright line. Only lines that carry
a year or a (c)/© mark are treated as copyright attribution, because license
bodies themselves contain lines starting with the word "copyright".

## Notes

- About → Open Source Licenses opens `app/(app)/legal/licenses.tsx` in-app.
  It previously opened `https://agiworkforce.com/licenses`, a URL with no route
  behind it.
- Packages that ship no license file are still listed, under their declared
  SPDX id, with the missing text stated plainly rather than implied.
