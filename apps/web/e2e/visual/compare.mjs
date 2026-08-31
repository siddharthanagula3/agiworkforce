import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const [dirA, dirB] = process.argv.slice(2);
const CHANNEL_TOLERANCE = 8; // below this a difference is antialiasing, not design
const PIXEL_BUDGET = 0.02; // percent of the frame allowed to differ at all
const br = await chromium.launch();
const p = await br.newPage();
const enc = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const files = fs
  .readdirSync(dirA)
  .filter((f) => f.endsWith('.png') && fs.existsSync(path.join(dirB, f)));
let regressions = 0;
for (const f of files) {
  const r = await p.evaluate(
    async ([A, B, tol]) => {
      const load = (s) =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = s;
        });
      const [ia, ib] = await Promise.all([load(A), load(B)]);
      const w = Math.max(ia.width, ib.width),
        h = Math.max(ia.height, ib.height);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.drawImage(ia, 0, 0);
      const da = x.getImageData(0, 0, w, h).data;
      x.clearRect(0, 0, w, h);
      x.drawImage(ib, 0, 0);
      const db = x.getImageData(0, 0, w, h).data;
      let any = 0,
        significant = 0,
        maxDelta = 0,
        bbox = null;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(
          Math.abs(da[i] - db[i]),
          Math.abs(da[i + 1] - db[i + 1]),
          Math.abs(da[i + 2] - db[i + 2]),
        );
        if (d === 0) continue;
        any++;
        maxDelta = Math.max(maxDelta, d);
        if (d > tol) {
          significant++;
          const px = (i / 4) % w,
            py = Math.floor(i / 4 / w);
          bbox = bbox
            ? [
                Math.min(bbox[0], px),
                Math.min(bbox[1], py),
                Math.max(bbox[2], px),
                Math.max(bbox[3], py),
              ]
            : [px, py, px, py];
        }
      }
      const total = w * h;
      return {
        anyPct: +((100 * any) / total).toFixed(4),
        sigPct: +((100 * significant) / total).toFixed(4),
        maxDelta,
        bbox,
      };
    },
    [enc(path.join(dirA, f)), enc(path.join(dirB, f)), CHANNEL_TOLERANCE],
  );
  const regressed = r.sigPct > PIXEL_BUDGET;
  if (regressed) regressions++;
  if (r.anyPct > 0) {
    console.log(
      `${regressed ? 'REGRESSION' : 'ok        '} ${f.padEnd(28)} any ${String(r.anyPct).padStart(7)}%  significant ${String(r.sigPct).padStart(7)}%  maxΔ ${String(r.maxDelta).padStart(3)}${r.bbox ? '  bbox ' + r.bbox.join(',') : ''}`,
    );
  }
}
console.log(
  `\n${files.length} compared, ${regressions} regression(s) beyond ${PIXEL_BUDGET}% at channel tolerance ${CHANNEL_TOLERANCE}`,
);
await br.close();
process.exit(regressions ? 1 : 0);
