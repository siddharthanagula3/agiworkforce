const BLOCK_COMMENT_RE = /\/\*[\s\S]*?\*\//g;

const PLACEHOLDER_COPY_RE =
  /\b(?:under construction|lorem ipsum|placeholder text|content goes here|your content here|sample text|dummy (?:text|data)|todo:\s*(?:copy|wire|implement|fill))\b/i;

const DEAD_HANDLER_RE =
  /\bon(?:Click|Submit|Change|Select|Press|Toggle)\s*=\s*\{\s*(?:\(\s*\)|\(\s*_\w*\s*\))\s*=>\s*(?:\{\s*\}|undefined|null|void 0)\s*\}/;

const NOOP_HANDLER_RE = /\bon(?:Click|Submit|Change|Select|Press|Toggle)\s*=\s*\{\s*noop\s*\}/;

const SUCCESS_SINK_RE =
  /\b(?:toast\.success\s*\(|setSuccess\s*\(\s*true|setStatus\s*\(\s*['"]success['"]|setSaved\s*\(\s*true|setSubmitted\s*\(\s*true)/;

const SETTLED_RE = /\bawait\b|\.then\s*\(|\bresponse\.ok\b|\bres\.ok\b|\bonSuccess\b|\bisSuccess\b/;

const WRITE_CALL_RE =
  /\bfetch\s*\(|\bmutateAsync\s*\(|\bmutate\s*\(|\bapiClient\b|\bfetchWithTimeout\s*\(/;

const RAW_IDENTIFIER_RE =
  />\s*\{\s*(?:[\w.?[\]]*\b(?:[iI]d|uuid|UUID|Uuid|token|sessionId|traceId)\b)\s*\}\s*</;

const ID_IS_FORMATTED_RE =
  /\b(?:slice|substring|substr|shortId|formatId|truncate|toUpperCase|toLowerCase|label|name|title|displayId)\b/;

const RULES = [
  {
    id: 'placeholder-copy',
    advice:
      'ship the feature or do not ship the surface; a shell that promises "coming soon" is a dead end the user cannot act on',
  },
  {
    id: 'dead-control',
    advice:
      'a control wired to an empty handler looks live and does nothing; remove it, disable it with a reason, or implement it',
  },
  {
    id: 'fake-success',
    advice:
      'the success message is shown before anything was awaited, so a failed write still reads as saved; await the call and report its outcome',
  },
  {
    id: 'raw-identifier',
    advice:
      'a bare id or token rendered as body text is machine state, not information; show the name and keep the id for the copy affordance',
  },
];

export function stripComments(source) {
  return source
    .replace(BLOCK_COMMENT_RE, (block) => block.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((line) => (/^\s*(?:\/\/|\*)/.test(line) ? '' : line.replace(/(^|[^:"'`])\/\/.*$/, '$1')))
    .join('\n');
}

function functionBodies(code) {
  const bodies = [];
  const starts = [...code.matchAll(/(?:=>|function\b[^(]*\([^)]*\))\s*\{/g)];
  for (const start of starts) {
    const open = start.index + start[0].length - 1;
    let depth = 0;
    for (let i = open; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          bodies.push({ text: code.slice(open, i + 1), offset: open });
          break;
        }
      }
    }
  }
  return bodies;
}

function lineOf(code, index) {
  return code.slice(0, index).split('\n').length;
}

export function findFakeAffordances(source, file) {
  const code = stripComments(source);
  const findings = [];

  code.split('\n').forEach((line, index) => {
    if (PLACEHOLDER_COPY_RE.test(line)) {
      findings.push({ file, line: index + 1, rule: 'placeholder-copy' });
    }
    if (DEAD_HANDLER_RE.test(line) || NOOP_HANDLER_RE.test(line)) {
      findings.push({ file, line: index + 1, rule: 'dead-control' });
    }
    if (RAW_IDENTIFIER_RE.test(line) && !ID_IS_FORMATTED_RE.test(line)) {
      findings.push({ file, line: index + 1, rule: 'raw-identifier' });
    }
  });

  for (const body of functionBodies(code)) {
    const sink = SUCCESS_SINK_RE.exec(body.text);
    if (!sink) continue;
    if (!WRITE_CALL_RE.test(body.text)) continue;
    if (SETTLED_RE.test(body.text.slice(0, sink.index))) continue;
    findings.push({
      file,
      line: lineOf(code, body.offset + sink.index),
      rule: 'fake-success',
    });
  }

  return findings;
}

export function countByRule(findings) {
  const counts = {};
  for (const rule of RULES) counts[rule.id] = 0;
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return counts;
}

export function checkAgainstRatchet(counts, ratchet) {
  const errors = [];
  for (const rule of RULES) {
    const allowed = ratchet.maxFindings?.[rule.id];
    if (typeof allowed !== 'number') {
      errors.push(`ratchet has no maxFindings entry for ${rule.id}`);
      continue;
    }
    if (counts[rule.id] > allowed) {
      errors.push(
        `${rule.id}: ${counts[rule.id]} findings, above the ratchet of ${allowed}: ${rule.advice}`,
      );
    }
  }
  return errors;
}

export { RULES };
