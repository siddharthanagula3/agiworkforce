export const DOLLAR_TAG = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/;

export function skipDelimited(sql, start, quote) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] !== quote) {
      index += 1;
      continue;
    }
    if (sql[index + 1] === quote) {
      index += 2;
      continue;
    }
    return index + 1;
  }
  return -1;
}

export function topLevelStatements(
  sql,
  {
    preserveQuotedIdentifiers = false,
    expandAnonymousBlocks = false,
    preserveLiterals = false,
  } = {},
) {
  const statements = [];
  let current = '';
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    if (character === '-' && sql[index + 1] === '-') {
      const newline = sql.indexOf('\n', index);
      index = newline === -1 ? sql.length : newline + 1;
      current += ' ';
      continue;
    }
    if (character === '/' && sql[index + 1] === '*') {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1;
          index += 2;
        } else if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      current += ' ';
      continue;
    }
    if (character === '$') {
      const tag = DOLLAR_TAG.exec(sql.slice(index))?.[0];
      if (tag) {
        const start = index + tag.length;
        const close = sql.indexOf(tag, start);
        if (
          close !== -1 &&
          expandAnonymousBlocks &&
          /^\s*do(?:\s+language\s+[a-z_][a-z0-9_]*)?\s*$/i.test(current)
        ) {
          current += topLevelStatements(sql.slice(start, close), {
            preserveQuotedIdentifiers,
            expandAnonymousBlocks,
            preserveLiterals,
          }).join('; ');
        } else {
          current +=
            preserveLiterals && close !== -1 ? sql.slice(index, close + tag.length) : ' $body$ ';
        }
        index = close === -1 ? sql.length : close + tag.length;
        continue;
      }
    }
    if (character === "'" || character === '"') {
      const close = skipDelimited(sql, index, character);
      current +=
        ((character === '"' && preserveQuotedIdentifiers) || preserveLiterals) && close !== -1
          ? sql.slice(index, close)
          : ` ${character}${character} `;
      index = close === -1 ? sql.length : close;
      continue;
    }
    if (character === ';') {
      statements.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }
  statements.push(current);
  return statements
    .map((statement) =>
      preserveLiterals ? statement.trim() : statement.replace(/\s+/g, ' ').trim().toLowerCase(),
    )
    .filter((statement) => statement.length > 0);
}
