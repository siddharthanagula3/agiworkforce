import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pythonFigureProvenanceBootstrap } from '../python-figure-provenance';
import { readPngRenderIdentity } from '../png-render-identity';
import { groupGeneratedImageOutputs } from '@/features/chat/utils/turn-artifacts';

const python = process.env['AGI_FIGURE_TEST_PYTHON'];
const executionId = '123e4567-e89b-12d3-a456-426614174000';

// llm-guardrail-allow: requires AGI_FIGURE_TEST_PYTHON with Matplotlib and IPython; verified with the local interpreter.
describe.skipIf(!python)('Matplotlib execution output identity', () => {
  it('keeps standard-library execution quiet when Matplotlib is unavailable', () => {
    const script = String.raw`
import builtins, contextlib, io, json
original_import = builtins.__import__
def without_matplotlib(name, *args, **kwargs):
    if name.startswith("matplotlib"):
        raise ImportError("not installed")
    return original_import(name, *args, **kwargs)
builtins.__import__ = without_matplotlib
stderr = io.StringIO()
with contextlib.redirect_stderr(stderr):
${pythonFigureProvenanceBootstrap(executionId)
  .split('\n')
  .map((line) => '    ' + line)
  .join('\n')}
builtins.__import__ = original_import
print(json.dumps({"result": sum([1, 2]), "stderr": stderr.getvalue()}))
`;
    const result = JSON.parse(
      execFileSync(python!, ['-c', script], { encoding: 'utf8', timeout: 30_000 }),
    ) as { result: number; stderr: string };
    expect(result).toEqual({ result: 3, stderr: '' });
  });

  it.each(['hash-failure', 'pixel-budget'])(
    'preserves all image outputs and emits one bounded diagnostic for %s',
    (failure) => {
      const script = String.raw`
import base64, contextlib, io, json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backend_bases import FigureCanvasBase
from PIL import Image
failure = ${JSON.stringify(failure)}
original = FigureCanvasBase.print_figure
def injected_failure(canvas, filename, dpi=None, facecolor=None, edgecolor=None, orientation="portrait", format=None, *, bbox_inches=None, pad_inches=None, bbox_extra_artists=None, backend=None, **kwargs):
    if (kwargs.get("metadata") or {}).get("Software") == "agi-figure-render-state-v1":
        raise RuntimeError("sensitive internal exception source")
    return original(canvas, filename, dpi=dpi, facecolor=facecolor, edgecolor=edgecolor, orientation=orientation, format=format, bbox_inches=bbox_inches, pad_inches=pad_inches, bbox_extra_artists=bbox_extra_artists, backend=backend, **kwargs)
if failure == "hash-failure":
    FigureCanvasBase.print_figure = injected_failure
${pythonFigureProvenanceBootstrap(executionId)}
fig, ax = plt.subplots(figsize=(30, 30) if failure == "pixel-budget" else (4, 3))
ax.plot([1, 2, 3])
outputs = []
stderr = io.StringIO()
with contextlib.redirect_stderr(stderr):
    for dpi in ([5, 7] if failure == "pixel-budget" else [80, 160]):
        image = io.BytesIO()
        fig.savefig(image, format="png", dpi=dpi)
        Image.open(image).load()
        outputs.append(base64.b64encode(image.getvalue()).decode("ascii"))
print(json.dumps({"outputs": outputs, "stderr": stderr.getvalue()}))
`;
      const result = JSON.parse(
        execFileSync(python!, ['-c', script], {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            MPLCONFIGDIR: '/private/tmp/agi-figure-provenance-config',
            XDG_CACHE_HOME: '/private/tmp/agi-figure-provenance-cache',
          },
        }),
      ) as { outputs: string[]; stderr: string };
      expect(result.outputs).toHaveLength(2);
      expect(result.stderr.trim().split('\n')).toHaveLength(1);
      expect(result.stderr).toContain('all chart files are kept');
      expect(result.stderr).not.toMatch(/sensitive|RuntimeError|Traceback/);
      const files = result.outputs.map((output, index) => {
        const bytes = Buffer.from(output, 'base64');
        expect(readPngRenderIdentity(bytes)).toBeUndefined();
        return {
          id: `output-${index}`,
          uri: `/api/files/output-${index}`,
          kind: 'image',
          mimeType: 'image/png',
          checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        };
      });
      expect(groupGeneratedImageOutputs(files)).toEqual({ images: files, aliases: [] });
    },
  );

  it('groups the exact savefig and actual inline plt.show outputs, preserving changed data, labels and separate charts', () => {
    const script = String.raw`
import base64, io, json, pathlib, tempfile
from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output
shell = InteractiveShell.instance()
import matplotlib
matplotlib.use("module://matplotlib_inline.backend_inline")
from matplotlib_inline.backend_inline import configure_inline_support, set_matplotlib_formats
configure_inline_support(shell, "module://matplotlib_inline.backend_inline")
set_matplotlib_formats("retina")
import matplotlib.pyplot as plt
from PIL import Image
${pythonFigureProvenanceBootstrap(executionId)}
def png_output(captured):
    return next(entry.data["image/png"] for entry in captured.outputs if "image/png" in entry.data)
with tempfile.TemporaryDirectory() as directory:
    with capture_output() as shown:
        sales = [120, 190, 155, 280, 310, 260]
        months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
        print(f"Total sales: {sum(sales)}")
        print(f"Average sales: {sum(sales) / len(sales):.2f}")
        print(f"Maximum sales: {max(sales)}")
        fig, axes = plt.subplots(1, 2, figsize=(11, 4.5))
        axes[0].bar(months, sales, color="steelblue")
        axes[0].set(title="Monthly Sales - Bar Chart", xlabel="Month", ylabel="Sales")
        axes[1].plot(months, sales, marker="o", color="darkorange", linewidth=2)
        axes[1].set(title="Monthly Sales - Line Chart", xlabel="Month", ylabel="Sales")
        fig.tight_layout()
        original_canvas, original_dpi = fig.canvas, fig.dpi
        path = pathlib.Path(directory) / "monthly_sales_charts.png"
        fig.savefig(path, dpi=160, bbox_inches="tight")
        save_preserved_canvas = fig.canvas is original_canvas
        plt.show()
    saved = base64.b64encode(path.read_bytes()).decode("ascii")
    from IPython.display import display
    axes[1].lines[0].set_ydata([120, 190, 155, 280, 310, 300])
    with capture_output() as changed:
        display(fig)
    axes[1].set_title("Updated labels")
    with capture_output() as relabeled:
        display(fig)
    with capture_output() as separate:
        other, ax = plt.subplots()
        ax.bar(["Research", "Coding"], [25, 35])
        plt.show()
    print(json.dumps({"saved": saved, "shown": png_output(shown), "changed": png_output(changed), "relabeled": png_output(relabeled), "separate": png_output(separate), "stdout": shown.stdout, "same_canvas": save_preserved_canvas, "same_dpi": fig.dpi == original_dpi}))
`;
    const result = JSON.parse(
      execFileSync(python!, ['-c', script], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          MPLCONFIGDIR: '/private/tmp/agi-figure-provenance-config',
          XDG_CACHE_HOME: '/private/tmp/agi-figure-provenance-cache',
          IPYTHONDIR: '/private/tmp/agi-figure-provenance-ipython',
        },
      }),
    ) as Record<string, unknown>;
    const keys = ['saved', 'shown', 'changed', 'relabeled', 'separate'];
    const evidenceDirectory = process.env['AGI_FIGURE_EVIDENCE_DIR'];
    if (evidenceDirectory) mkdirSync(evidenceDirectory, { recursive: true });
    const evidenceNames = [
      'monthly_sales_charts.png',
      'chart.png',
      'modified-data.png',
      'modified-label.png',
      'second-figure.png',
    ];
    const files = keys.map((key, index) => {
      const bytes = Buffer.from(String(result[key]), 'base64');
      if (evidenceDirectory) writeFileSync(join(evidenceDirectory, evidenceNames[index]!), bytes);
      const renderIdentity = readPngRenderIdentity(bytes);
      expect(renderIdentity).toMatch(/^matplotlib-v1:/);
      return {
        id: key,
        uri: `/api/files/${key}`,
        fileName: index === 0 ? 'monthly_sales_charts.png' : 'chart.png',
        mimeType: 'image/png',
        kind: 'image',
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        renderIdentity,
      };
    });
    expect(files[0]?.checksumSha256).not.toBe(files[1]?.checksumSha256);
    expect(files[0]?.renderIdentity).toBe(files[1]?.renderIdentity);
    expect(new Set(files.map((file) => file.renderIdentity)).size).toBe(4);
    expect(groupGeneratedImageOutputs(files)).toEqual({
      images: [files[0], ...files.slice(2)],
      aliases: [files[1]],
    });
    expect(result['stdout']).toBe('Total sales: 1315\nAverage sales: 219.17\nMaximum sales: 310\n');
    expect(result['same_canvas']).toBe(true);
    expect(result['same_dpi']).toBe(true);
    if (evidenceDirectory)
      writeFileSync(
        join(evidenceDirectory, 'figure-identities.json'),
        JSON.stringify(
          {
            executionId,
            stdout: result['stdout'],
            files: files.map((file, index) => ({ ...file, evidenceFile: evidenceNames[index] })),
            presentation: {
              images: ['saved', 'changed', 'relabeled', 'separate'],
              downloadableAliases: ['shown'],
            },
          },
          null,
          2,
        ),
      );
  });
});
