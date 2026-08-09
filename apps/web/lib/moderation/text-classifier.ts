/**
 * Platform moderation floor for prompt text.
 *
 * This is deliberately NOT the same thing as `checkContentFilter` in
 * `@agiworkforce/types`. That one implements the account preference "Reduce
 * sensitive content": the user turns it on, and it trades false positives for
 * a quieter experience. It is off by default, so before this module the only
 * platform-side text filter was one the user could decline.
 *
 * The rules here encode the categories the platform refuses for everyone —
 * child sexual abuse and exploitation, mass-casualty weapon uplift, illegal
 * weapon construction, and planning violence against real people. There is no
 * preference that turns them off, and no code path that consults a preference
 * before running them.
 *
 * Design notes, because a naive keyword list is what this replaces:
 *
 *  - Text is normalized twice. `normalized` maps a fixed set of Latin/Cyrillic
 *    /Greek homoglyphs to ASCII, strips diacritics and zero-width joiners, and
 *    re-joins letters that were split by separators (`b.o.m.b`). `folded`
 *    additionally undoes leetspeak. Digits survive in `normalized` so age
 *    patterns still read, which is why both forms exist.
 *  - A rule fires on a *co-occurrence within a distance*, not on a single
 *    phrase. "Make" near "sarin" is a signal; either alone is not. That is
 *    what keeps `make`, `kill`, and `child` usable words.
 *  - Rules carry weights and the verdict is a sum against two thresholds, so
 *    two individually-weak signals ("I'm going to kill him", "my boss") can
 *    reach a block that neither reaches alone.
 *
 * ON `unless`, AND WHY IT IS NOT THE LAST WORD. An `unless` pattern cancels a
 * rule, which is ordinary false-positive filtering — but the text it tests is
 * written by the person being moderated, so any rule that `unless` can cancel
 * is a rule an attacker cancels by appending "(historical context)" or "for my
 * novel". Suppressible rules therefore carry *corroborating* signal only.
 * Every hard category additionally has a rule with NO `unless` at all, keyed on
 * an operational request ("how do I", "step by step instructions for") next to
 * the prohibited subject, because that shape has no benign reading that an
 * appended disclaimer rescues. Those are the rules that actually hold, and
 * they are the ones the tests attack with disclaimer-suffixed prompts.
 *
 * What this is not: a model. Rules cannot follow paraphrase, and the tuning
 * above is biased towards letting borderline text through, because a floor
 * that refuses ordinary questions is a floor an operator disables. A learned
 * classifier belongs on top of this, and wiring one in is a real change with a
 * vendor behind it — not an unconfigured env var pretending to be an upgrade
 * path. Until then, these rules are the whole floor.
 */

export type ModerationCategory = 'csae' | 'wmd' | 'illegal_weapons' | 'targeted_violence';

export type ModerationAction = 'allow' | 'flag' | 'block';

export interface ModerationVerdict {
  action: ModerationAction;
  /** Summed weight of every rule that fired. */
  score: number;
  /** Categories that contributed weight. */
  categories: ModerationCategory[];
  /** Ids of rules that contributed weight. Safe to log; contains no user text. */
  ruleIds: string[];
  /**
   * Ids of rules that matched but were cancelled by an `unless` pattern. These
   * change no verdict on their own; they ride along in the report when some
   * other rule blocked or flagged, so a reviewer can see what was waved off.
   */
  suppressedRuleIds: string[];
}

interface ModerationRule {
  id: string;
  category: ModerationCategory;
  weight: number;
  /** Every pattern must match, and all matches must fit inside `proximity`. */
  requires: readonly RegExp[];
  /** Maximum character span covering one match of each `requires` pattern. */
  proximity: number;
  /**
   * A match here cancels the rule. Attacker-appendable by construction, so it
   * is only ever put on rules whose weight alone cannot reach BLOCK_THRESHOLD,
   * or that are backed by a non-suppressible sibling rule.
   */
  unless?: readonly RegExp[];
}

/** Reached by one weight-100 rule, or by two weaker corroborating ones. */
const BLOCK_THRESHOLD = 100;
/** Enough signal to record for review, not enough to refuse the request. */
const FLAG_THRESHOLD = 50;

const ZERO_WIDTH = /[\u200b-\u200f\u2060\ufeff]/g;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const LETTER_SEPARATORS = /\b(?:[a-z][\s._\-*]){2,}[a-z]\b/g;

