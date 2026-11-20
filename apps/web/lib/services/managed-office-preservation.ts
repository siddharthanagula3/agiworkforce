import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { posix } from 'node:path';
import { SaxesParser } from 'saxes';
import { decompressionBudget, readArchiveMember } from '@/lib/security/archive-bounds';
import { MAX_GENERATED_FILE_BYTES } from '@/lib/server/generated-file-persist';
import {
  asciiLowercase,
  attributeValue,
  firstMarkupElement,
  type MarkupElement,
  firstOpenTag,
  markupElements,
  openTags,
  replaceMarkupElements,
  xmlAttributes,
} from '@/lib/server/ooxml-markup';
import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import type { E2BExecutor } from '@/lib/e2b/types';
import { exactCellNumber, isNumericCellText } from './managed-workbook-builder';

export class ManagedOfficeProcessingError extends Error {}

const SPREADSHEET_MAIN_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

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

function resolvedPartName(relationshipsPart: string, target: string): string {
  const base =
    relationshipsPart === '_rels/.rels' ? '' : posix.dirname(posix.dirname(relationshipsPart));
  return posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(base, target));
}

function relationshipTargetPart(relationshipsPart: string, target: string): string {
  const decoded = decodeURIComponent(target.split('#')[0]!);
  if (!decoded || decoded.includes('\\') || decoded.includes('?'))
    throw new Error('Invalid relationship target');
  return resolvedPartName(relationshipsPart, decoded);
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
      const worksheet = /^xl\/worksheets\/[^/]+\.xml$/.test(name);
      parser.on('opentag', (tag) => {
        if (worksheet && tag.prefix && tag.uri === SPREADSHEET_MAIN_NAMESPACE)
          throw new ManagedOfficeProcessingError(
            'Worksheets that prefix their SpreadsheetML elements are not supported.',
          );
        if (!name.endsWith('.rels') || tag.local !== 'Relationship') return;
        const attributes = Object.fromEntries(
          Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
        );
        const id = attributes['Id'];
        const target = attributes['Target'];
        if (!id || !target || relationshipIds.has(id)) throw new Error('Invalid relationship');
        relationshipIds.add(id);
        if (attributes['TargetMode'] === 'External') return;
        const resolved = relationshipTargetPart(name, target);
        if (resolved.startsWith('../') || !parts.has(resolved))
          throw new Error('Missing relationship target');
      });
      parser.write(bytes.toString('utf8')).close();
    } catch (error) {
      if (error instanceof ManagedOfficeProcessingError) throw error;
      throw new ManagedOfficeProcessingError(
        'The Office package has malformed XML or broken relationships.',
      );
    }
  }
  return parts;
}

const DISALLOWED_XML_TEXT = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;

function assertXmlText(value: string): void {
  if (DISALLOWED_XML_TEXT.test(value))
    throw new ManagedOfficeProcessingError('The edit contains unsupported XML characters.');
}

function xmlText(value: string): string {
  assertXmlText(value);
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
  const documentXml = document.toString('utf8');
  if (/<w:(?:ins|del|moveFrom|moveTo)\b/.test(documentXml))
    throw new ManagedOfficeProcessingError(
      'Documents with tracked revisions are not supported by this edit operation.',
    );
  const xml = replacedWordText(
    documentXml,
    source.replacements,
    [...parts.values()].reduce((total, part) => total + part.byteLength, 0) - document.byteLength,
  );
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

function isTextRun(run: MarkupElement): boolean {
  return !run.selfClosing && !run.body.includes('<');
}

function* wordTextRuns(xml: string): Generator<MarkupElement, void> {
  for (const run of markupElements(xml, 'w:t')) {
    if (isTextRun(run)) yield run;
  }
}

const RUN_SEPARATOR = '\u0000';
const SEARCH_ANCHOR_LENGTH = 6;

function nonOverlappingOffsets(text: string, pattern: string, limit: number): number[] {
  const fallback = new Int32Array(pattern.length);
  for (let index = 1, length = 0; index < pattern.length;) {
    if (pattern.charCodeAt(index) === pattern.charCodeAt(length)) fallback[index++] = ++length;
    else if (length) length = fallback[length - 1]!;
    else fallback[index++] = 0;
  }
  const anchor = pattern.slice(0, SEARCH_ANCHOR_LENGTH);
  const offsets: number[] = [];
  let matched = 0;
  for (let index = 0; index < text.length && offsets.length < limit; index += 1) {
    if (matched === 0) {
      index = text.indexOf(anchor, index);
      if (index === -1) break;
    }
    const code = text.charCodeAt(index);
    while (matched && code !== pattern.charCodeAt(matched)) matched = fallback[matched - 1]!;
    if (code === pattern.charCodeAt(matched)) matched += 1;
    if (matched === pattern.length) {
      offsets.push(index + 1 - pattern.length);
      matched = 0;
    }
  }
  return offsets;
}

function replacedAt(
  text: string,
  offsets: readonly number[],
  length: number,
  value: string,
): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (const offset of offsets) {
    pieces.push(text.slice(cursor, offset), value);
    cursor = offset + length;
  }
  pieces.push(text.slice(cursor));
  return pieces.join('');
}

