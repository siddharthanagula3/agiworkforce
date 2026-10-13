import { expect, test } from '@playwright/test';
import { clientMarkerExecution } from './lib/public-runtime-browser';

test('real browser coverage distinguishes a defined client render from an invoked one', async ({
  page,
}) => {
  const marker = 'public-runtime-instrument-marker';
  const script = `function publicRuntimeInstrumentRender() { return { id: '${marker}' }; }\n//# sourceURL=public-runtime-instrument.js`;
  const session = await page.context().newCDPSession(page);
  await session.send('Debugger.enable');
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  await page.addScriptTag({ content: script });
  const uninvoked = await session.send('Profiler.takePreciseCoverage');
  const definition = uninvoked.result.find(
    (entry: { url: string }) => entry.url === 'public-runtime-instrument.js',
  );
  if (!definition) throw new Error('Defined browser script is missing from V8 coverage');
  expect(() => clientMarkerExecution(script, definition.functions, marker)).toThrow(
    'not uniquely observed executing',
  );
  await page.evaluate(() => {
    const render = (window as unknown as { publicRuntimeInstrumentRender: () => { id: string } })
      .publicRuntimeInstrumentRender;
    return render();
  });
  const invoked = await session.send('Profiler.takePreciseCoverage');
  const execution = invoked.result.find(
    (entry: { url: string }) => entry.url === 'public-runtime-instrument.js',
  );
  if (!execution) throw new Error('Invoked browser script is missing from V8 coverage');
  expect(clientMarkerExecution(script, execution.functions, marker).count).toBeGreaterThan(0);
  await session.send('Profiler.stopPreciseCoverage');
  await session.detach();
});

test('a state marker outside a function cannot borrow enclosing script coverage', () => {
  const script = "const marker = 'public-runtime-marker';";
  expect(() =>
    clientMarkerExecution(
      script,
      [{ ranges: [{ startOffset: 0, endOffset: script.length, count: 1 }] }],
      'public-runtime-marker',
    ),
  ).toThrow('hoisted outside a render return');
});

test('an invoked module factory cannot lend coverage to a hoisted marker and uncalled render', async ({
  page,
}) => {
  const script =
    "(function moduleFactory(){ const id='public-runtime-marker'; function render(){return {id}} })();\n//# sourceURL=public-runtime-hoisted.js";
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable');
  await session.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  await page.addScriptTag({ content: script });
  const coverage = await session.send('Profiler.takePreciseCoverage');
  const generated = coverage.result.find(
    (entry: { url: string }) => entry.url === 'public-runtime-hoisted.js',
  );
  if (!generated) throw new Error('Module factory is missing from V8 coverage');
  expect(
    generated.functions.some(
      (fn: { functionName: string; ranges: { count: number }[] }) =>
        fn.functionName === 'moduleFactory' && (fn.ranges[0]?.count ?? 0) > 0,
    ),
  ).toBe(true);
  expect(() => clientMarkerExecution(script, generated.functions, 'public-runtime-marker')).toThrow(
    'hoisted outside a render return',
  );
  await session.send('Profiler.stopPreciseCoverage');
  await session.detach();
});

test('two unrelated client functions cannot share one execution witness', () => {
  const script =
    "function first(){return 'public-runtime-marker'} function second(){return 'public-runtime-marker'}";
  expect(() =>
    clientMarkerExecution(
      script,
      [{ ranges: [{ startOffset: 0, endOffset: script.length, count: 1 }] }],
      'public-runtime-marker',
    ),
  ).toThrow('no unique generated function');
});
