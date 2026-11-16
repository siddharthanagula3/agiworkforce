import { withoutCodeFences } from './message-format';

export interface ExtraSection {
  heading: string;
  lines: string[];
}

export function openExtraSection(sections: ExtraSection[], heading: string): void {
  sections.push({ heading, lines: [] });
}

export function appendExtraLine(sections: ExtraSection[], heading: string, line: string): void {
  const text = line.trim();
  if (!text) return;
  const last = sections[sections.length - 1];
  if (last && last.heading === heading) {
    last.lines.push(text);
    return;
  }
  sections.push({ heading, lines: [text] });
}

export function stripListMarker(line: string): string {
  return line
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\*\*/g, '')
    .trim();
}

export interface ParsedRecipe {
  title: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  servings: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  extraSections: ExtraSection[];
}

export function parseRecipe(content: string): ParsedRecipe {
  const lines = content.split('\n');

  let title = '';
  const prepTime: string[] = [];
  const cookTime: string[] = [];
  const totalTime: string[] = [];
  const servings: string[] = [];
  let description = '';
  const ingredients: string[] = [];
  const instructions: string[] = [];

  type Section = 'preamble' | 'ingredients' | 'instructions' | 'other';
  let currentSection: Section = 'preamble';
  const descLines: string[] = [];
  const extraSections: ExtraSection[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!title && /^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    const prepMatch = trimmed.match(/\*?\*?prep(?:\s+time)?\*?\*?\s*[:]\s*(.+)/i);
    if (prepMatch) {
      prepTime.push((prepMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const cookMatch = trimmed.match(/\*?\*?cook(?:\s+time)?\*?\*?\s*[:]\s*(.+)/i);
    if (cookMatch) {
      cookTime.push((cookMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const totalMatch = trimmed.match(/\*?\*?total(?:\s+time)?\*?\*?\s*[:]\s*(.+)/i);
    if (totalMatch) {
      totalTime.push((totalMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const servingsMatch = trimmed.match(/\*?\*?servings?\*?\*?\s*[:]\s*(.+)/i);
    if (servingsMatch) {
      servings.push((servingsMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const yieldsMatch = trimmed.match(/\*?\*?yields?\*?\*?\s*[:]\s*(.+)/i);
    if (yieldsMatch) {
      servings.push((yieldsMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }

    if (
      /^#{1,4}\s*\*?\*?ingredients\*?\*?/i.test(trimmed) ||
      /^\*\*ingredients\*\*/i.test(trimmed)
    ) {
      currentSection = 'ingredients';
      continue;
    }
    if (
      /^#{1,4}\s*\*?\*?(instructions|directions|steps|method|preparation)\*?\*?/i.test(trimmed) ||
      /^\*\*(instructions|directions|steps|method|preparation)\*\*/i.test(trimmed)
    ) {
      currentSection = 'instructions';
      continue;
    }
    if (/^#{1,4}\s/.test(trimmed)) {
      currentSection = 'other';
      extraSections.push({
        heading: trimmed.replace(/^#{1,4}\s*/, '').replace(/\*\*/g, ''),
        lines: [],
      });
      continue;
    }

    if (currentSection === 'preamble') {
      descLines.push(trimmed);
    } else if (currentSection === 'ingredients') {
      const cleaned = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (cleaned) ingredients.push(cleaned);
    } else if (currentSection === 'instructions') {
      const cleaned = trimmed
        .replace(/^\d+\.\s+/, '')
        .replace(/^\*\*step\s+\d+[:.]\*\*\s*/i, '')
        .replace(/^step\s+\d+[:.]\s*/i, '');
      if (cleaned) instructions.push(cleaned);
    } else if (currentSection === 'other') {
      const cleaned = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (cleaned) extraSections[extraSections.length - 1]?.lines.push(cleaned);
    }
  }

  description = descLines
    .filter((l) => !l.startsWith('#'))
    .join(' ')
    .replace(/\*\*/g, '')
    .trim();

  return {
    title: title || 'Recipe',
    prepTime: prepTime[0] || '',
    cookTime: cookTime[0] || '',
    totalTime: totalTime[0] || '',
    servings: servings[0] || '',
    description,
    ingredients,
    instructions,
    extraSections: extraSections.filter((section) => section.lines.length > 0),
  };
}

export interface ComparisonItem {
  name: string;
  pros: string[];
  cons: string[];
  features: Record<string, string>;
}

export interface ParsedComparison {
  title: string;
  items: [ComparisonItem, ComparisonItem];
  winner: string;
  winnerReason: string;
  featureKeys: string[];
  extraSections: ExtraSection[];
}

export function parseComparison(content: string): ParsedComparison {
  const lines = content.split('\n');

  let title = '';
  let winner = '';
  let winnerReason = '';
  const items: [ComparisonItem, ComparisonItem] = [
    { name: '', pros: [], cons: [], features: {} },
    { name: '', pros: [], cons: [], features: {} },
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      break;
    }
  }

  const vsMatch = title.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
  if (vsMatch) {
    items[0].name = (vsMatch[1] ?? '').trim();
    items[1].name = (vsMatch[2] ?? '').trim();
  }

  type Section =
    'none' | 'item0' | 'item1' | 'pros0' | 'cons0' | 'pros1' | 'cons1' | 'winner' | 'table';
  let currentSection: Section = 'none';
  const extraSections: ExtraSection[] = [];
  let currentHeading = '';

  const headingText = (line: string): string =>
    line
      .replace(/^#+\s*/, '')
      .replace(/\*\*/g, '')
      .trim();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed
      .toLowerCase()
      .replace(/\*\*/g, '')
      .replace(/^#+\s*/, '');

    const isHeadingLine = /^#{1,6}\s+/.test(trimmed);
    // Only a heading or a bare label opens an item's section. Prose that merely
    // starts with the item's name ("Postgres is the older engine…") is content,
    // and matching it here would swallow the sentence whole.
    const opensItemSection = (name: string): boolean =>
      Boolean(name) &&
      (isHeadingLine
        ? lower.startsWith(name.toLowerCase())
        : lower.replace(/[:.]$/, '') === name.toLowerCase());

    if (opensItemSection(items[0].name)) {
      currentSection = 'item0';
      currentHeading = headingText(trimmed);
      continue;
    }
    if (opensItemSection(items[1].name)) {
      currentSection = 'item1';
      currentHeading = headingText(trimmed);
      continue;
    }

    const prosHeading = trimmed.match(/^#{2,4}\s*\*?\*?(pros|advantages|strengths)\*?\*?\s*(.*)$/i);
    if (prosHeading) {
      if (currentSection === 'item0' || currentSection === 'pros0' || currentSection === 'cons0') {
        currentSection = 'pros0';
      } else {
        currentSection = 'pros1';
      }
      const trailing = (prosHeading[2] ?? '').replace(/\*\*/g, '').trim();
      if (trailing) appendExtraLine(extraSections, headingText(trimmed), trailing);
      continue;
    }
    const consHeading = trimmed.match(
      /^#{2,4}\s*\*?\*?(cons|disadvantages|weaknesses)\*?\*?\s*(.*)$/i,
    );
    if (consHeading) {
      if (currentSection === 'item0' || currentSection === 'pros0' || currentSection === 'cons0') {
        currentSection = 'cons0';
      } else {
        currentSection = 'cons1';
      }
      const trailing = (consHeading[2] ?? '').replace(/\*\*/g, '').trim();
      if (trailing) appendExtraLine(extraSections, headingText(trimmed), trailing);
      continue;
    }

    const winnerHeading = trimmed.match(
      /^#{2,4}\s*\*?\*?(winner|verdict|recommendation|conclusion)\*?\*?\s*(.*)$/i,
    );
    if (winnerHeading) {
      currentSection = 'winner';
      currentHeading = headingText(trimmed);
      const trailing = (winnerHeading[2] ?? '')
        .replace(/^[:\-–]\s*/, '')
        .replace(/\*\*/g, '')
        .trim();
      if (trailing) {
        winnerReason = trailing;
        if (!winner) {
          if (items[0].name && lower.includes(items[0].name.toLowerCase())) winner = items[0].name;
          else if (items[1].name && lower.includes(items[1].name.toLowerCase()))
            winner = items[1].name;
        }
      }
      continue;
    }
    if (currentSection === 'winner') {
      const text = trimmed.replace(/\*\*/g, '').replace(/^[-*]\s+/, '');
      if (!winner) {
        if (items[0].name && lower.includes(items[0].name.toLowerCase())) winner = items[0].name;
        else if (items[1].name && lower.includes(items[1].name.toLowerCase()))
          winner = items[1].name;
      }
      if (!winnerReason) winnerReason = text;
      else appendExtraLine(extraSections, currentHeading, text);
      continue;
    }

    const unmatchedHeading = trimmed.match(/^(#{1,6})\s+/);
    if (unmatchedHeading) {
      currentHeading = headingText(trimmed);
      // A top-level heading ends the item it followed; a deeper one is a
      // sub-section of that item, so pros/cons after it still land on it.
      if ((unmatchedHeading[1] ?? '').length <= 2) currentSection = 'none';
      openExtraSection(extraSections, currentHeading);
      continue;
    }

    const isList = /^[-*]\s+/.test(trimmed);
    if (isList) {
      const text = trimmed.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
      if (currentSection === 'pros0') items[0].pros.push(text);
      else if (currentSection === 'cons0') items[0].cons.push(text);
      else if (currentSection === 'pros1') items[1].pros.push(text);
      else if (currentSection === 'cons1') items[1].cons.push(text);
      else appendExtraLine(extraSections, currentHeading, text);
      continue;
    }

    if (trimmed.startsWith('|')) {
      if (/^\|[-\s|]+\|$/.test(trimmed)) continue;
      const cells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 3) {
        if (!items[0].name && cells[1]) {
          items[0].name = cells[1].replace(/\*\*/g, '');
          items[1].name = cells[2]?.replace(/\*\*/g, '') || 'Option B';
        } else {
          const featureKey = (cells[0] ?? '').replace(/\*\*/g, '');
          items[0].features[featureKey] = cells[1]?.replace(/\*\*/g, '') || '';
          items[1].features[featureKey] = cells[2]?.replace(/\*\*/g, '') || '';
        }
        continue;
      }
      appendExtraLine(extraSections, currentHeading, stripListMarker(trimmed.replace(/\|/g, ' ')));
      continue;
    }

    appendExtraLine(extraSections, currentHeading, stripListMarker(trimmed));
  }

  if (!items[0].name) items[0].name = 'Option A';
  if (!items[1].name) items[1].name = 'Option B';

  const featureKeys = [
    ...new Set([...Object.keys(items[0].features), ...Object.keys(items[1].features)]),
  ];

  return { title, items, winner, winnerReason, featureKeys, extraSections };
}

export interface ParsedStep {
  title: string;
  details: string[];
}

export interface ParsedSteps {
  title: string;
  description: string;
  steps: ParsedStep[];
  extraSections: ExtraSection[];
}

export function parseSteps(content: string): ParsedSteps {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  const steps: ParsedStep[] = [];
  const descLines: string[] = [];
  const extraSections: ExtraSection[] = [];
  let inPreamble = true;
  let extraHeading: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = (lines[i] ?? '').trim();
    if (!trimmed) continue;

    if (!title && /^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    const stepHeaderMatch = trimmed.match(
      /^(?:#{2,4}\s+)?(?:step\s+)?(\d+)[.:)\s]+\s*\*?\*?(.+?)\*?\*?\s*$/i,
    );
    const altStepMatch = trimmed.match(
      /^(?:#{2,4}\s+)?\*?\*?step\s+(\d+)[.:)\s]+\s*(.+?)\*?\*?\s*$/i,
    );

    const match = stepHeaderMatch || altStepMatch;
    if (match) {
      inPreamble = false;
      extraHeading = null;
      steps.push({
        title: (match[2] ?? '').replace(/\*\*/g, '').trim(),
        details: [],
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = (heading[1] ?? '').length;
      const text = (heading[2] ?? '').replace(/\*\*/g, '').trim();
      const lastStep = steps[steps.length - 1];
      // A deeper heading inside a step is part of that step, so it stays with
      // it; a sibling heading opens a section of its own after the checklist.
      if (extraHeading === null && !inPreamble && level >= 3 && lastStep) {
        if (text) lastStep.details.push(text);
        continue;
      }
      extraHeading = text;
      openExtraSection(extraSections, text);
      continue;
    }

    if (extraHeading !== null) {
      appendExtraLine(extraSections, extraHeading, stripListMarker(trimmed));
      continue;
    }

    if (inPreamble) {
      descLines.push(trimmed);
      continue;
    }

    const lastStep = steps[steps.length - 1];
    if (lastStep) {
      const detailText = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (detailText) lastStep.details.push(detailText);
    } else {
      appendExtraLine(extraSections, '', stripListMarker(trimmed));
    }
  }

  description = descLines
    .filter((l) => !l.startsWith('#'))
    .join(' ')
    .replace(/\*\*/g, '')
    .trim();

  return {
    title: title || 'Step-by-Step Guide',
    description,
    steps,
    extraSections,
  };
}

const LATEX_ENVIRONMENT_TAG = /\\(?:begin|end)\{[^}]*\}(?:\{[^}]*\})?/g;

export interface ParsedCalculation {
  title: string;
  description: string;
  formulas: Array<{ label: string; expression: string; isLatex: boolean }>;
  result: string;
  resultIsLatex: boolean;
  resultLabel: string;
  steps: Array<{ label: string; value: string }>;
  unit: string;
  extraSections: ExtraSection[];
}

export function parseCalculation(answer: string): ParsedCalculation {
  const content = withoutCodeFences(answer);
  let title = '';
  let description = '';
  let result = '';
  let resultIsLatex = false;
  let resultLabel = 'Result';
  let unit = '';
  const formulas: ParsedCalculation['formulas'] = [];
  const steps: ParsedCalculation['steps'] = [];
  const descLines: string[] = [];
  const extraSections: ExtraSection[] = [];
  let extraHeading: string | null = null;

  // A keyword regex only ever matches from its keyword onward, so anything
  // before it on the same line ("Grand total: $45", "Grand ") has to be
  // routed here explicitly or it silently disappears instead of landing in
  // the description or an extra section like every other line does.
  function routeLeftover(text: string): void {
    const cleaned = text.trim();
    if (!cleaned) return;
    if (extraHeading !== null) {
      appendExtraLine(extraSections, extraHeading, stripListMarker(cleaned));
      return;
    }
    if (!result && formulas.length === 0 && steps.length === 0) {
      descLines.push(cleaned);
      return;
    }
    appendExtraLine(extraSections, '', stripListMarker(cleaned));
  }

  const latexBlocks = content.match(/\$\$([\s\S]+?)\$\$/g) || [];
  for (const block of latexBlocks) {
    const expr = block.replace(/^\$\$/, '').replace(/\$\$$/, '').trim();
    formulas.push({ label: '', expression: expr, isLatex: true });
  }

  const displayMathBlocks = content.match(/\\\[([\s\S]+?)\\\]/g) || [];
  for (const block of displayMathBlocks) {
    const expr = block.replace(/^\\\[/, '').replace(/\\\]$/, '').trim();
    formulas.push({ label: '', expression: expr, isLatex: true });
  }

  // Math blocks are already captured above; dropping them here keeps their
  // inner lines from being re-read as prose.
  const prose = content.replace(/\$\$[\s\S]+?\$\$/g, '\n').replace(/\\\[[\s\S]+?\\\]/g, '\n');

  for (const line of prose.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!title && /^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    const resultMatch = trimmed.match(
      /\*?\*?(result|answer|total|sum|difference|product|quotient|output|value)\*?\*?\s*[:=]\s*(.+)/i,
    );
    if (resultMatch) {
      routeLeftover(trimmed.slice(0, resultMatch.index ?? 0));
      resultLabel =
        (resultMatch[1] ?? '').charAt(0).toUpperCase() + (resultMatch[1] ?? '').slice(1);
      result = (resultMatch[2] ?? '').replace(/\*\*/g, '').trim();

      const unitMatch = result.match(/^([-\d.,]+)\s*(.+)$/);
      if (unitMatch && unitMatch[2] && !/^\d/.test(unitMatch[2])) {
        unit = unitMatch[2];
      }
      continue;
    }

    const stepMatch = trimmed.match(
      /^(?:(?:#{2,4}\s+)?step\s+\d+[.:]\s*|^\d+\.\s+)\*?\*?(.+?)\*?\*?\s*[:=]\s*(.+)/i,
    );
    if (stepMatch) {
      steps.push({
        label: (stepMatch[1] ?? '').replace(/\*\*/g, '').trim(),
        value: (stepMatch[2] ?? '').replace(/\*\*/g, '').trim(),
      });
      continue;
    }

    const inlineCodeMatch = trimmed.match(/`([^`]+[=+\-*/^][^`]+)`/);
    if (inlineCodeMatch) {
      const start = inlineCodeMatch.index ?? 0;
      const before = trimmed.slice(0, start);
      const after = trimmed.slice(start + inlineCodeMatch[0].length);
      routeLeftover([before.trim(), after.trim()].filter(Boolean).join(' '));
      if (!formulas.some((f) => f.expression === inlineCodeMatch[1])) {
        formulas.push({ label: '', expression: inlineCodeMatch[1] ?? '', isLatex: false });
      }
      continue;
    }

    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      extraHeading = (heading[1] ?? '').replace(/\*\*/g, '').trim();
      openExtraSection(extraSections, extraHeading);
      continue;
    }

    routeLeftover(trimmed);
  }

  description = descLines.join(' ').replace(/\*\*/g, '').trim();

  if (!result && formulas.length > 0) {
    const lastFormula = formulas[formulas.length - 1];
    if (lastFormula) {
      const lastLine =
        lastFormula.expression
          .replace(LATEX_ENVIRONMENT_TAG, '')
          .split('\\\\')
          .map((line) => line.trim())
          .filter(Boolean)
          .pop() ?? '';
      const eqParts = lastLine.split('=');
      if (eqParts.length >= 2) {
        result = (eqParts[eqParts.length - 1] ?? '').replace(/&/g, '').trim();
        resultIsLatex = lastFormula.isLatex;
      }
    }
  }

  return {
    title: title || 'Calculation',
    description,
    formulas,
    result,
    resultIsLatex,
    resultLabel,
    steps,
    unit,
    extraSections,
  };
}