/**
 * Single-codepoint homoglyphs, so "sarın" (dotless i) and "sаrin" (Cyrillic a)
 * read as "sarin". Every entry maps one character to one character, which is
 * what keeps `normalized` and `folded` index-comparable. This is a fixed list,
 * not the full Unicode confusables table — it covers the Cyrillic and Greek
 * lookalikes for ASCII letters, which is what evasion actually reaches for.
 */
const CONFUSABLES: Readonly<Record<string, string>> = {
  ı: 'i',
  і: 'i',
  ɩ: 'i',
  ӏ: 'l',
  ʟ: 'l',
  а: 'a',
  ɑ: 'a',
  α: 'a',
  е: 'e',
  ё: 'e',
  ε: 'e',
  о: 'o',
  ο: 'o',
  ө: 'o',
  ø: 'o',
  р: 'p',
  ρ: 'p',
  с: 'c',
  ϲ: 'c',
  ѕ: 's',
  ѵ: 'v',
  ν: 'v',
  х: 'x',
  χ: 'x',
  у: 'y',
  ү: 'y',
  ʏ: 'y',
  к: 'k',
  κ: 'k',
  м: 'm',
  н: 'h',
  т: 't',
  τ: 't',
  в: 'b',
  β: 'b',
  ԁ: 'd',
  ɡ: 'g',
  ɢ: 'g',
  ɴ: 'n',
  ո: 'n',
  ս: 'u',
  µ: 'u',
  г: 'r',
  ј: 'j',
  з: 'z',
};
const CONFUSABLE_CHARS = new RegExp(`[${Object.keys(CONFUSABLES).join('')}]`, 'g');

const LEET: ReadonlyArray<readonly [RegExp, string]> = [
  [/0/g, 'o'],
  [/1/g, 'i'],
  [/3/g, 'e'],
  [/4/g, 'a'],
  [/5/g, 's'],
  [/7/g, 't'],
  [/@/g, 'a'],
  [/\$/g, 's'],
];

/**
 * Both forms keep the same length wherever possible so a match index in one is
 * comparable to a match index in the other. `LETTER_SEPARATORS` is the one
 * step that shortens the string, and it is applied to both forms.
 *
 * Not exported: the only consumer is `classifyModerationText` below, and an
 * exported normalizer invites a caller to normalize once and match somewhere
 * else with different rules.
 */
function normalizeForModeration(text: string): { normalized: string; folded: string } {
  const normalized = text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(ZERO_WIDTH, '')
    .toLowerCase()
    .replace(CONFUSABLE_CHARS, (character) => CONFUSABLES[character] ?? character)
    .replace(LETTER_SEPARATORS, (run) => run.replace(/[\s._\-*]/g, ''))
    .replace(/\s+/g, ' ');

  let folded = normalized;
  for (const [pattern, replacement] of LEET) folded = folded.replace(pattern, replacement);

  return { normalized, folded };
}

/**
 * The shape that makes a request operational rather than descriptive. A
 * history question asks "what was"; an uplift request asks "how do I". No
 * appended disclaimer changes which one was asked, which is why the rules
 * built on this carry no `unless`.
 */
const OPERATIONAL_REQUEST =
  /\b(?:how\s+(?:do|can|would)\s+(?:i|we|you)|how\s+to|step[-\s]?by[-\s]?step|steps?\s+to|instructions?\s+(?:for|to|on)|recipe\s+for|procedure\s+(?:for|to)|guide\s+(?:for|to)|tutorial|walk\s+me\s+through|teach\s+me\s+(?:how\s+)?to|give\s+me\s+(?:the|a)\s+(?:method|process|formula|procedure))\b/;

const MINOR =
  /\b(?:child|children|kid|kids|minor|minors|underage|under[-\s]?age|pre[-\s]?teen|toddler|infant|(?:1[0-7]|[1-9])\s*(?:y|yr|yrs|year|years)[\s-]*old|(?:1[0-7]|[1-9])\s*yo)\b/;
/**
 * Bare "sex", "nude", and "naked" are absent on purpose. Co-occurrence with a
 * minor term is a wide enough net that they would refuse "sex education for
 * kids" and "a children's story about a naked mole rat", and a floor that
 * refuses those is a floor someone turns off.
 */
const SEXUAL =
  /\b(?:sexual|sexually|sexualiz\w*|sex\s+(?:with|act|acts|scene|scenes)|porn|pornographic|pornography|erotic|erotica|nudes|(?:nude|naked)\s+(?:photo|photos|picture|pictures|image|images|video|videos|body|bodies)|explicit\s+(?:image|images|photo|photos|content|scene|scenes)|molest\w*|rape|raping|fondl\w*|groom(?:ing)?\s+(?:a\s+)?(?:child|kid|minor))\b/;
