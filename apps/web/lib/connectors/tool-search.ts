const MIN_TERM_CHARS = 2;
const NAME_WEIGHT = 3;
const DESCRIPTION_WEIGHT = 1;
export const TOOL_SEARCH_MAX_RESULTS = 8;

interface SearchableTool {
  qualifiedName: string;
  toolName: string;
  description?: string;
}

function searchTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= MIN_TERM_CHARS),
    ),
  ];
}

function scoreTool(tool: SearchableTool, terms: readonly string[]): number {
  const name = `${tool.qualifiedName} ${tool.toolName}`.toLowerCase();
  const description = (tool.description ?? '').toLowerCase();
  return terms.reduce(
    (score, term) =>
      score +
      (name.includes(term) ? NAME_WEIGHT : 0) +
      (description.includes(term) ? DESCRIPTION_WEIGHT : 0),
    0,
  );
}

export function searchToolsByKeyword<T extends SearchableTool>(
  tools: readonly T[],
  query: string,
  limit = TOOL_SEARCH_MAX_RESULTS,
): T[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return tools
    .map((tool, index) => ({ tool, index, score: scoreTool(tool, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.tool);
}
