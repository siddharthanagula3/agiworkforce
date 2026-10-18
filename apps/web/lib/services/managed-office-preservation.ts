import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { posix } from 'node:path';
import { SaxesParser } from 'saxes';
import { decompressionBudget, readArchiveMember } from '@/lib/security/archive-bounds';
import { MAX_GENERATED_FILE_BYTES } from '@/lib/server/generated-file-persist';
import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import type { E2BExecutor } from '@/lib/e2b/types';

export class ManagedOfficeProcessingError extends Error {}

export interface ManagedOfficeSource {
  filename: string;
  sha256: string;
  replacements: { find: string; replace: string; expectedMatches: number }[];
}

export interface ManagedOfficeVerification {
  inputSha256?: string;
  outputSha256: string;
  structural: 'package_parts_checked' | 'pdf_parsed';
  preservation?: { changedParts: string[]; unchangedParts: number };
  recalculation: 'not_required' | 'passed';
  render:
    'not_run' | { status: 'passed'; pages: number; pdfSha256: string; previewSha256: string[] };
}

function digest(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

async function officeParts(data: Buffer, requiredPart: string): Promise<Map<string, Buffer>> {
  if (data.length > MAX_GENERATED_FILE_BYTES)
    throw new ManagedOfficeProcessingError('The Office file is too large.');
  const zip = await JSZip.loadAsync(data);
  const budget = decompressionBudget(data.length, MAX_GENERATED_FILE_BYTES);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  budget.admitMembers(entries.length);
  const parts = new Map<string, Buffer>();
  for (const entry of entries) {
    const original = entry.unsafeOriginalName ?? entry.name;
    if (
      original !== entry.name ||
      original.startsWith('/') ||
      original.includes('\\') ||
      original.split('/').includes('..')
    ) {
      throw new ManagedOfficeProcessingError('The Office archive contains an unsupported path.');
    }
    if (
      /(?:vbaProject\.bin$|\/(?:activeX|embeddings|externalLinks|queryTables)\/|^xl\/connections\.xml$)/i.test(
        entry.name,
      )
    )
      throw new ManagedOfficeProcessingError(
        'Macros, embedded objects and external data connections are not supported.',
      );
    parts.set(entry.name, Buffer.from(await readArchiveMember(entry, budget)));
  }
  if (!parts.has('[Content_Types].xml') || !parts.has('_rels/.rels') || !parts.has(requiredPart)) {
    throw new ManagedOfficeProcessingError('The Office package is incomplete.');
  }
  for (const [name, bytes] of parts) {
    if (
      (name.endsWith('.xml') || name.endsWith('.rels')) &&
      /<!DOCTYPE|<!ENTITY/i.test(bytes.toString('utf8'))
    ) {
      throw new ManagedOfficeProcessingError('XML entity declarations are not supported.');
    }
  }
  for (const [name, bytes] of parts) {
    if (!name.endsWith('.xml') && !name.endsWith('.rels')) continue;
    try {
      const parser = new SaxesParser({ xmlns: true });
      const relationshipIds = new Set<string>();
      parser.on('opentag', (tag) => {
        if (!name.endsWith('.rels') || tag.local !== 'Relationship') return;
        const attributes = Object.fromEntries(
          Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
        );
        const id = attributes['Id'];
        const target = attributes['Target'];
        if (!id || !target || relationshipIds.has(id)) throw new Error('Invalid relationship');
        relationshipIds.add(id);
        if (attributes['TargetMode'] === 'External') return;
        const base = name === '_rels/.rels' ? '' : posix.dirname(posix.dirname(name));
        const decoded = decodeURIComponent(target.split('#')[0]!);
        if (!decoded || decoded.includes('\\') || decoded.includes('?'))
          throw new Error('Invalid relationship target');
        const resolved = posix.normalize(
          decoded.startsWith('/') ? decoded.slice(1) : posix.join(base, decoded),
        );
        if (resolved.startsWith('../') || !parts.has(resolved))
          throw new Error('Missing relationship target');
      });
      parser.write(bytes.toString('utf8')).close();
    } catch {
      throw new ManagedOfficeProcessingError(
        'The Office package has malformed XML or broken relationships.',
      );
    }
  }
  return parts;
}

function xmlText(value: string): string {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 0xd800 && code <= 0xdfff) ||
      code === 0xfffe ||
      code === 0xffff
    ) {
      throw new ManagedOfficeProcessingError('The edit contains unsupported XML characters.');
    }
  }
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function editManagedDocx(
  source: ManagedOfficeSource,
  attachments: readonly TurnAttachment[],
): Promise<{ data: Buffer; verification: ManagedOfficeVerification }> {
  const matches = attachments.filter((attachment) => attachment.filename === source.filename);
  if (matches.length !== 1)
    throw new ManagedOfficeProcessingError('Choose one uniquely named attached Word document.');
  const attachment = matches[0]!;
  if (
    attachment.mimeType !==
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    throw new ManagedOfficeProcessingError(
      'Existing-input editing currently supports Word documents only.',
    );
  }
  if (attachment.base64.length > Math.ceil(MAX_GENERATED_FILE_BYTES / 3) * 4)
    throw new ManagedOfficeProcessingError('The source file is too large.');
  const original = Buffer.from(attachment.base64, 'base64');
  const inputSha256 = digest(original);
  if (inputSha256 !== source.sha256)
    throw new ManagedOfficeProcessingError(
      'The source document changed. Select its current digest before editing.',
    );
  const parts = await officeParts(original, 'word/document.xml');
  const document = parts.get('word/document.xml')!;
  let xml = document.toString('utf8');
  if (/<w:(?:ins|del|moveFrom|moveTo)\b/.test(xml))
    throw new ManagedOfficeProcessingError(
      'Documents with tracked revisions are not supported by this edit operation.',
    );
  for (const replacement of source.replacements) {
    const find = xmlText(replacement.find);
    const value = xmlText(replacement.replace);
    if (!find) throw new ManagedOfficeProcessingError('An edit must name nonempty text.');
    let count = 0;
    for (const run of xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)) {
      const text = run[1] ?? '';
      let offset = 0;
      while ((offset = text.indexOf(find, offset)) !== -1) {
        count += 1;
        if (count > replacement.expectedMatches) break;
        offset += find.length;
      }
      if (count > replacement.expectedMatches) break;
    }
    if (count !== replacement.expectedMatches)
      throw new ManagedOfficeProcessingError(
        'The text match count differs, or the requested text spans unsupported formatting runs.',
      );
    const originalPartBytes = [...parts.values()].reduce(
      (total, part) => total + part.byteLength,
      0,
    );
    const projectedBytes =
      originalPartBytes -
      document.byteLength +
      Buffer.byteLength(xml) +
      (Buffer.byteLength(value) - Buffer.byteLength(find)) * count;
    if (projectedBytes > MAX_GENERATED_FILE_BYTES)
      throw new ManagedOfficeProcessingError(
        'The edit would exceed the Office package size limit.',
      );
    xml = xml.replace(
      /(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g,
      (_match, open: string, text: string, close: string) => {
        const edited = text.split(find).join(value);
        const tag =
          edited !== text && !/xml:space=/.test(open)
            ? open.replace(/>$/, ' xml:space="preserve">')
            : open;
        return tag + edited + close;
      },
    );
  }
  const output = new JSZip();
  for (const [name, bytes] of parts)
    output.file(name, name === 'word/document.xml' ? Buffer.from(xml) : bytes);
  const data = await output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const checked = await officeParts(data, 'word/document.xml');
  for (const [name, bytes] of parts) {
    if (name !== 'word/document.xml' && !checked.get(name)?.equals(bytes))
      throw new ManagedOfficeProcessingError('An unrelated document part changed.');
  }
  return {
    data,
    verification: {
      inputSha256,
      outputSha256: digest(data),
      structural: 'package_parts_checked',
      preservation: { changedParts: ['word/document.xml'], unchangedParts: parts.size - 1 },
      recalculation: 'not_required',
      render: 'not_run',
    },
  };
}