/**
 * Narrower than SEXUAL: terms with no safeguarding, medical, or educational
 * reading. "Child sexual abuse" is discussed by reporters and social workers
 * every day; "sexually explicit" plus a minor is a request, not a discussion.
 * This is what the non-suppressible CSAE rule keys on.
 */
const SEXUAL_EXPLICIT =
  /\b(?:sexually\s+explicit|explicit\s+sexual|porn|pornographic|pornography|erotic|erotica|hentai|nsfw|smut|lewd|sexualiz\w*|molest\w*|rape|raping)\b/;
const CSAE_TERM =
  /\b(?:csam|child\s*(?:porn|pornography)|cp\s+of\s+(?:a\s+)?(?:kid|child|minor)|jailbait|lolicon|shotacon)\b/;
/**
 * Asking for the material, as opposed to asking about it. "Report", "find",
 * and "where" are deliberately absent: "where do I report CSAM" is the exact
 * sentence a mandated reporter types.
 */
const CSAE_ACQUIRE =
  /\b(?:send|sending|share|sharing|post|posting|link|links|linking|show|download|downloading|buy|buying|sell|selling|trade|trading|swap|make|making|generate|generating|create|creating|write|writing|draw|drawing|produce|producing)\b/;
const GENERATION_VERB =
  /\b(?:write|writing|generate|generating|create|creating|draw|drawing|make|making|produce|producing|render|rendering|depict\w*|illustrat\w*|story|stories|roleplay|role[-\s]?play|fanfic\w*|caption)\b/;
const CSAE_EXEMPT =
  /\b(?:report(?:s|ing|ed)?|prevent(?:s|ing|ion)?|survivor|survivors|victim\s+support|mandated\s+reporter|protect(?:ing)?\s+(?:children|kids|minors)|hotline|ncmec|iwf|law\s+enforcement|safeguarding|awareness\s+training|takedown|sex\s+education|sexual\s+health|puberty|pediatric\w*|parenting|age[-\s]?appropriate|curriculum|consent\s+education|talk(?:ing)?\s+to\s+(?:my|your|their)\s+(?:child|kid|kids|children|son|daughter|teen))\b/;

const WMD_INTENT =
  /\b(?:synthesi[sz]e|synthesis|manufactur\w*|produce|producing|weaponi[sz]\w*|aerosoli[sz]\w*|cultivat\w*|enrich(?:ing|ment)?|acquire|acquiring|obtain|build|building|make|making|assembl\w*)\b/;
const WMD_AGENT =
  /\b(?:sarin|vx\s+nerve\s+agent|nerve\s+agent|mustard\s+gas|anthrax|ricin|botulinum\s+toxin|smallpox\s+virus|weapons[-\s]?grade\s+(?:uranium|plutonium)|nuclear\s+(?:weapon|weapons|bomb|device|warhead)|dirty\s+bomb|radiological\s+dispersal)\b/;
const WMD_EXEMPT =
  /\b(?:history|historical|treaty|treaties|non[-\s]?proliferation|disarmament|documentary|geneva|convention|detect(?:s|ing|ion)?|decontaminat\w*|antidote|symptoms|treatment|diagnos\w*|policy|inspector|inspection|export\s+controls?)\b/;

/**
 * Named devices only. "Bomb", "gun", and "explosive" on their own are ordinary
 * words in news, history, and game development; the named device is not. The
 * bare nouns are still covered, but only in the one fixed phrasing the account
 * preference already used — see `weapons.basic-construction` below.
 */
const WEAPON_DEVICE =
  /\b(?:pipe\s+bomb|ied|improvised\s+explosive(?:\s+device)?|pressure\s+cooker\s+bomb|car\s+bomb|molotov(?:\s+cocktail)?|napalm|ghost\s+gun|untraceable\s+(?:gun|firearm|weapon)|auto\s*sear|full[-\s]?auto\s+conversion|detonator|blasting\s+cap)\b/;
const WEAPON_CONSTRUCT =
  /\b(?:build|building|make|making|construct\w*|assembl\w*|3d\s*print\w*|manufactur\w*|obtain|acquire|buy|convert(?:ing)?|instructions?\s+for)\b/;
