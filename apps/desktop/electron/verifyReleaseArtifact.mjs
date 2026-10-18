import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// afterPack runs before code signing/notarization: reject a leaky renderer
// before any application payload is submitted to Apple or a release service.
export default async function verifyReleaseArtifact(context) {
  const artifact =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
      : context.appOutDir;
  const result = spawnSync(
    process.execPath,
    [path.join(repo, 'scripts/release/scan-release-artifact.mjs'), artifact],
    { cwd: repo, encoding: 'utf8' },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Release artifact refused before signing/notarization: ${result.stderr || result.error?.message || 'scan failed'}`,
    );
  }
}
