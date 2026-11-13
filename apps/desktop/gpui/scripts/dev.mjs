import { execFileSync, spawnSync } from 'node:child_process';
import console from 'node:console';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { PRODUCT_NAMES } from '../../../../packages/contracts/types/src/product-names.ts';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const hostName = 'agiworkforce-desktop-gpui';
const bundleOnly = process.argv.includes('--bundle-only');
const nativeArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== '--bundle-only' && argument !== '--');
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('cargo', ['build', '-p', hostName, '-p', 'agiworkforce-cli', '--bins']);
run(process.execPath, ['apps/desktop/gpui/scripts/notices.mjs', '--check']);
run(process.execPath, ['apps/cli/scripts/generate-third-party-notices.mjs', '--check']);
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: root,
    encoding: 'utf8',
  }),
);
const binary = path.join(metadata.target_directory, 'debug', hostName);
const cli = metadata.packages.find((pkg) => pkg.name === 'agiworkforce-cli');
const cliExecutable = cli?.default_run;
if (
  !cliExecutable ||
  !cli.targets.some((target) => target.kind.includes('bin') && target.name === cliExecutable)
) {
  throw new Error('The CLI package must declare its default executable.');
}
const runtime = path.join(
  metadata.target_directory,
  'debug',
  process.platform === 'win32' ? `${cliExecutable}.exe` : cliExecutable,
);
if (process.platform !== 'darwin') {
  run(process.platform === 'win32' ? `${binary}.exe` : binary, [
    '--runtime',
    runtime,
    ...nativeArguments,
  ]);
} else {
  const app = path.join(metadata.target_directory, 'gpui-dev', `${PRODUCT_NAMES.desktop}.app`);
  const executableDir = path.join(app, 'Contents', 'MacOS');
  const resourcesDir = path.join(app, 'Contents', 'Resources');
  fs.mkdirSync(executableDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  const executable = path.join(executableDir, hostName);
  fs.copyFileSync(binary, `${executable}.next`);
  fs.renameSync(`${executable}.next`, executable);
  const bundledRuntime = path.join(executableDir, path.basename(runtime));
  fs.copyFileSync(runtime, `${bundledRuntime}.next`);
  fs.renameSync(`${bundledRuntime}.next`, bundledRuntime);
  fs.writeFileSync(
    path.join(resourcesDir, 'THIRD_PARTY_NOTICES.txt'),
    execFileSync(binary, ['--licenses'], { cwd: root, encoding: 'utf8' }),
  );
  fs.copyFileSync(
    path.join(root, 'apps/cli/assets/THIRD_PARTY_NOTICES.txt'),
    path.join(resourcesDir, 'CLI_THIRD_PARTY_NOTICES.txt'),
  );
  fs.writeFileSync(
    path.join(resourcesDir, 'native-runtime.json'),
    JSON.stringify({
      executable: path.basename(bundledRuntime),
      version: cli.version,
    }) + '\n',
  );
  const tauri = JSON.parse(
    fs.readFileSync(path.join(root, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'),
  );
  const packageInfo = metadata.packages.find((pkg) => pkg.name === hostName);
  const xml = (value) =>
    String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const fields = {
    CFBundleExecutable: hostName,
    CFBundleIdentifier: `${tauri.identifier}.gpui.dev`,
    CFBundleName: PRODUCT_NAMES.desktop,
    CFBundleDisplayName: `${PRODUCT_NAMES.desktop} (GPUI development)`,
    CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: packageInfo.version,
    CFBundleVersion: packageInfo.version,
    NSPrincipalClass: 'NSApplication',
  };
  fs.writeFileSync(
    path.join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>${Object.entries(fields)
      .map(([key, value]) => `<key>${xml(key)}</key><string>${xml(value)}</string>`)
      .join('')}
<key>NSHighResolutionCapable</key><true/></dict></plist>\n`,
  );
  run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  if (bundleOnly) {
    console.log(app);
  } else {
    run('/usr/bin/open', [
      '-n',
      '-W',
      app,
      '--args',
      '--runtime',
      bundledRuntime,
      ...nativeArguments,
    ]);
  }
}
