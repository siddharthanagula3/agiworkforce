import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('vendored provider marks', () => {
  it('match the official vectors the vendoring script produces', () => {
    const result = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '../scripts/vendor-provider-marks.mjs'), '--check'],
      { encoding: 'utf8' },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
  });
});
