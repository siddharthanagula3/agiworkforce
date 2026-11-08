import process from 'node:process';
import console from 'node:console';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

export function chromeArtifactParentOrigin(extensionId) {
  if (typeof extensionId !== 'string' || !/^[a-p]{32}$/u.test(extensionId)) {
    throw new Error('CWS_EXTENSION_ID must be the exact 32-letter Chrome extension ID.');
  }
  return `chrome-extension://${extensionId}`;
}

export function configureSandboxParent(html, configuration, extensionId) {
  const origin = chromeArtifactParentOrigin(extensionId);
  const declaration = /const CONFIGURED_EXTENSION_ORIGINS = \[[^\]]*\];/gu;
  if ([...html.matchAll(declaration)].length !== 1) {
    throw new Error('The artifact renderer extension-parent declaration is missing or ambiguous.');
  }
  const configuredHtml = html.replace(
    declaration,
    `const CONFIGURED_EXTENSION_ORIGINS = ${JSON.stringify([origin])};`,
  );
  const configured = globalThis.structuredClone(configuration);
  const policies = configured.headers
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === 'content-security-policy');
  if (policies.length !== 1 || !/frame-ancestors [^;]+/u.test(policies[0].value)) {
    throw new Error('The artifact renderer must declare exactly one frame-ancestors policy.');
  }
  policies[0].value = policies[0].value.replace(/frame-ancestors ([^;]+)/u, (_match, sources) => {
    const parents = sources
      .split(/\s+/u)
      .filter((source) => !source.startsWith('chrome-extension:'));
    return `frame-ancestors ${[...parents, origin].join(' ')}`;
  });
  return { html: configuredHtml, configuration: configured, origin };
}

export async function readConfiguredSandbox(directory, extensionId) {
  const html = await readFile(resolve(directory, 'index.html'), 'utf8');
  const configuration = JSON.parse(await readFile(resolve(directory, 'vercel.json'), 'utf8'));
  return configureSandboxParent(html, configuration, extensionId);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(process.argv[2] ?? fileURLToPath(new URL('.', import.meta.url)));
  const configured = await readConfiguredSandbox(directory, process.env.CWS_EXTENSION_ID);
  await writeFile(resolve(directory, 'index.html'), configured.html);
  await writeFile(
    resolve(directory, 'vercel.json'),
    `${JSON.stringify(configured.configuration, null, 2)}\n`,
  );
  console.log(`Artifact renderer admits exactly ${configured.origin} in both parent checks.`);
}
