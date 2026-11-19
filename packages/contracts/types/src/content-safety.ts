const STRICT_UNSAFE_PATTERNS: readonly RegExp[] = [
  /\b(porn|pornography|hentai|nsfw|xxx|erotic|explicit\s+sexual|nude\s+photo|naked\s+photo)\b/,
  /\b(how\s+to\s+kill|how\s+to\s+murder|instructions?\s+to\s+(harm|injure|kill))\b/,
  /\b(how\s+to\s+(make|synthesize|cook|manufacture)\s+(meth|heroin|fentanyl|cocaine|lsd))\b/,
  /\b(how\s+to\s+(build|make|3d\s+print)\s+a\s+(gun|firearm|bomb|explosive))\b/,
  /\b(how\s+to\s+(buy|get|obtain)\s+alcohol\s+underage|fake\s+id)\b/,
  /\b(how\s+to\s+(gamble|bet)\s+(online|without|underage))\b/,
];

// Every gap below is bounded, so each expression runs in time linear in the prompt.
const REFLEXIVE = String.raw`(?:myself|my\s?self|yourself|your\s?self|himself|herself|themselves|themself|oneself|ourselves)(?!\s+(?:in\s+the\s+foot|some\s+slack|a\s+break|off|short|free|loose|out|up\s+for))`;
const HARM_STEM = String.raw`(?:kill|hurt|harm|cut|injur|burn|poison|hang|starv|strangl|suffocat|drown|shoot|stab|overdos)`;
const POSSESSIVE = String.raw`(?:my|your|his|her|their|one'?s|one’s|our)`;
const MEANS = String.raw`(?:pills?|tablets?|capsules?|meds|medications?|medicines?|drugs?|painkillers?|insulin|tylenol|paracetamol|acetaminophen|ibuprofen|aspirin|xanax|benadryl|melatonin|alcohol|vodka|poisons?|antidepressants?|opioids?|oxy\w{0,8}|morphine|heroin|fentanyl|bleach|antifreeze)`;
const LIFE_ENDS = String.raw`(?=\s*(?:[?.!,;:]|$|(?:quickly|painlessly|peacefully|easily|safely|without|with\s+(?:\w{1,20}\s+)?(?:${MEANS}|guns?|knife|knives|ropes?|blades?|razors?)|by|using|tonight|today|now|for\s+good|in\s+${POSSESSIVE}\s+sleep)\b))`;
const OWN_LIFE = String.raw`(?:end|take|ending|taking)\s+${POSSESSIVE}\s+(?:own\s+)?li(?:fe|ves)\b${LIFE_ENDS}`;
const SELF_HARM_WORD = String.raw`self[\s-]?harm(?:ing)?(?!\w|\s+(?:recovery|prevention|awareness|support|services?|resources?|scars?|urges?|wounds?|injur\w{0,4}|care|research|statistics|rates?))`;
const NEVER_WAKE = String.raw`(?:not|never)\s+wake(?:\s+back)?\s+up(?=\s*(?:[?.!,;]|$|again|ever|any\s?more|at\s+all|for\s+good))`;
const SUICIDE_NOUN = String.raw`suicide(?!\s+(?:squads?|doors?|squeeze|runs?|sprints?|drills?|prevention|awareness|risk|rates?|statistics|research|support|hotlines?|helplines?|lines?|crisis|survivors?|loss))`;
const TARGET = String.raw`(?:\b(?:off(?:ing)?|unaliv(?:e|ing))\s+${REFLEXIVE}\b|\bslit\w{0,4}\s+${POSSESSIVE}\s+(?:own\s+)?(?:wrists?|throat)\b|\b${HARM_STEM}\w{0,4}\s+${REFLEXIVE}\b|\b${OWN_LIFE}\b|\bend(?:ing)?\s+it\s+all\b|\bcommit(?:ting)?\s+${SUICIDE_NOUN}|\b${SELF_HARM_WORD}|\boverdos(?:e|ing)\b(?!\s+on\s+(?!(?:\w{1,20}\s+)?${MEANS}\b))|\bod\b|\b${NEVER_WAKE})`;
const ASKER = String.raw`(?:i|you|u|one|someone|somebody|people|a\s+person|he|she|they|we)`;
const DOSE_KILL = String.raw`kill\s+(?:me|myself|you|yourself|someone|somebody|him|her|them|an?\s+(?:\w{1,15}\s+)?(?:person|human|man|woman|adult|child|kid))\b`;
const DIE = String.raw`die\b(?!\s+(?:if|when|unless|after|from|of|because))`;
const FATAL_DOSE = String.raw`be\s+(?:fatal|lethal|deadly)(?=\s*(?:[?.!,;:]|$|for\s+(?:me|someone|somebody|a\s+person|an?\s+(?:adult|human|man|woman))\b))`;
const GENTLE = String.raw`(?:(?:most|least)\s+)?(?:painless|painful|quickest|quick|fastest|fast|easiest|easy|surest|simplest|quietest|cleanest|peaceful|gentlest)`;
const QUALIFIER = String.raw`(?:${GENTLE}|best)`;