function replacedWordText(
  xml: string,
  replacements: ManagedOfficeSource['replacements'],
  otherPartBytes: number,
): string {
  const sizeLimitError = () =>
    new ManagedOfficeProcessingError('The edit would exceed the Office package size limit.');
  for (const replacement of replacements) {
    assertXmlText(replacement.find);
    assertXmlText(replacement.replace);
    if (!replacement.find)
      throw new ManagedOfficeProcessingError('An edit must name nonempty text.');
  }
  const runs = [...wordTextRuns(xml)];
  const originalTexts = runs.map((run) => decodedXmlText(run.body));
  if (originalTexts.some((text) => text.includes(RUN_SEPARATOR)))
    throw new ManagedOfficeProcessingError('The edit contains unsupported XML characters.');
  let joined = originalTexts.join(RUN_SEPARATOR);
  let projectedBytes = otherPartBytes + Buffer.byteLength(xml);
  for (const { find, replace, expectedMatches } of replacements) {
    const offsets = nonOverlappingOffsets(joined, find, expectedMatches + 1);
    const count = offsets.length;
    if (count !== expectedMatches)
      throw new ManagedOfficeProcessingError(
        'The text match count differs, or the requested text spans unsupported formatting runs.',
      );
    projectedBytes +=
      (Buffer.byteLength(xmlText(replace)) - Buffer.byteLength(xmlText(find))) * count;
    if (projectedBytes > MAX_GENERATED_FILE_BYTES) throw sizeLimitError();
    joined = replacedAt(joined, offsets, find.length, replace);
  }
  const editedTexts = joined.split(RUN_SEPARATOR);
  const pieces: string[] = [];
  let cursor = 0;
  runs.forEach((run, index) => {
    const edited = editedTexts[index]!;
    if (edited === originalTexts[index]) return;
    const open = xml.slice(run.start, run.bodyStart);
    const tag =
      attributeValue(run.attributes, 'xml:space') === undefined
        ? open.replace(/>$/, ' xml:space="preserve">')
        : open;
    pieces.push(xml.slice(cursor, run.start), tag, xmlText(edited), '</w:t>');
    cursor = run.end;
  });
  pieces.push(xml.slice(cursor));
  const edited = pieces.join('');
  if (otherPartBytes + Buffer.byteLength(edited) > MAX_GENERATED_FILE_BYTES) throw sizeLimitError();
  return edited;
}

