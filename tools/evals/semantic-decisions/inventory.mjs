import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
  encoding: 'utf8',
}).split('\0');
const pattern =
  /\b(?:generateText|streamText|generateObject|streamObject|stream_completion|stream_chat|invoke_candidate|drainToLlmResponse|send_message_streaming|sendMessageToLLM|sendChatRequest|callLLM|callLlm|generateCompletion|generateChatCompletion)\s*\(|\.(?:chat\.completions\.create|messages\.create|messages\.stream|responses\.create|generateContent|generateContentStream|systemOne|send_message)\s*\(|\b(?:adapter|client|providerAdapter)\.stream\s*\(/g;
const entries = [];
for (const path of [...new Set(files)].sort()) {
  if (
    !/^(apps|packages|crates|services)\//.test(path) ||
    !/\.(ts|tsx|rs)$/.test(path) ||
    /(?:__tests__|\/tests?\/|\.test\.|\.spec\.|test_utils|\/generated\/)/.test(path)
  )
    continue;
  let text = readFileSync(path, 'utf8');
  if (path.endsWith('.rs')) text = text.split('#[cfg(test)]')[0];
  for (const match of text.matchAll(pattern)) {
    const line = text.slice(0, match.index).split('\n').length;
    const lineText = text.split('\n')[line - 1].trim();
    if (/^(\/\/|\*|pub (async )?fn |async fn |fn |export (async )?function )/.test(lineText))
      continue;
    if (
      /messaging|extension_bridge|teams\.rs|subagent_v2\.rs/.test(path) &&
      /send_message/.test(match[0])
    )
      continue;
    entries.push({ path, line, invocation: match[0].trim() });
  }
}
writeFileSync(
  'docs/specs/semantic-decisions/call-sites.json',
  JSON.stringify(
    {
      description:
        'Reproducible lexical discovery index, not proof of reachability or an exhaustive dynamic call graph. Semantic classifications and omissions are in audit.md. Rust inline test modules excluded; IPC send_message false positives excluded.',
      entries,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  `${entries.length} call expressions in ${new Set(entries.map((e) => e.path)).size} files\n`,
);
process.stdout.write(`${[...new Set(entries.map((e) => e.path))].join('\n')}\n`);