const SELF_HARM_METHOD_PATTERNS: readonly RegExp[] = [
  new RegExp(
    String.raw`\bhow\s+(?:to|(?:do|does|can|could|should|would|might|will)\s+${ASKER})\s+(?:\w{1,15}ly\s+|best\s+|just\s+)?${TARGET}`,
  ),
  new RegExp(
    String.raw`\bhow\s+(?:he|she|they|someone|somebody|people|a\s+person|one|(?:my|his|her|their|a|the)\s+\w{1,20})\s+(?:${HARM_STEM}e?s?\s+${REFLEXIVE}\b|(?:ends?|takes?)\s+${POSSESSIVE}\s+(?:own\s+)?li(?:fe|ves)\b${LIFE_ENDS})`,
  ),
  new RegExp(
    String.raw`\b(?:ways?|methods?|means|techniques?|options?|instructions?|steps|tips|guides?|tutorials?|ideas)\s+(?:to|of|for|on)\s+(?:how\s+to\s+)?(?:${TARGET}|\b${HARM_STEM}\w{0,4}\s+${REFLEXIVE}\b|\b${SUICIDE_NOUN})`,
  ),
  new RegExp(
    String.raw`\b${GENTLE}\s+(?:ways?|methods?|means|options?)\s+(?:to|of|for)\s+(?:${DIE}|dying\b|${TARGET}|${SUICIDE_NOUN})`,
  ),
  new RegExp(
    String.raw`\b(?:${QUALIFIER}\s+${SUICIDE_NOUN}\b(?!\s+(?:prevention|awareness))|suicide\s+(?:methods?|techniques?|instructions?|guides?|tips|kits?|ideas|options|means|how[\s-]?to)\b)`,
  ),
  new RegExp(
    String.raw`\bhow\s+(?:many|much)\b[^.?!\n]{0,60}?\b(?:to|would|will|could|can)\s+(?:${DOSE_KILL}|${NEVER_WAKE})`,
  ),
  new RegExp(
    String.raw`\b(?:how\s+many|how\s+much|which|what)\b[^.?!\n]{0,40}?\b${MEANS}\b[^.?!\n]{0,40}?\b(?:to|would|will|could|can|and)\s+(?:${ASKER}\s+)?(?:${DIE}|${DOSE_KILL}|${FATAL_DOSE}|${TARGET})`,
  ),
  new RegExp(
    String.raw`\b(?:is|are|would|will)\b[^.?!\n]{0,40}?\b${MEANS}\b[^.?!\n]{0,20}?\benough\s+to\s+(?:${DIE}|${DOSE_KILL}|${TARGET})`,
  ),
  new RegExp(
    String.raw`\b(?:what(?:'s|’s|\s+is|\s+would\s+be)|how\s+much\s+is|tell\s+me)\s+(?:the\s+|a\s+)?(?:lethal|fatal|deadly)\s+(?:dose|dosage|amount|quantity)\b`,
  ),
  new RegExp(
    String.raw`\b(?:which|what)\b[^.?!\n]{0,60}?(?:\b${MEANS}\b[^.?!\n]{0,60}?\b(?:most|more)\s+(?:lethal|deadly|fatal)\b|\b(?:most|more)\s+(?:lethal|deadly|fatal)\s+(?:\w{1,20}\s+)?${MEANS}\b)`,
  ),
  new RegExp(String.raw`\bhelp\s+me\s+(?:to\s+)?${TARGET}`),
  new RegExp(
    String.raw`\b(?:buy|obtain|mix|swallow|inject|use)\b[^.?!\n]{0,40}?\bto\s+(?:${DIE}|${TARGET})`,
  ),
  new RegExp(
    String.raw`\b(?:where|how\s+deep|how\s+far)\b[^.?!\n]{0,40}?\bcut\w{0,4}\b[^.?!\n]{0,30}?\bto\s+(?:bleed\s+(?:out|to\s+death)|${DIE})`,
  ),
  new RegExp(
    String.raw`\bi(?:\s+am|'m|’m)?\s+(?:want(?:ing)?|need(?:ing)?|plan(?:ning)?|going|gonna|wanna|decided|ready|about)\s+(?:to\s+)?(?:${TARGET}|die\b)[\s\S]{0,80}?(?:\b${QUALIFIER}\s+(?:way|method|means|option)s?(?=\s*(?:[?.!,;]|$|for\s+me|to\s+do\s+(?:it|that|this)|to\s+go|of\s+doing\s+(?:it|that|this)))|\bhow\s+(?:should|can|could|do|would|will)\s+i\s+(?:do\s+(?:it|that|this)|go\s+about\s+it)\b)`,
  ),
];

export type ContentFilterResult = { allowed: true } | { allowed: false; refusal: string };

export function isSelfHarmMethodRequest(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return SELF_HARM_METHOD_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function checkContentFilter(
  prompt: string,
  enabled: boolean,
  refusal: string,
): ContentFilterResult {
  if (!enabled) return { allowed: true };

  const normalized = prompt.toLowerCase();
  for (const pattern of STRICT_UNSAFE_PATTERNS) {
    if (pattern.test(normalized)) {
      return { allowed: false, refusal };
    }
  }
  if (isSelfHarmMethodRequest(prompt)) return { allowed: false, refusal };
  return { allowed: true };
}