function assertDistinctWorksheetNames(workbookXml: string): void {
  const names = new Set<string>();
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    if (tag.local !== 'sheet') return;
    const name = Object.values(tag.attributes).find((attribute) => attribute.local === 'name');
    if (!name) return;
    const folded = name.value.trim().toLowerCase();
    if (names.has(folded))
      throw new ManagedOfficeProcessingError(
        'Worksheet names must be unique, ignoring case and surrounding spaces.',
      );
    names.add(folded);
  });
  parser.write(workbookXml).close();
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
  if (format === 'xlsx')
    assertDistinctWorksheetNames(parts.get('xl/workbook.xml')!.toString('utf8'));
  let formulas = 0;
  for (const [name, bytes] of parts) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    const xml = bytes.toString('utf8');
    for (const cell of cellElements(xml)) {
      if (!hasFormula(cell)) continue;
      formulas += 1;
      const value = firstMarkupElement(cell, 'v');
      if (cellAttribute(cell, 't') === 'e' || !value?.body || value.body.includes('<')) {
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

// Rule formulas are evaluated by the engine too. Never add a function that
// reaches outside the workbook or resolves a reference from text.
const RULE_FUNCTIONS: ReadonlySet<string> = new Set([
  ...RECALCULABLE_FUNCTIONS,
  'ISERROR',
  'ISERR',
  'ISNA',
  'ISBLANK',
  'ISNUMBER',
  'ISTEXT',
  'ISNONTEXT',
  'ISLOGICAL',
  'ISEVEN',
  'ISODD',
  'TRUE',
  'FALSE',
  'SEARCH',
  'FIND',
  'LEFT',
  'RIGHT',
  'MID',
  'LEN',
  'TRIM',
  'CLEAN',
  'UPPER',
  'LOWER',
  'PROPER',
  'EXACT',
  'SUBSTITUTE',
  'REPLACE',
  'REPT',
  'CONCATENATE',
  'TEXT',
  'VALUE',
  'TODAY',
  'NOW',
  'DATE',
  'DATEVALUE',
  'TIME',
  'YEAR',
  'MONTH',
  'DAY',
  'HOUR',
  'MINUTE',
  'SECOND',
  'WEEKDAY',
  'WEEKNUM',
  'EDATE',
  'EOMONTH',
  'FLOOR',
  'CEILING',
  'INT',
  'TRUNC',
  'MOD',
  'SIGN',
  'ROW',
  'COLUMN',
  'COUNTBLANK',
  'AVERAGEIF',
  'LARGE',
  'SMALL',
  'RANK',
  'STDEV',
  'STDEVP',
]);

const RULE_ELEMENTS: ReadonlySet<string> = new Set([
  'conditionalFormatting',
  'conditionalFormattings',
  'cfRule',
  'cfvo',
  'dataValidations',
  'dataValidation',
]);

const RULE_FORMULA_ELEMENTS: ReadonlySet<string> = new Set(['formula', 'formula1', 'formula2']);

const FORMULA_ELEMENTS: ReadonlySet<string> = new Set([
  'f',
  'formula',
  'formula1',
  'formula2',
  'calculatedColumnFormula',
  'totalsRowFormula',
  'definedName',
]);

function uncheckableFormula(): ManagedOfficeProcessingError {
  return new ManagedOfficeProcessingError(
    'A workbook formula contains markup the managed recalculation contract cannot check.',
  );
}

function uncheckablePart(): ManagedOfficeProcessingError {
  return new ManagedOfficeProcessingError(
    'The workbook contains a part the managed recalculation contract cannot check.',
  );
}

function assertRecalculablePart(xml: string): void {
  const open: { text: string; nested: boolean; allowed: ReadonlySet<string> }[] = [];
  let ruleDepth = 0;
  const parser = new SaxesParser({ xmlns: true });
  const append = (text: string) => {
    const formula = open[open.length - 1];
    if (!formula) return;
    if (formula.nested && /\S/.test(text)) throw uncheckableFormula();
    formula.text += text;
  };
  parser.on('xmldecl', ({ encoding }) => {
    if (encoding !== undefined && !/^utf-?8$/i.test(encoding)) throw uncheckablePart();
  });
  parser.on('doctype', () => {
    throw new ManagedOfficeProcessingError('XML entity declarations are not supported.');
  });
  parser.on('opentag', (tag) => {
    if (RULE_ELEMENTS.has(tag.local)) ruleDepth += 1;
    for (const attribute of Object.values(tag.attributes)) {
      if (attribute.prefix === 'xmlns') continue;
      if (attribute.local === 'formula')
        assertRecalculableFormula(attribute.value, RECALCULABLE_FUNCTIONS);
      else if (attribute.local === 'val' && tag.local === 'cfvo')
        assertRecalculableFormula(attribute.value, RULE_FUNCTIONS);
    }
    const enclosing = open[open.length - 1];
    if (!FORMULA_ELEMENTS.has(tag.local)) {
      if (enclosing) throw uncheckableFormula();
      return;
    }
    if (enclosing) {
      if (/\S/.test(enclosing.text)) throw uncheckableFormula();
      enclosing.nested = true;
    }
    open.push({
      text: '',
      nested: false,
      allowed:
        ruleDepth > 0 || RULE_FORMULA_ELEMENTS.has(tag.local)
          ? RULE_FUNCTIONS
          : RECALCULABLE_FUNCTIONS,
    });
  });
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', (tag) => {
    if (open.length && FORMULA_ELEMENTS.has(tag.local)) {
      const formula = open.pop()!;
      assertRecalculableFormula(formula.text, formula.allowed);
    }
    if (RULE_ELEMENTS.has(tag.local)) ruleDepth -= 1;
  });
  parser.write(xml).close();
}

const PASSIVE_RELATIONSHIP_TYPES: ReadonlySet<string> = new Set([
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/image',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/printerSettings',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/printerSettings',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/vmlDrawing',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/font',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/audio',
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/video',
  'http://purl.oclc.org/ooxml/officeDocument/relationships/video',
  'http://schemas.microsoft.com/office/2007/relationships/media',
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail',
  'http://schemas.microsoft.com/office/2007/relationships/hdphoto',
]);

const PASSIVE_MEDIA_TYPES = ['image/', 'audio/', 'video/', 'font/'] as const;

const PASSIVE_CONTENT_TYPES: ReadonlySet<string> = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.printersettings',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.printersettings',
  'application/vnd.openxmlformats-officedocument.presentationml.printersettings',
  'application/vnd.openxmlformats-officedocument.vmldrawing',
  'application/vnd.openxmlformats-officedocument.obfuscatedfont',
  'application/x-fontdata',
  'application/x-font-ttf',
]);

