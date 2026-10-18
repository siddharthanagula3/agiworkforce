// @vitest-environment node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { Sandbox } from '@e2b/code-interpreter';
import { expect, it } from 'vitest';
import type { E2BExecutor } from '@/lib/e2b/types';
import { generateManagedOfficeFile } from './managed-office-file-service';

const execute = promisify(execFile);

const cloud = process.env['AGI_OFFICE_E2B_INTEGRATION'] === '1';
// llm-guardrail-allow: Real Office tools or an owned E2B image are required; local and cloud acceptance are executed explicitly outside ordinary unit runs.
it.skipIf(!cloud && process.env['AGI_OFFICE_LOCAL_INTEGRATION'] !== '1')(
  `calculates, preserves and renders real DOCX/XLSX with the ${cloud ? 'E2B' : 'installed'} Office runtime`,
  async () => {
    const template = process.env['AGI_E2B_CHAT_TEMPLATE'];
    if (cloud && !template) throw new Error('Pin AGI_E2B_CHAT_TEMPLATE for cloud acceptance.');
    let sandbox: Sandbox | undefined;
    const root = await mkdtemp(join(tmpdir(), 'agi-office-integration-'));
    const local = (path: string) => path.replace('/home/user', root);
    let previewIndex = 0;
    let executor: E2BExecutor = {
      createFolder: async ({ path }) => {
        await mkdir(local(path));
        return { ok: true, output: '' };
      },
      writeFile: async ({ path, content, encoding }) => {
        await writeFile(local(path), content, encoding === 'base64' ? 'base64' : 'utf8');
        return { ok: true, output: '' };
      },
      runCommand: async ({ command, signal }) => {
        try {
          const result = await execute('/bin/sh', ['-c', command.replaceAll('/home/user', root)], {
            signal,
            timeout: 60_000,
            maxBuffer: 1_000_000,
          });
          return {
            ok: true,
            output: result.stdout,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: 0,
          };
        } catch (error) {
          return { ok: false, output: '', stdout: '', stderr: String(error), exitCode: 1 };
        }
      },
      listFiles: async (path) =>
        Promise.all(
          (await readdir(local(path))).map(async (name) => {
            const info = await stat(join(local(path), name));
            return {
              name,
              path: `${path}/${name}`,
              isDir: info.isDirectory(),
              byteSize: info.size,
            };
          }),
        ),
      readFileBytes: async (path) => {
        const bytes = await readFile(local(path));
        const previews = process.env['AGI_OFFICE_PREVIEW_DIR'];
        if (previews && path.endsWith('.png')) {
          await mkdir(previews, { recursive: true });
          await writeFile(join(previews, `page-${++previewIndex}.png`), bytes);
        }
        return bytes;
      },
      runCode: async () => ({ ok: false, output: '' }),
      dispose: async () => undefined,
    };
    try {
      if (cloud) {
        sandbox = await Sandbox.create(template!, {
          timeoutMs: 240_000,
          allowInternetAccess: false,
        });
        const owned = sandbox;
        executor = {
          createFolder: async ({ path }) => {
            await owned.files.makeDir(path);
            return { ok: true, output: '' };
          },
          writeFile: async ({ path, content, encoding }) => {
            const previews = process.env['AGI_OFFICE_PREVIEW_DIR'];
            if (previews && path.endsWith('.xlsx')) {
              await mkdir(previews, { recursive: true });
              await writeFile(
                join(previews, `input-${++previewIndex}.xlsx`),
                content,
                encoding === 'base64' ? 'base64' : 'utf8',
              );
            }
            await owned.files.write(
              path,
              encoding === 'base64'
                ? Uint8Array.from(Buffer.from(content, 'base64')).buffer
                : content,
            );
            const roundTrip = Buffer.from(await owned.files.read(path, { format: 'bytes' }));
            expect(
              roundTrip.equals(Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8')),
            ).toBe(true);
            return { ok: true, output: '' };
          },
          runCommand: async ({ command, signal }) => {
            signal?.throwIfAborted();
            try {
              const result = await owned.commands.run(command, { timeoutMs: 60_000 });
              return { ok: result.exitCode === 0, output: result.stdout, ...result };
            } catch (error) {
              return { ok: false, output: '', stdout: '', stderr: String(error), exitCode: 1 };
            }
          },
          listFiles: async (path) =>
            (await owned.files.list(path)).map((entry) => ({
              name: entry.name,
              path: entry.path,
              isDir: entry.type === 'dir',
              byteSize: entry.size,
            })),
          readFileBytes: async (path) => {
            const bytes = await owned.files.read(path, { format: 'bytes' });
            const previews = process.env['AGI_OFFICE_PREVIEW_DIR'];
            if (previews && (path.endsWith('.png') || path.endsWith('.xlsx'))) {
              await mkdir(previews, { recursive: true });
              const extension = path.endsWith('.png') ? 'png' : 'xlsx';
              await writeFile(join(previews, `output-${++previewIndex}.${extension}`), bytes);
            }
            return bytes;
          },
          runCode: async () => ({ ok: false, output: '' }),
          dispose: async () => undefined,
        };
      }
      const docx = await generateManagedOfficeFile(
        {
          format: 'docx',
          filename: 'owned.docx',
          title: 'Owned render fixture',
          content: '# Acceptance\n\nPreserve this document and render every page.',
          verify_render: true,
        },
        { executor: async () => executor },
      );
      expect(docx, JSON.stringify(docx.ok ? docx.verification : docx)).toMatchObject({
        ok: true,
        verification: { render: { status: 'passed', pages: 1 } },
      });
      const workbook = await generateManagedOfficeFile(
        {
          format: 'xlsx',
          filename: 'owned.xlsx',
          title: 'Budget',
          sheets: [
            {
              name: 'Budget',
              rows: [
                ['Units', 'Cost', 'Total'],
                [3, 20, '=A2*B2'],
              ],
            },
          ],
          verify_render: true,
        },
        { executor: async () => executor },
      );
      expect(
        workbook,
        JSON.stringify(workbook.ok ? workbook.verification : workbook),
      ).toMatchObject({
        ok: true,
        verification: { recalculation: 'passed', render: { status: 'passed' } },
      });
      if (!workbook.ok || !docx.ok) return;
      const original = await JSZip.loadAsync(workbook.data);
      expect(await original.file('xl/worksheets/sheet1.xml')!.async('string')).toMatch(
        /<f>A2\*B2<\/f><v>60<\/v>/,
      );
      const sha256 = createHash('sha256').update(workbook.data).digest('hex');
      const edited = await generateManagedOfficeFile(
        {
          format: 'xlsx',
          filename: 'updated.xlsx',
          title: 'Updated',
          source: {
            filename: 'owned.xlsx',
            sha256,
            edits: [{ sheet: 'Budget', cell: 'B2', expected: 20, value: 25 }],
          },
          verify_render: true,
        },
        {
          attachments: [
            {
              filename: 'owned.xlsx',
              mimeType: workbook.mimeType,
              base64: workbook.data.toString('base64'),
            },
          ],
          executor: async () => executor,
        },
      );
      expect(edited, JSON.stringify(edited.ok ? edited.verification : edited)).toMatchObject({
        ok: true,
        verification: {
          preservation: { changedParts: ['xl/worksheets/sheet1.xml'] },
          render: { status: 'passed' },
        },
      });
      if (!edited.ok) return;
      const after = await JSZip.loadAsync(edited.data);
      expect(await after.file('xl/worksheets/sheet1.xml')!.async('string')).toMatch(
        /<f>A2\*B2<\/f><v>75<\/v>/,
      );
      const slides = await generateManagedOfficeFile(
        {
          format: 'pptx',
          filename: 'owned-slides.pptx',
          title: 'Owned deck',
          slides: [
            {
              title: 'Acceptance',
              bullets: ['Preserve readable slides', 'Verify rendered output'],
            },
          ],
          verify_render: true,
        },
        { executor: async () => executor },
      );
      expect(slides, JSON.stringify(slides.ok ? slides.verification : slides)).toMatchObject({
        ok: true,
        verification: { render: { status: 'passed', pages: 1 } },
      });
      const pdf = await generateManagedOfficeFile(
        {
          format: 'pdf',
          filename: 'owned.pdf',
          title: 'Owned PDF',
          content: 'Render and inspect the generated PDF.',
          verify_render: true,
        },
        { executor: async () => executor },
      );
      expect(pdf, JSON.stringify(pdf.ok ? pdf.verification : pdf)).toMatchObject({
        ok: true,
        verification: { structural: 'pdf_parsed', render: { status: 'passed', pages: 1 } },
      });
      const formulaError = await generateManagedOfficeFile(
        {
          format: 'xlsx',
          filename: 'invalid.xlsx',
          title: 'Invalid calculation',
          sheets: [{ name: 'Errors', rows: [['=1/0']] }],
        },
        { executor: async () => executor },
      );
      expect(formulaError).toMatchObject({
        ok: false,
        message: expect.stringMatching(/calculation error/),
      });
      const receipt = process.env['AGI_OFFICE_INTEGRATION_RECEIPT'];
      if (receipt)
        await writeFile(
          receipt,
          JSON.stringify(
            {
              environment: cloud
                ? { provider: 'E2B', template, sandboxId: sandbox!.sandboxId }
                : { provider: 'local' },
              docx: docx.verification,
              workbook: workbook.verification,
              edited: edited.verification,
              slides: slides.ok ? slides.verification : null,
              pdf: pdf.ok ? pdf.verification : null,
              formulaErrorRefused: !formulaError.ok,
            },
            null,
            2,
          ),
        );
      if (sandbox) {
        expect(
          (await sandbox.files.list('/home/user')).filter((entry) =>
            entry.name.startsWith('.agi-office-'),
          ),
        ).toEqual([]);
      } else expect(await readdir(root)).toEqual([]);
    } finally {
      if (sandbox) await sandbox.kill();
      await rm(root, { recursive: true, force: true });
    }
  },
  240_000,
);
