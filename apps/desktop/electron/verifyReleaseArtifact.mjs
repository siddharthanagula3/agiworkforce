import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function verifyMacIconArtwork(icon, artwork) {
  const pngTypes = new Set(['ic09', 'ic14']);
  if (
    icon.length < 8 ||
    icon.toString('ascii', 0, 4) !== 'icns' ||
    icon.readUInt32BE(4) !== icon.length
  ) {
    throw new Error('The packaged macOS icon is not a valid ICNS file.');
  }
  for (let offset = 8; offset < icon.length;) {
    const end = offset + (offset + 8 <= icon.length ? icon.readUInt32BE(offset + 4) : 0);
    if (end < offset + 8 || end > icon.length) {
      throw new Error('The packaged macOS icon has an invalid ICNS entry.');
    }
    const type = icon.toString('ascii', offset, offset + 4);
    if (type === 'ic09' || type === 'ic14') {
      if (!pngTypes.delete(type) || !icon.subarray(offset + 8, end).equals(artwork)) {
        throw new Error('The packaged macOS icon does not use the current AGI artwork.');
      }
    }
    offset = end;
  }
  if (pngTypes.size !== 0) {
    throw new Error('The packaged macOS icon is missing a 512 pixel rendition.');
  }
}

// afterPack runs before code signing/notarization: reject a leaky renderer
// before any application payload is submitted to Apple or a release service.
export default async function verifyReleaseArtifact(context) {
  const artifact =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
      : context.appOutDir;
  if (context.electronPlatformName === 'darwin') {
    const contents = path.join(artifact, 'Contents');
    const iconName = spawnSync(
      '/usr/bin/plutil',
      ['-extract', 'CFBundleIconFile', 'raw', path.join(contents, 'Info.plist')],
      { encoding: 'utf8' },
    );
    if (iconName.status !== 0 || iconName.stdout.trim() !== 'icon.icns') {
      throw new Error('The macOS bundle does not point to the AGI app icon.');
    }
    const expected = readFileSync(
      path.join(repo, 'apps', 'desktop', 'electron', 'resources', 'icon.icns'),
    );
    const packaged = readFileSync(path.join(contents, 'Resources', 'icon.icns'));
    verifyMacIconArtwork(
      packaged,
      readFileSync(path.join(repo, 'apps', 'web', 'public', 'logo-512.png')),
    );
    if (!packaged.equals(expected)) {
      throw new Error('The packaged macOS icon differs from the AGI app icon.');
    }
  }
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