export async function verifyManagedOfficePackage(
  data: Buffer,
  format: 'docx' | 'xlsx' | 'pptx',
): Promise<ManagedOfficeVerification> {
  const parts = await officeParts(
    data,
    format === 'docx'
      ? 'word/document.xml'
      : format === 'xlsx'
        ? 'xl/workbook.xml'
        : 'ppt/presentation.xml',
  );
  let formulas = 0;
  for (const [name, bytes] of parts) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    const xml = bytes.toString('utf8');
    for (const cell of xml.matchAll(/<c\b[^>]*>[\s\S]*?<\/c>/g)) {
      if (!/<f\b/.test(cell[0])) continue;
      formulas += 1;
      if (/\bt=["']e["']/.test(cell[0]) || !/<v>[^<]+<\/v>/.test(cell[0])) {
        throw new ManagedOfficeProcessingError(
          'A workbook formula has no evaluated result or contains a calculation error.',
        );
      }
    }
  }
  return {
    outputSha256: digest(data),
    structural: 'package_parts_checked',
    recalculation: formulas ? 'passed' : 'not_required',
    render: 'not_run',
  };
}

function quoteShell(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

const RECALCULABLE_FUNCTIONS: ReadonlySet<string> = new Set([
  'SUM',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT',
  'COUNTA',
  'IF',
  'IFERROR',
  'IFNA',
  'AND',
  'OR',
  'NOT',
  'ABS',
  'ROUND',
  'ROUNDUP',
  'ROUNDDOWN',
  'SUMIF',
  'SUMIFS',
  'COUNTIF',
  'COUNTIFS',
  'MEDIAN',
  'PRODUCT',
  'SUMPRODUCT',
]);

export async function recalculateManagedWorkbook(
  data: Buffer,
  executor: E2BExecutor,
  signal?: AbortSignal,
): Promise<Buffer> {
  if (!executor.runCommand || !executor.readFileBytes || !executor.listFiles)
    throw new ManagedOfficeProcessingError(
      'The current execution environment cannot recalculate workbooks.',
    );
  const parts = await officeParts(data, 'xl/workbook.xml');
  for (const [name, bytes] of parts) {
    if (name.endsWith('.rels') && /TargetMode=["']External["']/i.test(bytes.toString('utf8')))
      throw new ManagedOfficeProcessingError(
        'External workbook links are not supported during recalculation.',
      );
    if (name === 'xl/workbook.xml' && /<definedName\b/.test(bytes.toString('utf8')))
      throw new ManagedOfficeProcessingError(
        'Named workbook expressions are unsupported during managed recalculation.',
      );
    if (/^xl\/worksheets\//.test(name)) {
      const formulas = [...bytes.toString('utf8').matchAll(/<f\b[^>]*>([\s\S]*?)<\/f>/g)];
      for (const formula of formulas) {
        const body = decodedXmlText(formula[1] ?? '');
        if (/\[|\]|\\|\||:\/\/|file:/i.test(body))
          throw new ManagedOfficeProcessingError('External workbook formulas are not supported.');
        for (const call of body.matchAll(/([A-Za-z_][A-Za-z0-9_.]*)\s*\(/g)) {
          if (!RECALCULABLE_FUNCTIONS.has(call[1]!.toUpperCase()))
            throw new ManagedOfficeProcessingError(
              'This workbook function is not supported by the managed recalculation contract.',
            );
        }
      }
    }
  }
  signal?.throwIfAborted();
  const directory = `/home/user/.agi-office-${randomUUID()}`;
  const input = `${directory}/input.xlsx`;
  const output = `${directory}/recalculated/input.xlsx`;
  const calculationInput = new JSZip();
  for (const [name, bytes] of parts) {
    let xml = bytes.toString('utf8');
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      xml = xml.replace(/<c\b[^>]*>[\s\S]*?<\/c>/g, (cell) =>
        /<f\b/.test(cell) ? cell.replace(/<v\b[^>]*>[\s\S]*?<\/v>/g, '') : cell,
      );
      calculationInput.file(name, xml);
    } else if (name === 'xl/workbook.xml') {
      xml = xml
        .replace(/<calcPr\b[^>]*(?:\/>|>[\s\S]*?<\/calcPr>)/g, '')
        .replace(
          '</workbook>',
          '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>',
        );
      calculationInput.file(name, xml);
    } else calculationInput.file(name, bytes);
  }
  const staged = await calculationInput.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  let created = false;
  let calculated: Buffer | undefined;
  let processingError: unknown;
  let cleanupFailed = false;
  try {
    const folder = await executor.createFolder({ path: directory });
    if (!folder.ok)
      throw new ManagedOfficeProcessingError(
        'The workbook execution workspace could not be created.',
      );
    created = true;
    const written = await executor.writeFile({
      path: input,
      content: staged.toString('base64'),
      encoding: 'base64',
    });
    if (!written.ok)
      throw new ManagedOfficeProcessingError('The workbook could not be staged for calculation.');
    signal?.throwIfAborted();
    const code = [
      'import pathlib, shutil, subprocess',
      `root = pathlib.Path(${JSON.stringify(directory)})`,
      "program = shutil.which('libreoffice') or shutil.which('soffice')",
      "if not program: raise RuntimeError('Office recalculation is not installed in this execution environment')",
      "(root / 'recalculated').mkdir()",
      "subprocess.run([program, '-env:UserInstallation=' + (root / 'profile').as_uri(), '--headless', '--convert-to', 'xlsx', '--outdir', str(root / 'recalculated'), str(root / 'input.xlsx')], check=True, capture_output=True)",
      "if not (root / 'recalculated/input.xlsx').is_file(): raise RuntimeError('Office produced no recalculated workbook')",
    ].join('\n');
    const result = await executor.runCommand({
      command: `python3 -c ${quoteShell(code)}`,
      ...(signal ? { signal } : {}),
    });
    if (!result.ok)
      throw new ManagedOfficeProcessingError(
        'Workbook recalculation failed or is unavailable in the current execution environment.',
      );
    signal?.throwIfAborted();
    const files = await executor.listFiles(`${directory}/recalculated`);
    const file = files?.find((entry) => entry.path === output && !entry.isDir);
    if (!file || file.byteSize > MAX_GENERATED_FILE_BYTES)
      throw new ManagedOfficeProcessingError(
        'The recalculated workbook is missing or exceeds the output limit.',
      );
    const bytes = await executor.readFileBytes(output);
    if (!bytes)
      throw new ManagedOfficeProcessingError('The recalculated workbook could not be read.');
    calculated = Buffer.from(bytes);
    await verifyManagedOfficePackage(calculated, 'xlsx');
    const calculatedParts = await officeParts(calculated, 'xl/workbook.xml');
    for (const [name, bytes] of parts) {
      if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
      const after = calculatedParts.get(name)?.toString('utf8') ?? '';
      const cells = new Map(
        [...after.matchAll(/<c\b[^>]*\br=["']([^"']+)["'][^>]*>[\s\S]*?<\/c>/g)].map((cell) => [
          cell[1],
          cell[0],
        ]),
      );
      for (const cell of bytes
        .toString('utf8')
        .matchAll(/<c\b[^>]*\br=["']([^"']+)["'][^>]*>[\s\S]*?<\/c>/g)) {
        if (/<f\b/.test(cell[0]) && !/<f\b/.test(cells.get(cell[1]) ?? ''))
          throw new ManagedOfficeProcessingError('Recalculation removed a workbook formula.');
      }
    }
    const preserved = new JSZip();
    for (const [name, bytes] of parts) {
      let content = bytes;
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
        const caches = new Map(
          [
            ...calculatedParts
              .get(name)!
              .toString('utf8')
              .matchAll(/<c\b[^>]*\br=["']([^"']+)["'][^>]*>[\s\S]*?<\/c>/g),
          ].map((cell) => [cell[1], cell[0]]),
        );
        content = Buffer.from(
          bytes
            .toString('utf8')
            .replace(
              /<c\b[^>]*\br=["']([^"']+)["'][^>]*>[\s\S]*?<\/c>/g,
              (cell, address: string) => {
                if (!/<f\b/.test(cell)) return cell;
                const evaluated = caches.get(address) ?? '';
                const value = evaluated.match(/<v>([^<]+)<\/v>/)?.[0];
                const type = evaluated.match(/^<c\b[^>]*\bt=["']([^"']+)["']/)?.[1];
                if (!value || (type && !['n', 'str', 'b'].includes(type)))
                  throw new ManagedOfficeProcessingError(
                    'The evaluator returned an unsupported formula cache.',
                  );
                return cell
                  .replace(/^<c\b[^>]*>/, (open: string) =>
                    open
                      .replace(/\s+t=["'][^"']*["']/, '')
                      .replace(/>$/, type ? ` t="${type}">` : '>'),
                  )
                  .replace(/<v\b[^>]*>[\s\S]*?<\/v>/g, '')
                  .replace(/<\/c>$/, value + '</c>');
              },
            ),
        );
      }
      preserved.file(name, content);
    }
    calculated = await preserved.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    await verifyManagedOfficePackage(calculated, 'xlsx');
  } catch (error) {
    processingError = error;
  } finally {
    if (created) {
      const cleanup = `import shutil; shutil.rmtree(${JSON.stringify(directory)})`;
      try {
        const result = await executor.runCommand({ command: `python3 -c ${quoteShell(cleanup)}` });
        cleanupFailed = !result.ok;
      } catch {
        cleanupFailed = true;
      }
    }
  }
  if (cleanupFailed)
    throw new ManagedOfficeProcessingError(
      'Workbook processing stopped before its temporary workspace was removed.',
    );
  if (processingError) throw processingError;
  if (!calculated) throw new ManagedOfficeProcessingError('Workbook calculation did not complete.');
  return calculated;
}

export async function renderManagedOfficeFile(
  data: Buffer,
  format: 'docx' | 'xlsx' | 'pptx' | 'pdf',
  executor: E2BExecutor,
  signal?: AbortSignal,
): Promise<Exclude<ManagedOfficeVerification['render'], 'not_run'>> {
  if (!executor.runCommand || !executor.listFiles || !executor.readFileBytes)
    throw new ManagedOfficeProcessingError(
      'This execution environment cannot verify Office rendering.',
    );
  if (
    data.length > MAX_GENERATED_FILE_BYTES ||
    (format === 'pdf' && !data.subarray(0, 5).equals(Buffer.from('%PDF-')))
  )
    throw new ManagedOfficeProcessingError('The document cannot be rendered safely.');
  const parts =
    format === 'pdf'
      ? new Map<string, Buffer>()
      : await officeParts(
          data,
          format === 'docx'
            ? 'word/document.xml'
            : format === 'xlsx'
              ? 'xl/workbook.xml'
              : 'ppt/presentation.xml',
        );
  for (const [name, bytes] of parts) {
    if (name.endsWith('.rels') && /TargetMode=["']External["']/i.test(bytes.toString('utf8')))
      throw new ManagedOfficeProcessingError(
        'External document links must be removed before managed rendering.',
      );
    if (name.endsWith('.xml')) {
      const instructions: string[] = [];
      let capturing = false;
      const fields = new SaxesParser({ xmlns: true });
      fields.on('opentag', (tag) => {
        if (tag.local === 'instrText') capturing = true;
        if (tag.local === 'fldSimple') {
          for (const attribute of Object.values(tag.attributes)) {
            if (attribute.local === 'instr') instructions.push(attribute.value);
          }
        }
      });
      fields.on('text', (value) => {
        if (capturing) instructions.push(value);
      });
      fields.on('closetag', (tag) => {
        if (tag.local === 'instrText') capturing = false;
      });
      fields.write(bytes.toString('utf8')).close();
      if (
        /\b(?:DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE|DATABASE|LINK)\b/i.test(instructions.join(' '))
      )
        throw new ManagedOfficeProcessingError(
          'Active document fields are unsupported during rendering.',
        );
    }
  }
  signal?.throwIfAborted();
  const directory = `/home/user/.agi-office-${randomUUID()}`;
  let created = false;
  let receipt: Exclude<ManagedOfficeVerification['render'], 'not_run'> | undefined;
  let failure: unknown;
  try {
    if (!(await executor.createFolder({ path: directory })).ok)
      throw new ManagedOfficeProcessingError('The rendering workspace could not be created.');
    created = true;
    if (
      !(
        await executor.writeFile({
          path: `${directory}/input.${format}`,
          content: data.toString('base64'),
          encoding: 'base64',
        })
      ).ok
    )
      throw new ManagedOfficeProcessingError('The document could not be staged for rendering.');
    const code = [
      'import pathlib, shutil, subprocess, re',
      `root = pathlib.Path(${JSON.stringify(directory)})`,
      "office = shutil.which('libreoffice') or shutil.which('soffice')",
      "if not office or not shutil.which('pdftoppm') or not shutil.which('pdfinfo'): raise RuntimeError('Office rendering tools are unavailable')",
      "out = root / 'rendered'; out.mkdir()",
      format === 'pdf'
        ? "shutil.copyfile(root / 'input.pdf', out / 'input.pdf')"
        : `subprocess.run([office, '-env:UserInstallation=' + (root / 'profile').as_uri(), '--headless', '--convert-to', 'pdf', '--outdir', str(out), str(root / 'input.${format}')], check=True, capture_output=True, timeout=45)`,
      "pdf = out / 'input.pdf'",
      "if not pdf.is_file() or pdf.stat().st_size > 20971520: raise RuntimeError('Rendered PDF is missing or too large')",
      "info = subprocess.run(['pdfinfo', str(pdf)], check=True, capture_output=True, text=True, timeout=5).stdout",
      "pages = int(next(line.split(':', 1)[1] for line in info.splitlines() if line.startswith('Pages:')))",
      "if not 1 <= pages <= 40: raise RuntimeError('Unsupported rendered page count')",
      "subprocess.run(['pdftoppm', '-r', '60', '-png', str(pdf), str(out / 'page')], check=True, capture_output=True, timeout=45)",
      "images = list(out.glob('page-*.png'))",
      "if len(images) != pages or sum(p.stat().st_size for p in images) > 20971520: raise RuntimeError('Incomplete or oversized page rendering')",
    ].join('\n');
    const result = await executor.runCommand({
      command: `python3 -c ${quoteShell(code)}`,
      ...(signal ? { signal } : {}),
    });
    if (!result.ok)
      throw new ManagedOfficeProcessingError(
        'Office rendering failed or is unavailable in the current execution environment.',
      );
    signal?.throwIfAborted();
    const files = await executor.listFiles(`${directory}/rendered`);
    const pdf = files?.find(
      (file) => file.path === `${directory}/rendered/input.pdf` && !file.isDir,
    );
    const images =
      files
        ?.filter(
          (file) =>
            !file.isDir &&
            file.path.startsWith(`${directory}/rendered/page-`) &&
            /^page-\d+\.png$/.test(file.name),
        )
        .sort((a, b) => a.name.localeCompare(b.name)) ?? [];
    if (
      !pdf ||
      !images.length ||
      images.length > 40 ||
      [pdf, ...images].reduce((total, file) => total + file.byteSize, 0) > MAX_GENERATED_FILE_BYTES
    )
      throw new ManagedOfficeProcessingError(
        'The rendered output is incomplete or exceeds the output limit.',
      );
    const pdfBytes = await executor.readFileBytes(pdf.path);
    if (
      !pdfBytes ||
      pdfBytes.byteLength > MAX_GENERATED_FILE_BYTES ||
      !Buffer.from(pdfBytes).subarray(0, 5).equals(Buffer.from('%PDF-'))
    )
      throw new ManagedOfficeProcessingError('The renderer returned no valid PDF.');
    const previews: string[] = [];
    let renderedBytes = pdfBytes.byteLength;
    for (const file of images) {
      signal?.throwIfAborted();
      const bytes = await executor.readFileBytes(file.path);
      if (
        !bytes ||
        bytes.byteLength > MAX_GENERATED_FILE_BYTES ||
        !Buffer.from(bytes)
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw new ManagedOfficeProcessingError('A rendered page is missing or invalid.');
      renderedBytes += bytes.byteLength;
      if (renderedBytes > MAX_GENERATED_FILE_BYTES)
        throw new ManagedOfficeProcessingError(
          'Rendered output exceeded the byte limit while reading.',
        );
      previews.push(digest(bytes));
    }
    receipt = {
      status: 'passed',
      pages: previews.length,
      pdfSha256: digest(pdfBytes),
      previewSha256: previews,
    };
  } catch (error) {
    failure = error;
  }
  if (created) {
    try {
      const cleanup = await executor.runCommand({
        command: `python3 -c ${quoteShell(`import shutil; shutil.rmtree(${JSON.stringify(directory)})`)}`,
      });
      if (!cleanup.ok)
        failure = new ManagedOfficeProcessingError('Office rendering workspace cleanup failed.');
    } catch {
      failure = new ManagedOfficeProcessingError('Office rendering workspace cleanup failed.');
    }
  }
  if (failure) throw failure;
  if (!receipt) throw new ManagedOfficeProcessingError('Office rendering did not complete.');
  return receipt;
}

export interface ManagedWorkbookSource {
  filename: string;
  sha256: string;
  edits: { sheet: string; cell: string; expected: string | number; value: string | number }[];
}

function decodedXmlText(xml: string): string {
  let text = '';
  const parser = new SaxesParser({ xmlns: false });
  parser.on('text', (value) => {
    text += value;
  });
  parser.write(`<text>${xml}</text>`).close();
  return text;
}

export async function editManagedWorkbook(
  source: ManagedWorkbookSource,
  attachments: readonly TurnAttachment[],
): Promise<{ data: Buffer; original: Buffer }> {
  const matches = attachments.filter((attachment) => attachment.filename === source.filename);
  if (
    matches.length !== 1 ||
    matches[0]!.mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    throw new ManagedOfficeProcessingError('Choose one uniquely named attached Excel workbook.');
  if (matches[0]!.base64.length > Math.ceil(MAX_GENERATED_FILE_BYTES / 3) * 4)
    throw new ManagedOfficeProcessingError('The source workbook is too large.');
  const original = Buffer.from(matches[0]!.base64, 'base64');
  if (digest(original) !== source.sha256)
    throw new ManagedOfficeProcessingError(
      'The source workbook changed. Select its current digest before editing.',
    );
  const parts = await officeParts(original, 'xl/workbook.xml');
  const relationships = new Map<string, string>();
  const relParser = new SaxesParser({ xmlns: true });
  relParser.on('opentag', (tag) => {
    if (tag.local !== 'Relationship') return;
    const a = Object.fromEntries(
      Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
    );
    if (a['Id'] && a['Target'] && a['TargetMode'] !== 'External')
      relationships.set(a['Id'], a['Target']);
  });
  relParser.write(parts.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '').close();
  const sheets = new Map<string, string>();
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    if (tag.local !== 'sheet') return;
    const a = Object.fromEntries(
      Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
    );
    const target = relationships.get(a['id'] ?? '');
    if (target && a['name'])
      sheets.set(
        a['name'],
        posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join('xl', target)),
      );
  });
  parser.write(parts.get('xl/workbook.xml')!.toString('utf8')).close();
  const shared = [
    ...(parts.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(
      /<si\b[^>]*>([\s\S]*?)<\/si>/g,
    ),
  ].map((item) => decodedXmlText(item[1]!));
  const touched = new Set<string>();
  for (const edit of source.edits) {
    const part = sheets.get(edit.sheet);
    if (!part || !/^xl\/worksheets\/[^/]+\.xml$/.test(part) || !parts.has(part))
      throw new ManagedOfficeProcessingError(
        'The requested worksheet is unavailable or unsupported.',
      );
    const key = `${part}:${edit.cell}`;
    if (touched.has(key))
      throw new ManagedOfficeProcessingError('Each workbook cell may be edited once per request.');
    touched.add(key);
    let found = false;
    const xml = parts
      .get(part)!
      .toString('utf8')
      .replace(/<c\b[^>]*\br=["']([^"']+)["'][^>]*>[\s\S]*?<\/c>/g, (cell, address: string) => {
        if (address !== edit.cell) return cell;
        if (/<f\b[^>]*\b(?:t|ref|si)=/.test(cell))
          throw new ManagedOfficeProcessingError(
            'Shared, array and spill formula edits are unsupported.',
          );
        found = true;
        const formula = cell.match(/<f\b[^>]*>([\s\S]*?)<\/f>/)?.[1];
        const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
        const type = cell.match(/^<c\b[^>]*\bt=["']([^"']+)["']/)?.[1];
        const current =
          formula !== undefined
            ? '=' + decodedXmlText(formula)
            : type === 's'
              ? shared[Number(value)]
              : type === 'inlineStr'
                ? decodedXmlText(cell.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '')
                : type === 'str'
                  ? decodedXmlText(value)
                  : Number(value);
        if (current !== edit.expected)
          throw new ManagedOfficeProcessingError(
            'A workbook cell differs from the expected value; refresh the source before editing.',
          );
        const open = cell.match(/^<c\b[^>]*>/)![0].replace(/\s+t=["'][^"']*["']/, '');
        if (typeof edit.value === 'number') return open + `<v>${edit.value}</v></c>`;
        if (edit.value.startsWith('=')) return open + `<f>${xmlText(edit.value.slice(1))}</f></c>`;
        return (
          open.replace(/>$/, ' t="inlineStr">') +
          `<is><t xml:space="preserve">${xmlText(edit.value)}</t></is></c>`
        );
      });
    if (!found)
      throw new ManagedOfficeProcessingError(
        'Inserting new workbook cells is unsupported; select an existing explicit cell.',
      );
    parts.set(part, Buffer.from(xml));
  }
  if (
    [...parts.values()].reduce((total, bytes) => total + bytes.length, 0) > MAX_GENERATED_FILE_BYTES
  )
    throw new ManagedOfficeProcessingError('The edited workbook exceeds the package limit.');
  const output = new JSZip();
  for (const [name, bytes] of parts) output.file(name, bytes);
  return {
    data: await output.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }),
    original,
  };
}

export async function workbookPreservationReceipt(
  original: Buffer,
  data: Buffer,
): Promise<Pick<ManagedOfficeVerification, 'inputSha256' | 'preservation'>> {
  const before = await officeParts(original, 'xl/workbook.xml');
  const after = await officeParts(data, 'xl/workbook.xml');
  const changedParts = [...before]
    .filter(([name, bytes]) => !after.get(name)?.equals(bytes))
    .map(([name]) => name);
  if (
    before.size !== after.size ||
    changedParts.some((name) => !/^xl\/worksheets\/[^/]+\.xml$/.test(name))
  )
    throw new ManagedOfficeProcessingError('An unrelated workbook package part changed.');
  return {
    inputSha256: digest(original),
    preservation: { changedParts, unchangedParts: before.size - changedParts.length },
  };
}