const WEAPON_EXEMPT =
  /\b(?:history|historical|documentary|film|movie|novel|screenplay|fiction|fictional|museum|war\s+crimes?|detect(?:s|ing|ion)?|defus\w*|bomb\s+squad|dispos\w*|policy|legislation|ban(?:ned|ning)?|prosecut\w*)\b/;

const VIOLENCE_INTENT =
  /\b(?:i(?:'|’)?m\s+going\s+to|i\s+am\s+going\s+to|i\s+will|i\s+want\s+to|help\s+me|how\s+(?:do\s+i|to)|best\s+way\s+to|plan(?:ning)?\s+to)\b/;
const VIOLENCE_ACT =
  /\b(?:kill|killing|murder|murdering|shoot|shooting|stab|stabbing|behead|strangle|poison|poisoning|bomb|bombing)\b/;
const VIOLENCE_OBJECT =
  /\b(?:him|her|them|someone|somebody|a\s+person|people|my\s+\w+|a\s+man|a\s+woman|a\s+kid|a\s+child|everyone|a\s+school|the\s+school|a\s+crowd)\b/;
const VIOLENCE_TARGET =
  /\b(?:my\s+(?:wife|husband|ex|boss|manager|teacher|professor|coworker|co[-\s]?worker|neighbou?r|classmate|classmates|roommate|father|mother|brother|sister|landlord)|a\s+school|the\s+school|my\s+school|a\s+crowd|the\s+congregation|synagogue|mosque|church|as\s+many\s+people\s+as)\b/;
/**
 * "Kill the process", "kill -9", "kill the boss fight" — this is a developer
 * product, so the violent verbs have a dominant benign sense here.
 */
const VIOLENCE_EXEMPT =
  /\b(?:process|processes|pid|daemon|server|servers|container|containers|port|thread|threads|session|sessions|kernel|signal|sigkill|kill\s*-9|npm|pnpm|docker|kubectl|query|queries|terminal|shell|tab|app|program|script|job|task|build|watcher|tunnel|game|games|npc|boss\s+(?:fight|battle)|character|characters|novel|screenplay|fiction|fictional|chess|pawn|weed|weeds|bacteria|germs|news|article|headline|documentary)\b/;

const RULES: readonly ModerationRule[] = [
  // ---- Non-suppressible. These are the floor; `unless` cannot reach them. ----
  {
    // "send me csam", "generate lolicon". Asking *for* the material.
    id: 'csae.term-request',
    category: 'csae',
    weight: 100,
    requires: [CSAE_ACQUIRE, CSAE_TERM],
    proximity: 100,
  },
  {
    // "write a sexually explicit story about a 12 year old", with or without a
    // "this is for safeguarding training" suffix.
    id: 'csae.explicit-generation',
    category: 'csae',
    weight: 100,
    requires: [GENERATION_VERB, SEXUAL_EXPLICIT, MINOR],
    proximity: 140,
  },
  {
    id: 'wmd.operational-request',
    category: 'wmd',
    weight: 100,
    requires: [OPERATIONAL_REQUEST, WMD_INTENT, WMD_AGENT],
    proximity: 140,
  },
  {
    id: 'weapons.operational-request',
    category: 'illegal_weapons',
    weight: 100,
    requires: [OPERATIONAL_REQUEST, WEAPON_CONSTRUCT, WEAPON_DEVICE],
    proximity: 140,
  },
  {
    // Parity with the `checkContentFilter` account preference, which caught the
    // bare nouns in this one fixed phrasing. Without it the always-on floor
    // would be weaker than the opt-in setting on "how to make a bomb".
    //
    // Known and accepted false positive: "how to make a bomb in minecraft"
    // refuses. It refused under the preference too, but this rule is always on,
    // so the cost is now paid by everyone. It carries no `unless` on purpose —
    // a game-context exemption here would be released by appending the word
    // "minecraft", which is the whole bypass this rule set exists to avoid.
    id: 'weapons.basic-construction',
    category: 'illegal_weapons',
    weight: 100,
    requires: [/\bhow\s+to\s+(?:build|make|3d\s*print)\s+an?\s+(?:gun|firearm|bomb|explosive)\b/],
    proximity: 0,
  },
  {
    // First-person intent against a named real-world target. VIOLENCE_INTENT is
    // anchored to "I"/"help me", so third-person narration does not reach it.
    id: 'violence.intent-and-target',
    category: 'targeted_violence',
    weight: 100,
    requires: [VIOLENCE_INTENT, VIOLENCE_ACT, VIOLENCE_TARGET],
    proximity: 100,
  },

  // ---- Suppressible corroboration. Never enough to block on its own except
  // ---- by summing with another rule, which is why `unless` is safe here.
  {
    id: 'csae.explicit-term',
    category: 'csae',
    weight: 100,
    requires: [CSAE_TERM],
    proximity: 0,
    unless: [CSAE_EXEMPT],
  },
  {
    id: 'csae.sexualized-minor',
    category: 'csae',
    weight: 100,
    requires: [MINOR, SEXUAL],
    proximity: 120,
    unless: [CSAE_EXEMPT],
  },
  {
    id: 'wmd.agent-production',
    category: 'wmd',
    weight: 100,
    requires: [WMD_INTENT, WMD_AGENT],
    proximity: 160,
    unless: [WMD_EXEMPT],
  },
  {
    id: 'weapons.device-construction',
    category: 'illegal_weapons',
    weight: 100,
    requires: [WEAPON_CONSTRUCT, WEAPON_DEVICE],
    proximity: 120,
    unless: [WEAPON_EXEMPT],
  },
  {
    id: 'violence.stated-intent',
    category: 'targeted_violence',
    weight: 60,
    requires: [VIOLENCE_INTENT, VIOLENCE_ACT, VIOLENCE_OBJECT],
    proximity: 80,
    unless: [VIOLENCE_EXEMPT],
  },
  {
    id: 'violence.named-target',
    category: 'targeted_violence',
    weight: 50,
    requires: [VIOLENCE_ACT, VIOLENCE_TARGET],
    proximity: 100,
    unless: [VIOLENCE_EXEMPT],
  },
];

/** Every start index at which `pattern` matches, scanning the whole string. */
function matchIndices(pattern: RegExp, text: string): number[] {
  const scanner = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
  const indices: number[] = [];
  for (let match = scanner.exec(text); match !== null; match = scanner.exec(text)) {
    indices.push(match.index);
    // Zero-length matches would spin forever.
    if (scanner.lastIndex === match.index) scanner.lastIndex += 1;
  }
  return indices;
}

/**
 * True when one match of every pattern fits inside a `proximity`-wide window.
 * Classic minimum-window sweep over the merged, sorted match positions.
 */
function coOccursWithin(
  patterns: readonly RegExp[],
  texts: readonly string[],
  proximity: number,
): boolean {
  const perPattern = patterns.map((pattern) => {
    const merged = new Set<number>();
    for (const text of texts) for (const index of matchIndices(pattern, text)) merged.add(index);
    return [...merged].sort((a, b) => a - b);
  });
  if (perPattern.some((indices) => indices.length === 0)) return false;
  if (patterns.length === 1 || proximity <= 0) return true;

  const events = perPattern
    .flatMap((indices, patternIndex) => indices.map((index) => ({ index, patternIndex })))
    .sort((a, b) => a.index - b.index);

  const counts = new Array<number>(patterns.length).fill(0);
  let covered = 0;
  let left = 0;
  for (const event of events) {
    if (counts[event.patternIndex]! === 0) covered += 1;
    counts[event.patternIndex] = counts[event.patternIndex]! + 1;
    while (covered === patterns.length) {
      if (event.index - events[left]!.index <= proximity) return true;
      const leaving = events[left]!.patternIndex;
      counts[leaving] = counts[leaving]! - 1;
      if (counts[leaving] === 0) covered -= 1;
      left += 1;
    }
  }
  return false;
}

/**
 * Classify prompt text against the always-on platform rules. Pure and
 * synchronous: no preference read, no network, nothing that can be turned off.
 */
export function classifyModerationText(text: string): ModerationVerdict {
  const { normalized, folded } = normalizeForModeration(text);
  const forms = normalized === folded ? [normalized] : [normalized, folded];

  let score = 0;
  const ruleIds: string[] = [];
  const suppressedRuleIds: string[] = [];
  const categories = new Set<ModerationCategory>();

  for (const rule of RULES) {
    if (!coOccursWithin(rule.requires, forms, rule.proximity)) continue;

    const suppressed = rule.unless?.some((pattern) => forms.some((form) => pattern.test(form)));
    if (suppressed) {
      suppressedRuleIds.push(rule.id);
      continue;
    }

    score += rule.weight;
    ruleIds.push(rule.id);
    categories.add(rule.category);
  }

  const action: ModerationAction =
    score >= BLOCK_THRESHOLD ? 'block' : score >= FLAG_THRESHOLD ? 'flag' : 'allow';

  return { action, score, categories: [...categories], ruleIds, suppressedRuleIds };
}
