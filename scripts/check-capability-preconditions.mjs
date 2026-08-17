#!/usr/bin/env node
/* global console */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LEDGER = 'docs/current/parity-implementation-matrix.md';
const MARKER = /hard\s+precondition/gi;
const CITED_PATH = /`([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)`/g;

function openingParen(text, from, floor) {
  let depth = 0;
  for (let i = from; i >= floor; i -= 1) {
    if (text[i] === ')') depth += 1;
    else if (text[i] === '(') {
      if (depth === 0) return i;
      depth -= 1;
    }
  }
  return -1;
}

function closingParen(text, from, ceiling) {
  let depth = 0;
  for (let i = from + 1; i < ceiling; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      if (depth === 0) return i + 1;
      depth -= 1;
    }
  }
  return ceiling;
}

export function preconditionClauses(text) {
  const clauses = [];
  for (const match of text.matchAll(MARKER)) {
    const at = match.index;
    const blockStart = text.lastIndexOf('\n- ', at) + 1;
    const nextBullet = text.indexOf('\n- ', at);
    const blockEnd = nextBullet === -1 ? text.length : nextBullet;
    const open = openingParen(text, at, blockStart);
    const start = open === -1 ? blockStart : open;
    const end = open === -1 ? blockEnd : closingParen(text, open, blockEnd);
    clauses.push({
      line: text.slice(0, at).split('\n').length,
      text: text.slice(start, end),
    });
  }
  return clauses;
}

export function citedPaths(clause) {
  return [...clause.matchAll(CITED_PATH)].map((match) => match[1]);
}

export function auditLedger(root) {
  const ledgerPath = path.join(root, LEDGER);
  if (!fs.existsSync(ledgerPath)) return [`${LEDGER} is missing`];

  const errors = [];
  for (const clause of preconditionClauses(fs.readFileSync(ledgerPath, 'utf8'))) {
    const cited = citedPaths(clause.text);
    const resolvable = cited.filter((candidate) => fs.existsSync(path.join(root, candidate)));
    if (resolvable.length > 0) continue;
    errors.push(
      cited.length === 0
        ? `${LEDGER}:${clause.line} gates a capability on a hard precondition without citing a file a reader can open`
        : `${LEDGER}:${clause.line} gates a capability on a hard precondition citing ${cited.join(', ')}, none of which exist`,
    );
  }
  return errors;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const errors = auditLedger(process.cwd());
  if (errors.length > 0) {
    console.error('Capability precondition check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('Capability precondition check passed.');
}
