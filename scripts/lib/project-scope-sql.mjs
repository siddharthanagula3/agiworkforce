import { readFileSync } from 'node:fs';
import path from 'node:path';
import { stripComments } from './module-graph.mjs';

export const PROJECT_READ_SCOPE_OWNER = 'apps/web/lib/server/project-read-access.ts';

export function expandProjectReadScope(sql, source, relativePath, repoRoot) {
  const reference = /\$\{\s*READABLE_PROJECT_SCOPE_SQL\s*\}/g;
  if (!reference.test(sql)) return sql;
  const clean = stripComments(source);
  const ownerPath = path.resolve(repoRoot, PROJECT_READ_SCOPE_OWNER);
  let bound = path.resolve(repoRoot, relativePath) === ownerPath;
  if (!bound) {
    if (/\b(?:const|let|var|function)\s+READABLE_PROJECT_SCOPE_SQL\b/.test(clean)) return sql;
    for (const declaration of clean.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      if (!declaration[1].split(',').some((item) => item.trim() === 'READABLE_PROJECT_SCOPE_SQL'))
        continue;
      const specifier = declaration[2];
      const target = specifier.startsWith('@/')
        ? path.resolve(repoRoot, 'apps/web', specifier.slice(2))
        : specifier.startsWith('.')
          ? path.resolve(repoRoot, path.dirname(relativePath), specifier)
          : null;
      if (target && `${target.replace(/\.ts$/, '')}.ts` === ownerPath) bound = true;
    }
  }
  if (!bound) return sql;
  let owner;
  try {
    owner = stripComments(readFileSync(ownerPath, 'utf8'));
  } catch {
    return sql;
  }
  const fragment = /export\s+const\s+READABLE_PROJECT_SCOPE_SQL\s*=\s*`([^`]+)`/.exec(owner)?.[1];
  if (!fragment || fragment.includes('${')) return sql;
  return sql.replace(reference, `(${fragment})`);
}
