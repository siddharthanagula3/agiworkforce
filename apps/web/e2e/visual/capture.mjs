import { chromium } from 'playwright';
const B = process.env.BASE || 'http://localhost:3100';
const OUT = process.env.OUT;
const ROUTES = (
  process.env.ROUTES || '/,/pricing,/business,/desktop,/docs,/login,/enterprise,/agi-code'
).split(',');
const br = await chromium.launch();
for (const theme of ['light', 'dark']) {
  for (const vp of [
    { width: 1440, height: 900, tag: 'd' },
    { width: 390, height: 844, tag: 'm' },
  ]) {
    const ctx = await br.newContext({
      viewport: { width: vp.width, height: vp.height },
      colorScheme: theme,
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('theme', t);
      } catch (storageUnavailable) {
        // A hardened context can refuse storage; the colorScheme option and the
        // explicit class swap below already pin the theme without it.
        void storageUnavailable;
      }
    }, theme);
    const p = await ctx.newPage();
    for (const r of ROUTES) {
      try {
        await p.goto(B + r, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await p.waitForTimeout(1500);
        await p.evaluate((t) => {
          const h = document.documentElement;
          h.classList.remove('light', 'dark');
          h.classList.add(t);
        }, theme);
        // Without this the capture is not an oracle: twelve of thirty-two
        // frames differ between two identical runs.
        await p.addStyleTag({
          content: `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`,
        });
        await p.waitForTimeout(400);
        const name = r.replace(/\//g, '_') || '_root';
        await p.screenshot({ path: `${OUT}/${name}-${theme}-${vp.tag}.png`, fullPage: false });
      } catch (e) {
        console.log('skip', r, String(e).slice(0, 60));
      }
    }
    await ctx.close();
  }
}
await br.close();
console.log('captured ->', OUT);
