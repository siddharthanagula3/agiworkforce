/**
 * Every place a surface embeds a document it did not write. The existing
 * regression test asks whether a sandbox attribute is dangerous; this asks
 * whether there is one at all, which is the question an `<iframe src={url} />`
 * with no attributes answers wrongly.
 */

const OPEN = '<iframe';

/** Walks the JSX attribute block, respecting strings, braces and comments. */
function attributeBlock(source, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
    else if (character === '>' && depth <= 0) return source.slice(start, index);
  }
  return null;
}

function lineOf(source, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) if (source[cursor] === '\n') line += 1;
  return line;
}

/** The value of a static `sandbox="..."` attribute, or null when it is dynamic. */
function sandboxTokens(block) {
  const match = block.match(/\bsandbox\s*=\s*(["'])([^"']*)\1/);
  if (!match) return null;
  return match[2].split(/\s+/).filter(Boolean);
}

function referenceName(block) {
  const match = block.match(/\bref\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/);
  return match ? match[1] : null;
}

/**
 * A frame whose sandbox is assigned on its ref counts as declared only when the
 * assignment precedes the src: a src set first loads before the sandbox lands.
 */
function assignsSandboxBeforeSrc(source, reference) {
  const sandboxAt = source.search(
    new RegExp(`setAttribute\\(\\s*['"\`]sandbox['"\`]|\\b${reference}\\w*\\.sandbox\\s*=`),
  );
  if (sandboxAt < 0) return false;
  const srcAt = source.search(/\.src\s*=|setAttribute\(\s*['"`]src['"`]/);
  return srcAt < 0 || sandboxAt < srcAt;
}

export function findEmbeddedFrames(source) {
  const frames = [];
  let cursor = source.indexOf(OPEN);
  while (cursor >= 0) {
    const next = source[cursor + OPEN.length];
    // A regex or string that merely names the tag is a detector, not a frame.
    const quoted = cursor > 0 && /["'`/]/.test(source[cursor - 1]);
    if (!quoted && (next === undefined || /[\s/>]/.test(next))) {
      const block = attributeBlock(source, cursor + OPEN.length);
      if (block !== null) {
        const reference = referenceName(block);
        frames.push({
          line: lineOf(source, cursor),
          tokens: sandboxTokens(block),
          dynamicSandbox: /\bsandbox\s*=\s*\{/.test(block),
          declared:
            /\bsandbox\s*=/.test(block) ||
            (reference !== null && assignsSandboxBeforeSrc(source, reference)),
          crossOrigin: /sandboxOrigin|SANDBOX_ORIGIN|sandboxUrl/.test(block),
        });
      }
    }
    cursor = source.indexOf(OPEN, cursor + OPEN.length);
  }
  return frames;
}

/** Frames built imperatively, which carry no JSX attributes to read. */
export function findCreatedFrames(source) {
  const frames = [];
  for (const match of source.matchAll(/createElement\(\s*['"`]iframe['"`]\s*\)/g)) {
    const window = source.slice(match.index, match.index + 600);
    frames.push({
      line: lineOf(source, match.index),
      declared: /setAttribute\(\s*['"`]sandbox['"`]/.test(window) || /\.sandbox\s*=/.test(window),
    });
  }
  return frames;
}

/**
 * Scripts and same-origin together let the framed document reach out of its
 * frame, so the pair is only ever safe on an origin that holds nothing.
 */
export function escapesItsSandbox(tokens) {
  if (!tokens) return false;
  return tokens.includes('allow-scripts') && tokens.includes('allow-same-origin');
}
