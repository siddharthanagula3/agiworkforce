const MAX_SUMMARY_CHARS = 160;

const ROUTING_OPENINGS: ReadonlyArray<[RegExp, string]> = [
  [/^when the user wants help with\s+/i, 'Helps you with '],
  [/^when the user wants help\s+/i, 'Helps with '],
  [/^when the user (?:wants|asks|needs) to\s+/i, 'Helps you '],
  [/^when the user (?:wants|needs|asks for)\s+/i, 'For when you want '],
];
const ROUTING_TAIL =
  /\s*(?:Also use (?:this )?when|Use (?:this(?: skill)?|it) (?:whenever|when|for)|Use when|Load (?:this skill|always)|Triggers? on)\b[\s\S]*$/i;

function firstSentence(text: string): string {
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(text);
  return (match ? match[0] : text).trim();
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A skill's description is written for the model that decides when to load it
 * ("When the user wants to…, also use when they mention…"). A buyer needs one
 * line saying what it helps with, so the trigger phrasing is dropped.
 */
export function publicSkillSummary(description: string): string {
  const withoutTriggers = description.replace(ROUTING_TAIL, '').trim();
  const sentence = firstSentence(withoutTriggers || description);
  const opening = ROUTING_OPENINGS.find(([pattern]) => pattern.test(sentence));
  const routed = opening ? sentence.replace(opening[0], opening[1]) : sentence;
  const summary = capitalize(routed.replace(/\s+/g, ' ').trim());
  if (summary.length <= MAX_SUMMARY_CHARS) return summary;
  const cut = summary.slice(0, MAX_SUMMARY_CHARS);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '')}…`;
}