function relationshipTypesByPart(parts: ReadonlyMap<string, Buffer>): Map<string, string[]> {
  const types = new Map<string, string[]>();
  for (const [name, bytes] of parts) {
    if (!name.endsWith('.rels')) continue;
    const parser = new SaxesParser({ xmlns: true });
    parser.on('opentag', (tag) => {
      if (tag.local !== 'Relationship') return;
      const attributes = Object.fromEntries(
        Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
      );
      const target = attributes['Target'];
      if (!target || asciiLowercase((attributes['TargetMode'] ?? '').trim()) === 'external') return;
      // The engine may open the target without percent-decoding it, or match names ignoring case.
      const candidates = new Set(
        [relationshipTargetPart(name, target), resolvedPartName(name, target)].map(asciiLowercase),
      );
      for (const part of candidates) {
        const known = types.get(part);
        if (known) known.push(attributes['Type'] ?? '');
        else types.set(part, [attributes['Type'] ?? '']);
      }
    });
    parser.write(bytes.toString('utf8')).close();
  }
  return types;
}

function declaredContentTypes(parts: ReadonlyMap<string, Buffer>): (part: string) => string[] {
  const defaults = new Map<string, string>();
  const decodedOverrides = new Map<string, string>();
  const writtenOverrides = new Map<string, string>();
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    const attributes = Object.fromEntries(
      Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
    );
    const contentType = asciiLowercase((attributes['ContentType'] ?? '').split(';')[0]!.trim());
    const partName = attributes['PartName'];
    if (tag.local === 'Default' && attributes['Extension'] !== undefined)
      defaults.set(asciiLowercase(attributes['Extension']), contentType);
    if (tag.local === 'Override' && partName !== undefined) {
      decodedOverrides.set(
        asciiLowercase(decodeURIComponent(partName).replace(/^\//, '')),
        contentType,
      );
      writtenOverrides.set(asciiLowercase(partName.replace(/^\//, '')), contentType);
    }
  });
  parser.write(parts.get('[Content_Types].xml')?.toString('utf8') ?? '').close();
  return (part) => {
    const lower = asciiLowercase(part);
    const extension = posix.extname(lower).slice(1);
    const fallback = (extension ? defaults.get(extension) : undefined) ?? '';
    return [decodedOverrides.get(lower) ?? fallback, writtenOverrides.get(lower) ?? fallback];
  };
}

function isPassiveContentType(contentType: string): boolean {
  return (
    PASSIVE_MEDIA_TYPES.some((mediaType) => contentType.startsWith(mediaType)) ||
    PASSIVE_CONTENT_TYPES.has(contentType)
  );
}

function assertEnginePartsPass(
  parts: ReadonlyMap<string, Buffer>,
  check: (xml: string) => void,
  uncheckable: () => ManagedOfficeProcessingError,
): void {
  let relationshipTypes: Map<string, string[]>;
  let contentTypes: (part: string) => string[];
  try {
    relationshipTypes = relationshipTypesByPart(parts);
    contentTypes = declaredContentTypes(parts);
  } catch {
    throw uncheckable();
  }
  for (const [name, bytes] of parts) {
    const inbound = relationshipTypes.get(asciiLowercase(name)) ?? [];
    if (
      contentTypes(name).every(isPassiveContentType) &&
      inbound.every((type) => PASSIVE_RELATIONSHIP_TYPES.has(type))
    ) {
      if (inbound.length) continue;
      try {
        check(bytes.toString('utf8'));
      } catch (error) {
        if (error instanceof ManagedOfficeProcessingError) throw error;
      }
      continue;
    }
    if (asciiLowercase(name).endsWith('.bin')) throw uncheckable();
    try {
      check(bytes.toString('utf8'));
    } catch (error) {
      if (error instanceof ManagedOfficeProcessingError) throw error;
      throw uncheckable();
    }
  }
}

function hasExternalRelationship(xml: string): boolean {
  let external = false;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    for (const attribute of Object.values(tag.attributes)) {
      if (
        asciiLowercase(attribute.local) === 'targetmode' &&
        asciiLowercase(attribute.value.trim()) === 'external'
      )
        external = true;
    }
  });
  parser.write(xml).close();
  return external;
}

function externalWorkbookFormula(): ManagedOfficeProcessingError {
  return new ManagedOfficeProcessingError('External workbook formulas are not supported.');
}

const FUTURE_FUNCTION_PREFIX = /^(?:_xl(?:fn|ws|pm)\.)+/i;
const STRUCTURED_REFERENCE_ITEM = String.raw`\[[^\[\]'"]*\]`;
const STRUCTURED_REFERENCE = new RegExp(
  String.raw`^(?:${STRUCTURED_REFERENCE_ITEM}|\[@${STRUCTURED_REFERENCE_ITEM}(?:\s*:\s*${STRUCTURED_REFERENCE_ITEM})?\]|\[\s*${STRUCTURED_REFERENCE_ITEM}(?:\s*[,:]\s*${STRUCTURED_REFERENCE_ITEM})*\s*\])$`,
);
const UNQUALIFIED_STRUCTURED_REFERENCE = /^\[[@#[]/;
const STRUCTURED_REFERENCE_FOLLOWER = /[\s+\-*/^&=<>,:)%]/;

function bracketGroupEnd(formula: string, start: number): number {
  let depth = 0;
  for (let index = start; index < formula.length; index += 1) {
    if (formula[index] === '[') depth += 1;
    else if (formula[index] === ']') {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  throw externalWorkbookFormula();
}

function assertNoOtherWorkbookReference(formula: string): void {
  let index = 0;
  while (index < formula.length) {
    const character = formula[index]!;
    if (character === '"') index = quotedEnd(formula, index);
    else if (character === "'") {
      const end = quotedEnd(formula, index);
      if (/[[\]]/.test(formula.slice(index, end))) throw externalWorkbookFormula();
      index = end;
    } else if (character === '[') {
      const end = bracketGroupEnd(formula, index);
      const group = formula.slice(index, end);
      const following = formula[end];
      const qualified = index > 0 && IDENTIFIER_PART.test(formula[index - 1]!);
      const thisWorkbookName = !qualified && group === '[0]' && following === '!';
      const structured =
        STRUCTURED_REFERENCE.test(group) &&
        (qualified || UNQUALIFIED_STRUCTURED_REFERENCE.test(group)) &&
        (following === undefined || STRUCTURED_REFERENCE_FOLLOWER.test(following));
      if (!thisWorkbookName && !structured) throw externalWorkbookFormula();
      index = end;
    } else if (character === ']') throw externalWorkbookFormula();
    else index += 1;
  }
}

function assertRecalculableFormula(formula: string, allowed: ReadonlySet<string>): void {
  if (/\\|\||:\/\/|file:/i.test(formula)) throw externalWorkbookFormula();
  assertNoOtherWorkbookReference(formula);
  for (const name of calledFunctionNames(formula)) {
    if (!allowed.has(name.replace(FUTURE_FUNCTION_PREFIX, '').toUpperCase()))
      throw new ManagedOfficeProcessingError(
        'This workbook function is not supported by the managed recalculation contract.',
      );
  }
}

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
    if (name.endsWith('.rels') && hasExternalRelationship(bytes.toString('utf8')))
      throw new ManagedOfficeProcessingError(
        'External workbook links are not supported during recalculation.',
      );
  }
  assertEnginePartsPass(parts, assertRecalculablePart, uncheckablePart);
  signal?.throwIfAborted();
  const directory = `/home/user/.agi-office-${randomUUID()}`;
  const input = `${directory}/input.xlsx`;
  const output = `${directory}/recalculated/input.xlsx`;
  const calculationInput = new JSZip();
  for (const [name, bytes] of parts) {
    let xml = bytes.toString('utf8');
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      const calculated = calculatedCell(xml);
      xml = replaceCells(xml, (cell) => (calculated(cell) ? removeCachedValues(cell) : cell));
      calculationInput.file(name, xml);
    } else if (name === 'xl/workbook.xml') {
      xml = replaceMarkupElements(xml, 'calcPr', () => '');
      const root = firstMarkupElement(xml, 'workbook');
      if (root && !root.selfClosing) {
        const closeStart = root.bodyStart + root.body.length;
        xml =
          xml.slice(0, closeStart) +
          '<calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>' +
          xml.slice(closeStart);
      }
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
      const cells = cellsByAddress(calculatedParts.get(name)?.toString('utf8') ?? '');
      for (const cell of cellElements(bytes.toString('utf8'))) {
        const address = cellAddress(cell);
        if (address && hasFormula(cell) && !hasFormula(cells.get(address) ?? ''))
          throw new ManagedOfficeProcessingError('Recalculation removed a workbook formula.');
      }
    }
    const preserved = new JSZip();
    for (const [name, bytes] of parts) {
      let content = bytes;
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
        const original = bytes.toString('utf8');
        const caches = cellsByAddress(calculatedParts.get(name)!.toString('utf8'));
        const calculated = calculatedCell(original);
        content = Buffer.from(
          replaceCells(original, (cell) => {
            const address = cellAddress(cell);
            if (!address || !calculated(cell)) return cell;
            return withEvaluatedCache(cell, caches.get(address) ?? '');
          }),
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

const ACTIVE_FIELD_KEYWORDS = [
  'ddeauto',
  'dde',
  'includetext',
  'includepicture',
  'database',
  'link',
] as const;

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /\w/.test(character);
}

function isActiveInstruction(instruction: string): boolean {
  const text = asciiLowercase(instruction);
  return ACTIVE_FIELD_KEYWORDS.some((keyword) => {
    for (
      let start = text.indexOf(keyword);
      start !== -1;
      start = text.indexOf(keyword, start + 1)
    ) {
      if (!isWordCharacter(text[start - 1]) && !isWordCharacter(text[start + keyword.length]))
        return true;
    }
    return false;
  });
}

function hasActiveField(xml: string): boolean {
  const fields: string[][] = [['']];
  let capturing = 0;
  let active = false;
  // A nested field's result is spliced into its parent's instruction, so read the parent both joined and split there.
  const check = (segments: string[]) => {
    if (isActiveInstruction(segments.join('')) || isActiveInstruction(segments.join(' ')))
      active = true;
  };
  const parser = new SaxesParser({ xmlns: true });
  const append = (value: string) => {
    if (!capturing) return;
    const segments = fields[fields.length - 1]!;
    segments.push(segments.pop()! + value);
  };
  parser.on('opentag', (tag) => {
    if (tag.local === 'instrText') capturing += 1;
    for (const attribute of Object.values(tag.attributes)) {
      if (tag.local === 'fldSimple' && attribute.local === 'instr') check([attribute.value]);
      if (tag.local !== 'fldChar' || attribute.local !== 'fldCharType') continue;
      if (attribute.value === 'begin') {
        fields[fields.length - 1]!.push('');
        fields.push(['']);
      } else if (attribute.value === 'separate' || attribute.value === 'end') {
        check(fields[fields.length - 1]!);
        if (attribute.value === 'end' && fields.length > 1) fields.pop();
        else fields[fields.length - 1] = [''];
      }
    }
  });
  parser.on('text', append);
  parser.on('cdata', append);
  parser.on('closetag', (tag) => {
    if (tag.local === 'instrText') capturing -= 1;
  });
  parser.write(xml).close();
  for (const segments of fields) check(segments);
  return active;
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
    if (name.endsWith('.rels') && hasExternalRelationship(bytes.toString('utf8')))
      throw new ManagedOfficeProcessingError(
        'External document links must be removed before managed rendering.',
      );
  }
  if (format !== 'pdf')
    assertEnginePartsPass(
      parts,
      (xml) => {
        if (hasActiveField(xml))
          throw new ManagedOfficeProcessingError(
            'Active document fields are unsupported during rendering.',
          );
        if (format === 'xlsx') assertRecalculablePart(xml);
      },
      () =>
        new ManagedOfficeProcessingError(
          'The document contains a part that cannot be checked before rendering.',
        ),
    );
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
  const append = (value: string) => {
    text += value;
  };
  parser.on('text', append);
  parser.on('cdata', append);
  parser.write(`<text>${xml}</text>`).close();
  return text;
}

function hasFormula(cell: string): boolean {
  return cell.includes('<f') && firstMarkupElement(cell, 'f') !== undefined;
}

function* cellElements(sheetXml: string): Generator<string, void> {
  for (const cell of markupElements(sheetXml, 'c')) yield sheetXml.slice(cell.start, cell.end);
}

function replaceCells(sheetXml: string, replace: (cell: string) => string): string {
  return replaceMarkupElements(sheetXml, 'c', (cell) =>
    replace(sheetXml.slice(cell.start, cell.end)),
  );
}

function removeCachedValues(cell: string): string {
  return replaceMarkupElements(cell, 'v', () => '');
}

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_PART = /[A-Za-z0-9_.]/;

function quotedEnd(formula: string, start: number): number {
  const quote = formula[start]!;
  for (let index = start + 1; index < formula.length; index += 1) {
    if (formula[index] !== quote) continue;
    if (formula[index + 1] !== quote) return index + 1;
    index += 1;
  }
  throw uncheckableFormula();
}

function calledFunctionNames(formula: string): string[] {
  const names: string[] = [];
  let index = 0;
  while (index < formula.length) {
    const character = formula[index]!;
    if (character === '"' || character === "'") {
      if (index > 0 && IDENTIFIER_PART.test(formula[index - 1]!)) throw uncheckableFormula();
      index = quotedEnd(formula, index);
      if (character === "'" && formula[index] !== '!') throw uncheckableFormula();
    } else if (IDENTIFIER_START.test(character)) {
      const start = index;
      while (index < formula.length && IDENTIFIER_PART.test(formula[index]!)) index += 1;
      const name = formula.slice(start, index);
      while (/\s/.test(formula[index] ?? '')) index += 1;
      if (formula[index] === '(') names.push(name);
    } else index += 1;
  }
  return names;
}

interface CellRange {
  firstColumn: number;
  firstRow: number;
  lastColumn: number;
  lastRow: number;
}

function cellAttribute(cell: string, name: string): string | undefined {
  return attributeValue(cell, name, '<c'.length);
}

function cellAddress(cell: string): string | undefined {
  return cellAttribute(cell, 'r') || undefined;
}

function cellsByAddress(sheetXml: string): Map<string, string> {
  const cells = new Map<string, string>();
  for (const cell of cellElements(sheetXml)) {
    const address = cellAddress(cell);
    if (address) cells.set(address, cell);
  }
  return cells;
}

function cellCoordinates(address: string): { column: number; row: number } | null {
  const parts = address.match(/^\$?([A-Za-z]{1,3})\$?(\d+)$/);
  if (!parts) return null;
  let column = 0;
  for (const letter of parts[1]!.toUpperCase()) column = column * 26 + letter.charCodeAt(0) - 64;
  return { column, row: Number(parts[2]) };
}

function formulaResultRange(cell: string, address: string | undefined): CellRange | undefined {
  const formula = firstOpenTag(cell, 'f');
  if (formula === undefined) return undefined;
  const kind = attributeValue(formula, 't', '<f'.length);
  if (kind !== 'array' && kind !== 'dataTable') return undefined;
  const reference = attributeValue(formula, 'ref', '<f'.length) || address || '';
  const [from, to = from] = reference.split(':');
  const first = cellCoordinates(from ?? '');
  const last = cellCoordinates(to ?? '');
  if (!first || !last)
    throw new ManagedOfficeProcessingError('An array formula result range is unreadable.');
  return {
    firstColumn: Math.min(first.column, last.column),
    firstRow: Math.min(first.row, last.row),
    lastColumn: Math.max(first.column, last.column),
    lastRow: Math.max(first.row, last.row),
  };
}

function byNumber(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function addressesWithinRanges(
  addresses: readonly string[],
  ranges: readonly CellRange[],
): Set<string> {
  const within = new Set<string>();
  if (!ranges.length) return within;
  const points = addresses
    .map((address) => ({ address, coordinates: cellCoordinates(address) }))
    .filter((point) => point.coordinates !== null)
    .sort((a, b) => byNumber(a.coordinates!.row, b.coordinates!.row));
  const opening = [...ranges].sort((a, b) => byNumber(a.firstRow, b.firstRow));
  const closing = [...ranges].sort((a, b) => byNumber(a.lastRow, b.lastRow));
  let columns = 1;
  for (const range of ranges) columns = Math.max(columns, range.lastColumn + 1);
  const tree = new Int32Array(columns + 1);
  const add = (column: number, change: number) => {
    for (let index = column; index <= columns; index += index & -index)
      tree[index] = (tree[index] ?? 0) + change;
  };
  const cover = (range: CellRange, change: number) => {
    add(range.firstColumn, change);
    add(range.lastColumn + 1, -change);
  };
  const coverage = (column: number) => {
    let total = 0;
    for (let index = Math.min(column, columns); index > 0; index -= index & -index)
      total += tree[index] ?? 0;
    return total;
  };
  let opened = 0;
  let closed = 0;
  for (const { address, coordinates } of points) {
    const { column, row } = coordinates!;
    while (opened < opening.length && opening[opened]!.firstRow <= row)
      cover(opening[opened++]!, 1);
    while (closed < closing.length && closing[closed]!.lastRow < row) cover(closing[closed++]!, -1);
    if (coverage(column) > 0) within.add(address);
  }
  return within;
}

function arrayResultAddresses(sheetXml: string, queried: readonly string[] = []): Set<string> {
  const addresses = [...queried];
  const ranges: CellRange[] = [];
  for (const cell of cellElements(sheetXml)) {
    const address = cellAddress(cell);
    if (address) addresses.push(address);
    const range = formulaResultRange(cell, address);
    if (range) ranges.push(range);
  }
  return addressesWithinRanges(addresses, ranges);
}

function calculatedCell(sheetXml: string): (cell: string) => boolean {
  const results = arrayResultAddresses(sheetXml);
  return (cell) => {
    if (hasFormula(cell)) return true;
    const address = cellAddress(cell);
    return address !== undefined && results.has(address);
  };
}

const FORMULA_KIND_ATTRIBUTES: ReadonlySet<string> = new Set(['t', 'ref', 'si']);

function hasFormulaKindAttribute(formulaTag: string): boolean {
  return xmlAttributes(formulaTag, '<f'.length).some(({ name }) =>
    FORMULA_KIND_ATTRIBUTES.has(name.slice(name.indexOf(':') + 1)),
  );
}

function plainOpeningTag(tag: string): string {
  let end = tag.length - 1;
  if (tag[end - 1] === '/') end -= 1;
  while (end > 0 && /\s/.test(tag[end - 1] ?? '')) end -= 1;
  return `${tag.slice(0, end)}>`;
}

function withoutTypeAttribute(openingTag: string): string {
  const type = xmlAttributes(openingTag, '<c'.length).find((attribute) => attribute.name === 't');
  if (!type) return openingTag;
  let start = type.start;
  while (start > 0 && /\s/.test(openingTag[start - 1] ?? '')) start -= 1;
  return openingTag.slice(0, start) + openingTag.slice(type.end);
}

function comparableCellValue(value: string | number | undefined): string | number | undefined {
  return typeof value === 'string' ? (exactCellNumber(value) ?? value) : value;
}

function withEvaluatedCache(cell: string, evaluated: string): string {
  const value = evaluated.match(/<v>([^<]+)<\/v>/)?.[0];
  const type = cellAttribute(evaluated, 't') || undefined;
  if (!value || (type && !['n', 'str', 'b'].includes(type)))
    throw new ManagedOfficeProcessingError('The evaluator returned an unsupported formula cache.');
  const closed = cell.endsWith('/>') ? `${cell.slice(0, -2).trimEnd()}></c>` : cell;
  const open = firstOpenTag(closed, 'c')!;
  const opened =
    withoutTypeAttribute(open).slice(0, -1) +
    (type ? ` t="${type}">` : '>') +
    closed.slice(open.length);
  return removeCachedValues(opened).replace(/<\/c\s*>$/, (close) => value + close);
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
  assertDistinctWorksheetNames(parts.get('xl/workbook.xml')!.toString('utf8'));
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
    ...markupElements(parts.get('xl/sharedStrings.xml')?.toString('utf8') ?? '', 'si'),
  ].map((item) => decodedXmlText(item.body));
  const editsByPart = new Map<string, Map<string, ManagedWorkbookSource['edits'][number]>>();
  for (const edit of source.edits) {
    const part = sheets.get(edit.sheet);
    if (!part || !/^xl\/worksheets\/[^/]+\.xml$/.test(part) || !parts.has(part))
      throw new ManagedOfficeProcessingError(
        'The requested worksheet is unavailable or unsupported.',
      );
    const edits = editsByPart.get(part) ?? new Map();
    if (edits.has(edit.cell))
      throw new ManagedOfficeProcessingError('Each workbook cell may be edited once per request.');
    editsByPart.set(part, edits.set(edit.cell, edit));
  }
  for (const [part, edits] of editsByPart) {
    const found = new Set<string>();
    const sheetXml = parts.get(part)!.toString('utf8');
    const arrayResults = arrayResultAddresses(sheetXml, [...edits.keys()]);
    if ([...edits.keys()].some((cell) => arrayResults.has(cell)))
      throw new ManagedOfficeProcessingError(
        'Shared, array and spill formula edits are unsupported.',
      );
    const xml = replaceCells(sheetXml, (cell) => {
      const address = cellAddress(cell);
      const edit = address === undefined ? undefined : edits.get(address);
      if (!edit) return cell;
      if ([...openTags(cell, 'f')].some(hasFormulaKindAttribute))
        throw new ManagedOfficeProcessingError(
          'Shared, array and spill formula edits are unsupported.',
        );
      found.add(edit.cell);
      const formulaElement = firstMarkupElement(cell, 'f');
      const formula =
        formulaElement && !formulaElement.selfClosing ? formulaElement.body : undefined;
      const value = firstMarkupElement(cell, 'v')?.body ?? '';
      const type = cellAttribute(cell, 't');
      const current =
        formula !== undefined
          ? '=' + decodedXmlText(formula)
          : type === 's'
            ? shared[Number(value)]
            : type === 'inlineStr'
              ? decodedXmlText(firstMarkupElement(cell, 'is')?.body ?? '')
              : type === 'str'
                ? decodedXmlText(value)
                : Number(value);
      if (comparableCellValue(current) !== comparableCellValue(edit.expected))
        throw new ManagedOfficeProcessingError(
          'A workbook cell differs from the expected value; refresh the source before editing.',
        );
      const open = withoutTypeAttribute(plainOpeningTag(firstOpenTag(cell, 'c')!));
      if (typeof edit.value === 'number') return open + `<v>${edit.value}</v></c>`;
      const textCell =
        formula === undefined && (type === 's' || type === 'inlineStr' || type === 'str');
      if (!textCell && isNumericCellText(edit.value)) return open + `<v>${edit.value}</v></c>`;
      if (edit.value.startsWith('=')) return open + `<f>${xmlText(edit.value.slice(1))}</f></c>`;
      return (
        open.replace(/>$/, ' t="inlineStr">') +
        `<is><t xml:space="preserve">${xmlText(edit.value)}</t></is></c>`
      );
    });
    if (found.size !== edits.size)
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
