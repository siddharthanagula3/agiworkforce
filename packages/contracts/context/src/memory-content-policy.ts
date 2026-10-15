export const PROHIBITED_MEMORY_CATEGORIES = [
  'credential',
  'payment_instrument',
  'government_identifier',
  'biometric',
  'precise_location',
  'criminal_history',
  'immigration_status',
] as const;

export type ProhibitedMemoryCategory = (typeof PROHIBITED_MEMORY_CATEGORIES)[number];

export const SENSITIVE_MEMORY_TOPICS = [
  'health',
  'racial_or_ethnic_origin',
  'religious_belief',
  'political_opinion',
  'sexual_orientation',
  'gender_identity',
  'trade_union_membership',
] as const;

export type SensitiveMemoryTopic = (typeof SENSITIVE_MEMORY_TOPICS)[number];

export interface MemoryContentRule<Category extends string> {
  readonly id: string;
  readonly category: Category;
  matches(normalized: string): boolean;
}

export type ProhibitedMemoryRule = MemoryContentRule<ProhibitedMemoryCategory>;

export type SensitiveMemoryRule = MemoryContentRule<SensitiveMemoryTopic>;

function regexRule<Category extends string>(
  id: string,
  category: Category,
  pattern: RegExp,
): MemoryContentRule<Category> {
  return { id, category, matches: (normalized) => pattern.test(normalized) };
}

const DIGIT_RUN = /\d(?:[ -]?\d){12,18}/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = digits.charCodeAt(index) - 48;
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function looksLikePaymentCard(normalized: string): boolean {
  for (const run of normalized.match(DIGIT_RUN) ?? []) {
    const digits = run.replace(/[^0-9]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) return true;
  }
  return false;
}

const SUBJECT = String.raw`\b(?:user|i|he|she|they)`;

const OWNER = String.raw`\b(?:user's|my|his|her|their)`;

const CLAUSE_END = String.raw`(?=\s*(?:[.,;:!?)]|$))`;

const CRIMES = String.raw`(?:assault|battery|theft|robbery|burglary|larceny|fraud|forgery|embezzlement|extortion|bribery|perjury|murder|manslaughter|homicide|rape|sexual assault|domestic violence|harassment|stalking|kidnapping|arson|vandalism|trespass(?:ing)?|shoplifting|dui|dwi|drunk driving|reckless driving|hit and run|possession|trafficking|smuggling|money laundering|tax evasion|insider trading|racketeering|conspiracy|disorderly conduct|public intoxication|resisting arrest|contempt of court|a (?:crime|felony|misdemeanou?r)|crimes|felon(?:y|ies)|misdemeanou?rs?|drug (?:possession|trafficking|offen[cs]es?|charges)|criminal (?:mischief|damage|trespass|negligence))`;

const CHARGED_WITH_DUTY = String.raw`(?!(?:\s+[a-z-]+)?\s+(?:detection|prevention|compliance|training|investigations?|analysis|analytics|monitoring|risk|reporting|research|polic(?:y|ies)|operations|ops|teams?|units?|desks?|cases|reviews?|awareness|controls?|screening|response|strategy|programs?|models?|tooling|systems?|data|engineering|procurement|enforcement)\b)`;

const PAROLE_WORK = String.raw`(?!\s+(?:boards?|officers?|agents?|hearings?|commission(?:ers?)?|duty|reform|polic(?:y|ies)|cases)\b)`;

const CUSTODY = String.raw`(?:(?:a|an|the)\s+)?(?:(?:federal|state|county|local|military|(?:maximum|minimum|high|low)[- ]security)\s+)?(?:prison|jail|juvie|juvenile detention|juvenile hall|youth detention(?: cent(?:er|re)| facility)?|penitentiary|correctional facility)`;

const NOT_PRISON_WORK = String.raw`(?!\s+(?:ministry|reform|education|outreach|chaplaincy|abolition|advocacy|administration|management|law|policy|programs?|services|visits?|volunteering|tours?|library|museums?|health|medicine|nursing|psychology|research|teaching|classes|art|journalism|films?|movies?|dramas?|documentar(?:y|ies)|series|shows?|novels?|books?|podcasts?|break|escape)\b|\s+to\s+(?:teach|visit|volunteer|work|speak|perform|minister|see|interview)\b|\s+as\s+(?:an?\s+)?(?:guard|officer|warden|chaplain|nurse|doctor|teacher|tutor|instructor|volunteer|counsell?or|social worker|psychologist|journalist|reporter|researcher|visitor)\b)`;

const VISA_TYPES = String.raw`(?:h-?1b|h-?4|l-?1|f-?1|j-?1|o-?1|tn|e-?2|eb-?[1-5]|k-?1|b-?[12]|tier [1-5]|bridging|student|work|spousal|spouse|partner|fiancee?|dependent|family|employment|investor|skilled worker|working holiday|digital nomad|golden|residence|resident|immigrant)`;

const IMMIGRATION_DOCUMENT = String.raw`(?:${VISA_TYPES}\s+visa|green card|permanent residency|permanent residence|work permit|residence permit|residency permit|employment authori[sz]ation(?:\s+(?:document|card))?|indefinite leave to remain|(?:pre-)?settled status|eu blue card)`;

const IMMIGRATION_CODE = String.raw`(?:(?:h-?1b|h-4|l-1[ab]?|f-1|j-1|o-1|e-2)(?!\s+visa\b)|(?:stem\s+)?opt(?![-\w])|ead|tps(?!\s+reports?)|i-?(?:485|765|130|751|589|131))`;

const IMMIGRATION_HOLDING = String.raw`(?:${IMMIGRATION_DOCUMENT}|${IMMIGRATION_CODE})`;

const IMMIGRATION_PLACE = String.raw`(?:(?:the|this)\s+)?(?:us|u\.s\.|usa|u\.s\.a\.|united states|states|america|uk|u\.k\.|united kingdom|britain|country|border|canada|australia|eu|schengen area)`;

const WITHOUT_STATUS = String.raw`(?:illegally|undocumented|without (?:papers|legal (?:papers|documents|status)|immigration (?:papers|documents|status)|a (?:valid )?visa|a green card|a work permit|inspection))(?!\s+(?:for|to|on|about)\b)`;

const PERSON_WITH_RECORD_END = String.raw`(?=\s*(?:[.,;:!?)]|$)|\s+(?:who|since|for|from|in|on|and|after|with|living|now|currently|released)\b)`;

const NOT_A_GAME_OR_MEETING = String.raw`(?!\s+(?:in|on|during|at)\s+(?:a\s+|the\s+)?(?:monopoly|(?:board\s+|video\s+|card\s+)?games?|meetings?)\b)`;

const COUNT = String.raw`(?:\d+|two|three|four|five|six|seven|eight|nine|ten|several|multiple|many|a few|a couple of)`;

const DURATION = String.raw`(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|several|some|many|a few)\s+(?:years?|months?|weeks?|days?|nights?)`;

const HELD_FOR_SOMEONE_ELSE = String.raw`(?:\s+[a-z-]+){0,2}\s+for\s+(?:his|her|their|my|our|a|an|the)\s+(?!(?:new\s+)?(?:job|role|position|employer|company|work|studies|study|degree|phd|master'?s|program(?:me)?|university|school|college|internship|residency|stay|move|relocation)\b)`;

const RULES: readonly ProhibitedMemoryRule[] = [
  regexRule(
    'credential.declared_secret',
    'credential',
    /\b(?:password|passcode|passphrase|pin code|api key|secret key|access token|refresh token|private key|ssh key|seed phrase|recovery phrase|recovery code|client secret)\b[^a-z0-9]{0,8}(?:is|are|=|:)?[^a-z0-9]{0,4}\S/,
  ),
  regexRule(
    'credential.opaque_token',
    'credential',
    /\b(?:token|secret|credential|authorization)\b\s*[:=]\s*[a-z0-9._-]{16,}/,
  ),
  regexRule(
    'credential.named_token',
    'credential',
    /\b(?:token|key|secret|pat)\s+(?:is|was)\s+(?=[a-z0-9._-]{16,})[a-z0-9._-]*[\d_]/,
  ),
  { id: 'payment.card_number', category: 'payment_instrument', matches: looksLikePaymentCard },
  regexRule(
    'payment.named_field',
    'payment_instrument',
    /\b(?:cvv|cvc|card verification (?:code|value)|iban|swift code|routing number|sort code|bank account number)\b[^a-z0-9]{0,8}(?:is|=|:)?[^a-z0-9]{0,4}[a-z0-9]/,
  ),
  regexRule('government.ssn_shape', 'government_identifier', /\b\d{3}-\d{2}-\d{4}\b/),
  regexRule(
    'government.named_identifier',
    'government_identifier',
    /\b(?:ssn|social security number|passport number|driver'?s licen[cs]e number|national id(?:entity)? number|aadhaar(?: number)?|tax identification number|taxpayer id)\b[^a-z0-9]{0,8}(?:is|=|:)?[^a-z0-9]{0,4}[a-z0-9]/,
  ),
  regexRule(
    'government.document_value',
    'government_identifier',
    /\b(?:passport|driver'?s licen[cs]e|driving licen[cs]e|national id(?:entity)?(?: card)?|id card)(?:\s+(?:number|no\.?|#))?\s*(?:is|=|:)\s*[a-z]{0,3}[- ]?\d[\d -]{3,}/,
  ),
  regexRule(
    'biometric.identifier',
    'biometric',
    /\b(?:fingerprint|face scan|facial scan|retina scan|iris scan|voiceprint|dna (?:profile|sequence|sample))\b/,
  ),
  regexRule(
    'location.coordinates',
    'precise_location',
    /-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}/,
  ),
  regexRule(
    'location.street_address',
    'precise_location',
    /\b\d{1,5}[a-z]? [a-z0-9.'-]+(?: [a-z0-9.'-]+){0,3} (?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|terrace|place|pl)\b/,
  ),
  regexRule(
    'location.street_address_named_first',
    'precise_location',
    /\b\d{1,5}[a-z]?,? (?:rue|calle|avenida|rua|carrer|chemin|piazza|viale|via del|via della) [a-z]|(?<![a-zäöüß-])[a-zäöüß-]{1,40}(?:straße|strasse|str\.) \d{1,4}[a-z]?\b/,
  ),
  regexRule(
    'criminal.record',
    'criminal_history',
    new RegExp(
      String.raw`${OWNER}\s+(?:(?:criminal|arrest|police|prison|conviction|juvenile)\s+(?:record|history|past)|criminal background(?!\s+checks?\b))\b|\b(?:has|have|had|having|got)\s+(?:an?\s+)?(?:criminal (?:record|history|conviction|past|background)|(?:prior\s+)?(?:felony|misdemeanou?r|juvenile|dui|dwi|drunk[- ]driving|assault|theft|fraud|drug|domestic violence)\s+(?:convictions?|charges?|records?)|(?:arrest|police|prison|jail|juvenile|youth)\s+record|(?:(?:long|lengthy)\s+)?rap sheet|prior convictions?|convictions?\s+(?:for|of)\s+(?:an?\s+)?${CRIMES}|expunged\s+(?:criminal\s+|arrest\s+|juvenile\s+)?record|sealed\s+(?:criminal|arrest|juvenile|court)\s+record|sealed\s+record(?=\s*(?:[.,;:!?)]|$)))\b(?!\s+(?:lawyers?|attorneys?|cases?|clients?|practice|class(?:es)?|course|checks?|expungement|clerks?|offices?|departments?|units?|requests?|databases?|systems?|management|retention)\b)|\b(?:has|have|had|having|got)\s+(?:an?\s+)?(?:(?:felony|felonies|misdemeanou?rs?|dui|dwi)(?=\s*(?:[.,;:!?)]|$)|\s+(?:from|in|last|back|when|after|on (?:his|her|their|my) record)\b)|record(?=\s*(?:[.,;:!?)]|$)|\s+with\s+the\s+police\b|\s+for\s+(?:an?\s+)?${CRIMES}\b))|\b(?:has|have|had|having|got)\s+${COUNT}\s+(?:(?:prior|previous)\s+)?(?:(?:duis|dwis|dui's|dwi's|felonies|misdemeanou?rs)\b|arrests\b(?=${CLAUSE_END}|\s+(?:on (?:his|her|their|my) record|for|since|from|as an? (?:teen|teenager|juvenile|kid|minor|adult))\b))`,
    ),
  ),
  regexRule(
    'criminal.status',
    'criminal_history',
    new RegExp(
      String.raw`${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|had been)\s+(?:(?:currently|still|now|previously|once|formerly)\s+)?(?:an?\s+)?(?:(?:(?:convicted|registered|former)\s+(?:sex\s+)?(?:felon|offender|convict|prisoner|inmate)|felon|convict|parolee|fugitive|drug dealer)${PERSON_WITH_RECORD_END}|on parole\b${PAROLE_WORK}|on (?:court[- ]ordered|supervised|criminal|felony|misdemeanou?r|federal|state|county) probation\b|on probation\s+(?:for|after)\s+(?:an?\s+|(?:his|her|their|my)\s+)?(?:${CRIMES}|conviction|arrest|offen[cs]e|charges?)\b)|\bex-?(?:con|convict|offender|felon|prisoner)\b${PERSON_WITH_RECORD_END}|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|had been)\s+(?:an?\s+)?(?:formerly|previously|once)\s+(?:incarcerated|imprisoned|jailed)\b|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|had been)\s+(?:(?:currently|still|now|once|previously)\s+)?(?:(?:listed|registered)\s+)?(?:on|in)\s+(?:the\s+|a\s+)?(?:(?:state|national|federal|public|local|county)\s+)?sex offender regist(?:ry|er)\b|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|had been|got|gets)\s+(?:(?:currently|still|now|already|just)\s+)?(?:(?:out|released|freed)\s+on\s+(?:bail|bond)|on\s+bail)\b|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|had been)\s+(?:(?:currently|still|now|once|previously)\s+)?(?:on|under)\s+(?:house arrest|death row|supervised release(?!\s+(?:testing|tests?|builds?|versions?|candidates?|notes|process|pipelines?|channels?|tracks?|branch(?:es)?|schedules?)\b))\b|\b(?:served|serving|did|doing)\s+(?:${DURATION}\s+(?:of|on|under)\s+)?house arrest\b`,
    ),
  ),
  regexRule(
    'criminal.justice_event',
    'criminal_history',
    new RegExp(
      String.raw`${SUBJECT}\s+(?:was|were|has been|have been|had been|is|am|are|got|gets|been|being)\s+(?:(?:previously|once|recently|twice|wrongly|wrongfully|falsely)\s+)?(?:convicted|arrested(?!\s+by\s+(?:an?|the|this|that)\s+(?:[a-z]+\s+)?(?:idea|thought|image|sight|view|song|scene|moment|smell|voice|question|design|painting|photo|story|book)\b)|(?:incarcerated|imprisoned|jailed)${NOT_A_GAME_OR_MEETING}|indicted|locked up(?=\s*(?:[.,;:!?)]|$)|\s+(?:for|in\s+(?:custody|${CUSTODY})|after|since|twice|again)\b)|sentenced(?!\s+to\s+(?:read|watch|sit|listen|attend|review|write|endure)\b|\s+to\s+(?:[a-z0-9-]+\s+){1,3}of\s+(?!(?:probation|community service|house arrest|prison|jail|custody)\b))|charged with\s+(?:an?\s+|(?:first|second|third)[- ]degree\s+|felony\s+|misdemeanou?r\s+)?${CRIMES}${CHARGED_WITH_DUTY})\b|\b(?:served|serving|did|doing|spent|spending)\s+(?:${DURATION}|time)\s+(?:(?:in|behind)\s+(?:${CUSTODY}\b${NOT_PRISON_WORK}|bars\b)|for\s+(?:an?\s+)?${CRIMES}\b)|\b(?:did|done|doing|serve|serves|served|serving)\s+(?:(?:some|hard|real)\s+)?time(?=${CLAUSE_END}|\s+(?:years ago|back in|as an? (?:kid|teen|teenager|juvenile|minor|young (?:man|woman|adult)))\b)|\b(?:spent|spending|spend|spends)\s+${DURATION}\s+(?:incarcerated|imprisoned|locked up|in custody)\b|\b(?:served|serving|completed|finished)\s+(?:an?\s+|(?:his|her|their|my)\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)[- ](?:year|month)\s+(?:sentence|stretch)\b|${SUBJECT}\s+(?:(?:was|were|is|am|are|has been|have been|had been|got|just|recently|once|later)\s+)*(?:found|pleaded|pled|plead|pleads|pleading)\s+(?:guilty|no contest)(?=${CLAUSE_END}|\s+(?:to|of)\s+(?:(?:an?|two|three|several|multiple)\s+)?(?:(?:first|second|third)[- ]degree\s+|felony\s+|misdemeanou?r\s+)?(?:${CRIMES}|charges?|counts?|offen[cs]es?)\b|\s+(?:in|at|last|after|before|back)\b)|${SUBJECT}\s+(?:was|were|has been|have been|had been|got|gets)\s+booked\s+(?:(?:for|on)\s+(?:an?\s+|(?:first|second|third)[- ]degree\s+|felony\s+|misdemeanou?r\s+)?${CRIMES}\b|into\s+(?:the\s+)?(?:(?:county|city|local)\s+)?(?:jail|custody)\b)|${SUBJECT}\s+(?:(?:was|were|has been|have been|had been|got|gets|just|recently|finally|only)\s+)+paroled\b|${SUBJECT}\s+(?:(?:has|have|had|once|allegedly)\s+)?committed\s+(?:an?\s+|(?:first|second|third)[- ]degree\s+|felony\s+|misdemeanou?r\s+)?${CRIMES}(?=${CLAUSE_END}|\s+(?:in|at|when|as|against|and|while|back|years?|last|before|after)\b)|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been)\s+(?:(?:currently|still|now)\s+)?(?:awaiting|facing|on|standing)\s+trial\s+(?:for|on)\s+(?:an?\s+|(?:first|second|third)[- ]degree\s+|felony\s+|misdemeanou?r\s+)?${CRIMES}\b|${SUBJECT}\s+(?:has|have|had)\s+(?:an?\s+)?(?:pending|open|ongoing|active)\s+(?:criminal|felony|misdemeanou?r|dui|dwi|drug|assault)\s+(?:case|charges?|trial)\b|${SUBJECT}\s+(?:has|have|had)\s+(?:an?\s+)?(?:(?:outstanding|active|open|bench|arrest)\s+warrants?\b|warrants?\s+out\b)|${SUBJECT}\s+(?:is|am|are|was|were)\s+(?:(?:currently|still|now)\s+)?wanted\s+by\s+(?:the\s+)?(?:police|cops|fbi|authorities|interpol|law enforcement)\b|${SUBJECT}\s+(?:was|were|got|gets|has been|have been)\s+(?:busted|caught|nabbed|pinched|picked up)\s+(?:for\s+(?:an?\s+)?(?:${CRIMES}|weed|pot|drugs|marijuana|cocaine|meth|heroin)|shoplifting|dealing drugs|selling drugs|driving drunk|drunk driving|with (?:drugs|weed|cocaine|meth|heroin))\b|${SUBJECT}\s+(?:(?:once|used to|has|have|had)\s+)?(?:(?:dealt|deals|deal|dealing)\s+(?:hard\s+)?drugs\b|(?:sold|sells|sell|selling)\s+(?:hard\s+)?drugs(?=${CLAUSE_END}|\s+(?:as an? (?:teen|teenager|kid|minor)|in (?:high school|college)|on the street)\b))|${SUBJECT}\s+(?:(?:once|has|have|had)\s+)?(?:shoplifted|embezzled)\b|\b(?:served|serving|completed|finished)\s+(?:an?\s+)?(?:\d+[- ](?:year|month)\s+)?(?:prison|jail|custodial)\s+(?:sentence|term)\b|${SUBJECT}\s+(?:was|were|has been|have been|had been|is|am|are|went|got sent|was sent|were sent)\s+(?:in|to)\s+${CUSTODY}\b${NOT_PRISON_WORK}${NOT_A_GAME_OR_MEETING}|${SUBJECT}\s+(?:(?:was|were|has been|have been|had been|got|gets|just|recently|finally|only)\s+)*(?:released|paroled|freed|let out)\s+(?:early\s+)?from\s+(?:custody|${CUSTODY}${NOT_PRISON_WORK})\b${NOT_A_GAME_OR_MEETING}|${SUBJECT}\s+(?:(?:just|recently|finally|only|now|has|have|had)\s+)*(?:got|gets|getting|gotten|came|comes|coming|is|am|are|was|were|been)\s+out\s+of\s+${CUSTODY}\b${NOT_PRISON_WORK}${NOT_A_GAME_OR_MEETING}(?!\s+free\b)`,
    ),
  ),
  regexRule(
    'immigration.status_statement',
    'immigration_status',
    new RegExp(
      String.raw`${OWNER}\s+(?:immigration|visa|residency|asylum|refugee|citizenship|daca)\s+status\b|${OWNER}\s+(?:immigration|asylum|refugee|daca|green card|citizenship|naturali[sz]ation|${VISA_TYPES}\s+visa|${IMMIGRATION_CODE})\s+(?:application|case|claim|petition|interview|hearing|appeal)\b|\b(?:immigration|visa|residency) status is\b|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|became|has become|have become)\s+(?:(?:currently|still|now|previously)\s+)?(?:an?\s+)?(?:undocumented|illegal (?:immigrant|alien)|unauthori[sz]ed (?:immigrant|migrant)|asylum seeker|asylee|refugee(?=\s*(?:[.,;:!?)]|$)|\s+(?:from|who|since|in|after|fleeing)\b)|daca recipient|visa overstayer|stateless|green card holder|(?:[a-z.]+\s+)?(?:lawful\s+)?permanent resident|naturali[sz]ed\s+(?:[a-z.]+\s+)?citizen|visa holder|(?:h-?1b|h-?4|l-?1|f-?1|j-?1|o-?1|tn|e-?2)\s+(?:visa\s+)?holder|(?:daca|tps|ead|pr|ilr)\s+(?:holder|recipient|beneficiary)|recipient of (?:daca|tps|temporary protected status)|illegal(?=${CLAUSE_END})|sin papeles|naturali[sz]ed (?:american|brit(?:on|ish)|canadian|australian)|(?:[a-z.]+\s+)?citizen by naturali[sz]ation|out of status)\b|${SUBJECT}\s+(?:(?:is|am|are|was|were)\s+)?(?:applying|applied|apply|waiting|waited)\s+(?:for|on)\s+(?:(?:his|her|their|my)\s+)?(?:(?!an?\s)[a-z.]+\s+)?(?:citizenship|naturali[sz]ation)\b(?!${HELD_FOR_SOMEONE_ELSE})|\boverstay(?:ed|ing|s)?\s+(?:(?:his|her|their|my|a|the)\s+)?(?:[a-z-]+\s+)?(?:visa|status|(?:residence|residency|work|stay)\s+permit)\b`,
    ),
  ),
  regexRule(
    'immigration.document',
    'immigration_status',
    new RegExp(
      String.raw`${SUBJECT}\s+(?:(?:is|am|are|was|were|has been|have been|had been|recently|just|finally|currently|still|already|now)\s+)*(?:(?:in|living in|working in|staying in)\s+(?:the\s+)?[a-z.]+(?:\s+[a-z.]+)?\s+)?(?:on|holds?|holding|has got|have got|had got|has|have|had|having|got|gets|getting|received|receiving|applied for|applying for|awaiting|waiting for|waiting on|renewing|renewed|lost|losing|denied|was denied|were denied|needs?|needed|sponsored for|petitioning for|seeking|sought|filed for|filing for|won|obtained|obtaining|qualif(?:y|ies|ied) for)\s+(?:an?\s+|(?:his|her|their|my)\s+)?(?:pending\s+)?(?:${IMMIGRATION_HOLDING}|asylum|refugee status|daca|temporary protected status)\b(?!\s+(?:applications?|cases?|clients?|law|lawyers?|attorneys?|polic(?:y|ies)|process(?:ing)?|requirements?|support|seekers?|lottery|holders?|sponsorship|employees?|engineers?|workers?|hires?|candidates?|staff)\b|${HELD_FOR_SOMEONE_ELSE})|${SUBJECT}\s+(?:has|have|had|filed|submitted)\s+(?:an?\s+|(?:his|her|their|my)\s+)?(?:pending\s+)?(?:${IMMIGRATION_HOLDING}|asylum|citizenship|naturali[sz]ation)\s+(?:application|petition|case|interview|hearing)\b(?!${HELD_FOR_SOMEONE_ELSE})|${OWNER}\s+(?:${IMMIGRATION_HOLDING}|visa(?!\s+card))\s+(?:expires?|expired|expiring|was (?:approved|denied|revoked)|got (?:approved|denied)|is (?:pending|expiring|approved|denied|valid|up for renewal)|renewal|runs out|ran out|lapsed|lapses)\b|${SUBJECT}\s+(?:(?:was|were|is|am|are|has been|have been|had been|got|gets|being|currently|now|still)\s+)*(?:(?:faces|facing|faced|face|fighting|fights|fought|fight|awaiting|awaits|in|under|threatened with)\s+)?(?:(?:possible|potential|imminent)\s+)?(?:deport(?:ed|ation)|(?:removal|deportation) proceedings)\b(?!\s+(?:cases?|clients?|law|lawyers?|attorneys?|defen[cs]e|polic(?:y|ies)|flights?|raids?|stud(?:y|ies)|research)\b)|${SUBJECT}\s+(?:has|have|had|got|received|was given|were given)\s+(?:an?\s+)?(?:final\s+)?(?:deportation|removal)\s+order\b|${SUBJECT}\s+(?:(?:was|were|is|am|are|has been|have been|had been|got|gets|recently|once|briefly|just)\s+)+(?:detained|arrested|picked up|held|taken|deported)\s+by\s+(?:ice|immigration(?:\s+(?:officers|agents|authorities|enforcement))?|border patrol|cbp)\b|${SUBJECT}\s+(?:(?:was|were|is|am|are|has been|have been|had been|currently|still|now)\s+)+in\s+(?:ice|immigration)\s+(?:detention|custody)\b|${SUBJECT}\s+(?:has|have|had|got)\s+(?:an?\s+|(?:his|her|their|my)\s+)?(?:(?:next|upcoming|monthly|annual|yearly|weekly)\s+)?ice check-?ins?\b|${SUBJECT}\s+(?:(?:was|were|has been|have been|had been|got|recently|just|finally)\s+)+granted\s+(?:an?\s+|(?:his|her|their|my)\s+)?(?:asylum|refugee status|daca|tps|temporary protected status|permanent residen(?:cy|ce)|${IMMIGRATION_HOLDING})\b(?!${HELD_FOR_SOMEONE_ELSE})|${SUBJECT}\s+(?:(?:will|would|do|does|did|still|currently|also)\s+)*(?:needs?|needed|needing|requires?|required|requiring)\s+(?:(?:(?:an?|h-?1b|visa|work visa|immigration|green card|work permit)\s+)+sponsorship\b(?!${HELD_FOR_SOMEONE_ELSE})|sponsorship\s+to\s+(?:work|stay|live|remain)\s+in\s+${IMMIGRATION_PLACE})|${SUBJECT}\s+(?:is|am|are|was|were)\s+(?:not\s+|un)(?:legally\s+)?(?:authori[sz]ed|eligible|allowed|permitted)\s+to\s+work\s+in\s+${IMMIGRATION_PLACE}\b`,
    ),
  ),
  regexRule(
    'immigration.unlawful_presence',
    'immigration_status',
    new RegExp(
      String.raw`${SUBJECT}\s+(?:(?:first|originally|initially|once)\s+)?(?:came|comes|entered|enters|crossed|crosses|snuck|sneaked|slipped|arrived|immigrated|migrated|moved)\s+(?:here|(?:(?:to|into|in|over)\s+)?${IMMIGRATION_PLACE}|across\s+(?:the\s+)?border)(?:\s+[a-z0-9]+){0,2}?\s+${WITHOUT_STATUS}\b|${SUBJECT}\s+(?:(?:is|am|are|was|were|has been|have been|had been)(?:\s+(?:currently|still|now))?(?:\s+(?:living|staying|working|residing|remaining))?|lives?|lived|stays?|stayed|works?|worked|resides?|resided|remains?|remained|living|staying|working)\s+(?:(?:currently|still|now)\s+)?(?:here|in\s+${IMMIGRATION_PLACE})\s+${WITHOUT_STATUS}\b|${SUBJECT}\s+(?:is|am|are|was|were)\s+an?\s+(?:[a-z-]+\s+)?(?:immigrant|migrant)\s+${WITHOUT_STATUS}\b|${SUBJECT}\s+(?:(?:first|originally|once)\s+)?(?:snuck|sneaked)\s+(?:in(?:to)?|across|over)\s+(?:${IMMIGRATION_PLACE}|the border)\b|${SUBJECT}\s+(?:(?:do not|don't|does not|doesn't|did not|didn't|never)\s+(?:have|has|had|got)|(?:has|have|had)\s+no|lacks?|lacked|lacking|(?:is|am|are|was|were)\s+without)\s+(?:(?:(?:legal|lawful|valid|immigration|residency|any|my|his|her|their)\s+){0,2}(?:papers|status)|(?:legal|lawful|valid|immigration)\s+documents)(?=\s*(?:[.,;:!?)]|$)|\s+(?:here|yet|in\s+${IMMIGRATION_PLACE}|to\s+(?:live|work|stay|remain))\b)`,
    ),
  ),
];

const SELF_VERB = String.raw`${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|became|has become|have become|identif(?:y|ies) as|came out as|works as|worked as|serves as|served as|(?:(?:is|am|are|was|were)\s+)?(?:working|serving) as|(?:considers?|considered|describes?|described|calls?|called)\s+(?:himself|herself|themselves|themself|myself)(?:\s+as|\s+to be)?)\s+`;

const SELF_DESCRIBED = String.raw`${SELF_VERB}(?:an?\s+)?`;

const ARTICLE = String.raw`(?:an?|the)\s+`;

const PHRASE_BREAK = String.raw`(?:and|or|but|nor|who|whom|whose|which|that|than|as|like|of|for|to|with|without|at|in|into|on|onto|from|by|about|after|before|during|since|until|while|because|if|when|where|whether|over|under|between|among|against|through|toward|towards|around|near|per|via|a|an|the|this|these|those|his|her|their|my|our|its|your|is|are|was|were|am|be|been|has|have|had|does|do|did|will|would|can|could|should|may|might|must)`;

const DESCRIPTORS = String.raw`(?:(?!${PHRASE_BREAK}\b|[a-z']+ing\b)[a-z0-9'-]+,?\s+){0,4}`;

const ALONGSIDE = String.raw`(?:[a-z0-9'-]+,?\s+){1,8}?(?:and|but|who is|who's|who am|who are|who was|that is|who identif(?:y|ies) as)\s+(?:also\s+)?`;

const BARE_END = String.raw`(?=\s*(?:[.,;:!?)]|$)|\s+(?:and|but|who|since|living|working|based|from|in|at|with)\b)`;

function selfIdentified(term: string): string {
  return String.raw`${SELF_VERB}(?:${ARTICLE})?${DESCRIPTORS}(?:${term})|${SELF_VERB}(?:${ARTICLE})?${ALONGSIDE}(?:${ARTICLE}${DESCRIPTORS}(?:${term})|(?:${term})${BARE_END})`;
}

function selfStated(term: string): string {
  return String.raw`${SELF_DESCRIBED}(?:${term})|${SELF_VERB}(?:${ARTICLE})?${ALONGSIDE}(?:${ARTICLE})?(?:${term})${BARE_END}`;
}

const PERSON_NOUN = String.raw`(?:man|men|woman|women|person|people|guy|girl|boy|lady|male|female|kid|child|teen|teenager|adult|parent|mom|mum|mother|dad|father|wife|husband|son|daughter|sister|brother|veteran|immigrant|developer|engineer|programmer|designer|founder|entrepreneur|professional|writer|author|artist|musician|athlete|teacher|lawyer|doctor|nurse|scientist|researcher|gamer|creator|leader|employee|worker|executive|manager|student)`;

const WORK_FIELD = String.raw`(?:software|tech|business|small[- ]business|startup|first[- ]gen(?:eration)?|college|grad(?:uate)?|medical|law|nursing|engineering|data|product|ux|web|game|marketing|sales|finance|stem|healthcare|real estate)`;

const GENDERED_PERSON = String.raw`(?:man|men|woman|women|person|people|guy|girl|boy|lady|male|female|wife|husband|mom|mum|mother|dad|father|son|daughter|sister|brother|kid|teen|teenager|adult|parent|partner|spouse)`;

const LIVES_WITH = String.raw`\b(?:has|have|had|having|manages|managing|lives with|living with|suffers from|suffering from|suffered from|struggles with|struggling with|deals with|dealing with|copes with|coping with|battles|battling|recovering from|being treated for|survived|a survivor of|a victim of|experiences|experiencing|experienced|went through|goes through|going through|endured|endures|got|gets|getting)\s+(?:got\s+)?`;

const HISTORY_OF = String.raw`(?:(?:an?\s+)?(?:(?:long|family|personal|medical|prior|previous)\s+)?history of\s+)?`;

const CONDITION_SEVERITY = String.raw`(?:(?:mild|severe|chronic|clinical|acute|terminal|early[- ]onset|late[- ]stage|stage [0-4]|type (?:1|2|one|two)|seasonal|postpartum|generali[sz]ed|social|moderate)\s+)*`;

const HEALTH_CONDITIONS = String.raw`(?:diabetes|cancer|(?:breast|lung|prostate|skin|colon|colorectal|bowel|ovarian|cervical|pancreatic|brain|bone|blood|thyroid|bladder|kidney|liver|stomach|throat|testicular|uterine) cancer|leuka?emia|lymphoma|an? (?:(?:benign|malignant|cancerous|inoperable|rare)\s+)?(?:(?:brain|spinal(?: cord)?|lung|breast|liver|kidney|bone|pituitary|thyroid|ovarian|bladder|colon|pancreatic|stomach|skin|neck|head|adrenal|uterine|testicular|eye)\s+)?tumou?r|(?:brain|spinal(?: cord)?|lung|breast|liver|kidney|bone|pituitary|thyroid|ovarian|bladder|colon|pancreatic|stomach|skin|neck|head|adrenal|uterine|testicular|eye)\s+tumou?rs|asthma|epilepsy|seizures|adhd|autism|asperger'?s|depression|anxiety|an anxiety disorder|panic attacks|a panic disorder|ptsd|ocd|bipolar(?: disorder)?|schizophrenia|dementia|alzheimer'?s|parkinson'?s|multiple sclerosis|ms(?!\.\s*[a-z])(?=\s*(?:[.,;:!?)]|$)|\s+(?:and|but|since|for|which|so|flares?|symptoms|relapses?|lesions)\b)|als|arthritis|migraines?|hypertension|high blood pressure|heart disease|a heart condition|heart failure|a heart attack|a stroke(?! of)|co?eliac(?: disease)?|crohn'?s(?: disease)?|colitis|ibs|lupus|fibromyalgia|endometriosis|pcos|an eating disorder|anorexia|bulimia|insomnia|sleep apnea|hiv|hepatitis(?: [abc])?|long covid|chronic fatigue(?: syndrome)?|chronic pain|(?:(?:lower|upper) )?(?:back|neck|knee|hip|shoulder|joint|nerve|pelvic|leg|foot|wrist|jaw|chest) pain|an? (?:physical |learning |intellectual )?disability|disabilities|dyslexia|dyspraxia|tinnitus|allergies|hay fever|an? (?:food |nut |peanut |severe )?allergy|an? addiction|addiction|alcoholism|an? (?:drug|drinking|gambling|alcohol) problem|(?:drug|alcohol|opioid|gambling|nicotine|substance) (?:addiction|abuse|dependence|use disorder)|self[- ]harm|suicidal (?:thoughts|ideation)|suicide attempts?|a suicide attempt|attempted suicide|rape|sexual (?:assault|abuse|violence)|(?:child(?:hood)?\s+(?:sexual\s+)?|physical\s+|emotional\s+|spousal\s+|parental\s+)abuse|domestic (?:violence|abuse)|intimate partner violence|incest|(?:sex|human) trafficking|menopause|perimenopause|rehab(?=\s*(?:[.,;:!?)]|$)|\s+(?:for|in|at|after|since|last|twice)\b)|an? mental illness|mental illness|a mental health condition|kidney disease|liver disease|copd|cystic fibrosis|sickle cell(?: disease)?|cerebral palsy|down'?s syndrome|tourette'?s|an? (?:chronic |terminal |serious |rare )?illness|a (?:medical|health) condition|a miscarriage|an abortion|a disorder|high cholesterol|gout|psoriasis|eczema|an autoimmune (?:condition|disease|disorder)|autoimmune disease|a pacemaker|a stutter|a stammer|a bad back|back problems|sciatica|glaucoma|hearing loss|hypothyroidism|hyperthyroidism|a thyroid (?:condition|disorder|problem)|ana?emia|scoliosis|osteoporosis|herpes|hpv|an? (?:std|sti)|stds|stis|a (?:brain|spinal cord) injury|a traumatic brain injury|(?:an? )?tbi|a concussion|a cochlear implant|an insulin pump)(?![-\w])(?!\s+(?:startups?|company|business|apps?|clinic|research|researchers?|patients?|charity|foundation|nonprofit|awareness|advocacy|products?|software|platform|stud(?:y|ies)|trials?|ward|unit|cent(?:er|re)s?|cases?|clients?|survivors?|victims?|shelters?|hotlines?|prevention|programs?|services|law|lawyers?|attorneys?|courts?|investigations?|reports?|polic(?:y|ies)|training|detection|moderation|content|claims?|tickets?)\b)`;

const CHILDREN_OR_AGE = String.raw`(?:(?:of (?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})|in (?:his|her|their|my) (?:(?:early|mid|late)[- ])?(?:\d0'?s|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties))\s+)?`;

const PATIENT_CONDITIONS = String.raw`(?:cancer|leuka?emia|lymphoma|tumou?r|diabetes|diabetic|heart|cardiac|stroke|dialysis|chemo(?:therapy)?|transplant|kidney|renal|liver|lung|psychiatric|mental health|hiv|aids|ms|als|parkinson'?s|alzheimer'?s|dementia|lupus|copd|asthma|arthritis|migraine|epilepsy|crohn'?s|colitis|ibs|fibromyalgia|endometriosis|pcos|adhd|ptsd|ocd|bipolar|depression|anxiety|insomnia|hepatitis|long covid|(?:chronic |back |neck |joint )?pain|cystic fibrosis|sickle cell|thyroid|ivf|fertility|rehab|hospice|trauma|burn|icu|allergy|hay fever|eczema|psoriasis|gout|co?eliac)`;

const MEDICATIONS = String.raw`(?:medical (?:cannabis|marijuana)|prep(?=\s*(?:[.,;:!?)]|$)|\s+(?:to prevent|since|daily|for hiv)\b)|metformin|ozempic|wegovy|mounjaro|zepbound|semaglutide|tirzepatide|jardiance|sertraline|zoloft|fluoxetine|prozac|escitalopram|lexapro|citalopram|celexa|paroxetine|paxil|venlafaxine|effexor|duloxetine|cymbalta|bupropion|wellbutrin|mirtazapine|trazodone|lithium(?!\s+(?:batter(?:y|ies)|ion|cells?|mining|stocks?|grease))|lamotrigine|lamictal|quetiapine|seroquel|aripiprazole|abilify|risperidone|risperdal|olanzapine|zyprexa|clozapine|vyvanse|concerta|methylphenidate|dexedrine|atomoxetine|strattera|xanax|alprazolam|klonopin|clonazepam|valium|diazepam|ativan|lorazepam|gabapentin|pregabalin|lyrica|levothyroxine|synthroid|lisinopril|amlodipine|losartan|metoprolol|atorvastatin|lipitor|statins|warfarin|eliquis|xarelto|prednisone|methotrexate|humira|enbrel|truvada|descovy|biktarvy|antiretrovirals?|suboxone|buprenorphine|naltrexone|tamoxifen|letrozole|the pill)`;

const POLITICIANS = String.raw`(?:donald trump|trump|joe biden|biden|kamala harris|kamala|harris|bernie sanders|bernie|sanders|barack obama|obama|hillary clinton|hillary|clinton|ron desantis|desantis|alexandria ocasio-cortez|ocasio-cortez|aoc|rfk(?: jr)?|robert f\.? kennedy(?: jr)?|j\.?d\.? vance|vance|mike pence|pence|nikki haley|haley|elizabeth warren|pete buttigieg|buttigieg|gavin newsom|newsom|zohran mamdani|mamdani|keir starmer|starmer|rishi sunak|sunak|jeremy corbyn|corbyn|nigel farage|farage|boris johnson|narendra modi|modi|rahul gandhi|justin trudeau|trudeau|pierre poilievre|poilievre|mark carney|emmanuel macron|macron|marine le pen|le pen|benjamin netanyahu|netanyahu|jair bolsonaro|bolsonaro|lula|javier milei|milei|giorgia meloni|meloni)`;

const PARTIES = String.raw`(?:the\s+)?(?:democrats|democratic party|(?:democratic|republican|labour|conservative|green|liberal|tory) (?:candidates?|nominees?)|republicans|republican party|gop|labour party|labour(?!\s+(?:day|market|laws?|costs?|shortages?|force|intensive))|labor party|tories|tory party|conservative party|conservatives|liberal democrats|lib dems|liberal party|liberals|green party|reform uk|ukip|snp|bjp|congress party|ndp|cdu|afd|national rally|maga|socialists|communists|libertarians|progressives)`;

const HERITAGES = String.raw`(?:japanese|chinese|korean|vietnamese|thai|filipin[oa]|indian|pakistani|bangladeshi|sri lankan|nepali|african|nigerian|ghanaian|kenyan|ethiopian|somali|egyptian|moroccan|arab|lebanese|syrian|iranian|persian|turkish|kurdish|armenian|greek|italian|irish|scottish|welsh|english|french|german|dutch|polish|russian|ukrainian|jewish|mexican|cuban|puerto rican|dominican|colombian|brazilian|peruvian|argentin(?:e|ian)|chilean|venezuelan|jamaican|haitian|native american|hawaiian|samoan|maori|aboriginal|black|white|asian|latin[oa]|hispanic|caucasian)`;

const UNIONS = String.raw`(?:uaw|united auto workers|teamsters|seiu|afl-cio|ufcw|ibew|afscme|unite here|usw|united steelworkers|cwa|communications workers of america|sag-aftra|writers guild(?: of america)?|wga|actors' equity|unison|gmb|rmt|neu|nasuwt|cupe|unifor|national nurses united|united farm workers|iatse|afge|nalc|apwu|ilwu|nea|national education association|aft|american federation of teachers|unite the union|usdaw|bectu)`;

const SUBSTANCES = String.raw`(?:alcohol|booze|drugs|heroin|opioids?|opiates?|painkillers|pain pills|sleeping pills|pills|oxy(?:contin|codone)?|fentanyl|morphine|meth(?:amphetamines?)?|crystal meth|cocaine|crack|nicotine|cigarettes|smoking(?!\s+(?:meats?|brisket|ribs|bbq|barbecue|fish|salmon|cheese)\b)|vaping|weed|marijuana|cannabis|benzos|benzodiazepines|xanax|adderall|ketamine|kratom|gambling|porn|pornography|sex)`;

const SELF_OBJECT = String.raw`(?:himself|herself|themselves|themself|myself)`;

const POLITICAL_GROUPS = String.raw`(?:dsa|democratic socialists of america|nra|national rifle association|black lives matter|naacp|national association for the advancement of colou?red people|aclu|planned parenthood|sierra club|greenpeace|extinction rebellion|just stop oil|sunrise movement|tea party|proud boys|oath keepers|antifa|turning point usa|tpusa|young republicans|young democrats|college republicans|college democrats|federalist society|moveon|indivisible|aipac|j street|jewish voice for peace|students for justice in palestine|code pink|our revolution|justice democrats|log cabin republicans|lincoln project|kkk|ku klux klan|hamas|hezbollah|muslim brotherhood)`;

const POLITICAL_CAUSES = String.raw`(?:black lives matter|blm(?!\s+(?:land|lands|field|office|rangers?|grazing|permits?)\b)|the (?:black lives matter|blm|me too|#metoo) movement|#?metoo|gun control|gun rights|the second amendment|abortion(?: rights)?|reproductive rights|the right to (?:bear arms|choose)|brexit|(?:a free )?palestine(?!['\w]|\s+(?:locales?|time ?zones?|users?|customers?|markets?|regions?|offices?|teams?)\b)|palestinian (?:rights|statehood|liberation|cause)|israel(?!['\w]|\s+(?:locales?|time ?zones?|users?|customers?|markets?|regions?|offices?|teams?)\b)|zionism|same-sex marriage|marriage equality|lgbtq?\+?\s+(?:rights|equality)|gay rights|trans(?:gender)? rights|immigrant rights|immigration reform|open borders|the border wall|the death penalty|capital punishment|medicare for all|universal healthcare|single[- ]payer|defund(?:ing)? the police|police abolition|prison abolition|climate (?:action|justice)|workers' rights|labou?r rights|labou?r unions|trade unions|organi[sz]ed labou?r|socialism|communism|capitalism)`;

const ACTIVIST_CAUSES = String.raw`(?:political|pro-life|pro-choice|anti-abortion|abortion rights|reproductive rights|gun rights|gun control|anti-gun|second amendment|immigrant rights|anti-immigration|animal rights|animal welfare|human rights|women'?s rights|voting rights|anti-racist|anti-racism|lgbtq?\+?|gay rights|trans(?:gender)? rights|civil rights|black lives matter|racial justice|social justice|climate|environmental|palestine|palestinian|pro-palestinian|pro-palestine|pro-israel|israel|zionist|anti-war|peace|anti-fascist|antifa|feminist|socialist|communist|anarchist|tea party|maga|conservative|liberal|progressive|libertarian|democratic|republican)`;

const HEALTH_IDENTITY = String.raw`(?:(?:type (?:1|2|one|two) )?(?:pre-?)?diabetic(?!\s+(?:educators?|recipes?|diets?|food|meals?|snacks|desserts?|cookbooks?|supplies|socks|shoes|research)\b)|asthmatic|epileptic|autistic|bipolar(?!\s+(?:disorder\s+)?(?:research(?:ers?)?|clinics?|wards?|units?|awareness|advocates?|specialists?|educators?)\b|\s+(?:transistors?|junctions?)\b)|anorexic|bulimic|disabled(?!-)|(?:paranoid\s+)?schizophrenic(?![-\w])|manic[- ]depressive|dyslexic(?![-\w])|dyspraxic(?![-\w])|ha?emophiliac|amputee(?![-\w])(?!\s+(?:support|advocacy|care|services?|groups?|organi[sz]ations?|clinics?|charit(?:y|ies)|research|rehabilitation|coalition|community)\b)|(?:(?:heart|kidney|liver|lung|double lung|organ|bone marrow|stem cell|cornea|pancreas)\s+)?transplant recipient|adhd(?=\s+${GENDERED_PERSON}\b)|adhd-?ers?|t[12]d(?![-\w])(?!\s+(?:advocates?|research(?:ers?)?|communit(?:y|ies)|groups?|apps?|camps?)\b)|(?:legally )?(?:deaf|blind)(?=\s*(?:[.,;:!?)]|$)|\s+(?:in|since|from|and|but|who|with)\b|\s+${PERSON_NOUN}\b)|partially sighted|hard of hearing|visually impaired|hearing impaired|paraplegic|quadriplegic|immunocompromised|neurodivergent|recovering (?:alcoholic|addict)|(?:recovering\s+)?(?:drug|heroin|opioid|opiate|meth|cocaine|crack|alcohol|gambling|porn|sex|pill|painkiller|nicotine|substance)\s+addict|alcoholic(?!\s+(?:beverages?|drinks?|beers?|wines?|spirits|content|products?|brands?|ingredients?)\b)|pregnant(?!\s+pauses?\b)|infertile|chronically ill|terminally ill|mentally ill|wheelchair user|(?:[a-z-]+\s+){0,2}(?:cancer|leuka?emia|lymphoma|tumou?r|stroke|heart attack|suicide attempt|suicide|overdose|rape|sexual assault|sexual abuse|(?:child(?:hood)?\s+)?abuse|domestic (?:violence|abuse)|incest|(?:sex\s+|human\s+)?trafficking)\s+survivor|depressed|suicidal|(?:lactose|gluten|fructose) intolerant(?![-\w])|co?eliac(?![-\w])|colou?r ?blind(?![-\w])|ana?emic|hypertensive|insulin[- ]dependent)\b`;

const HEALTH_STATE = String.raw`(?:on the (?:autism )?spectrum|in recovery(?!\s+mode\b)|in (?:aa|alcoholics anonymous|narcotics anonymous|a (?:12|twelve)[- ]step program)(?!['\w]|\s+(?:advantage|miles|lounge|status|flights?|gold|platinum|executive|batter(?:y|ies))\b)|(?:drug )?addict|sober(?!\s+(?:drivers?|cab|ride|living)\b)|in remission|expecting a baby|in a wheelchair|in therapy|in rehab|on medication|on antidepressants|on insulin|on dialysis|trying to (?:conceive|get pregnant)|expecting (?:twins|triplets)|trying to quit (?:smoking|drinking|vaping|alcohol|cigarettes|nicotine))\b`;

const ETHNIC_IDENTITY = String.raw`(?:african[- ]american|asian[- ]american|hispanic|latin[oaxe]|chican[oa]|native american|american indian|indigenous|aboriginal|afro-(?:latin[oaxe]|caribbean|cuban|brazilian|colombian|american)|first nations|biracial|multiracial|mixed[- ]race|person of colou?r|pacific islander|native hawaiian|alaska native|romani?)\b(?!\s+(?:rights|studies|history|affairs|arts?|languages?|lands?|communit(?:y|ies)|peoples|issues|health|law|cuisine|food|music|literature|culture|business(?:es)?|tourism|media|market(?:ing)?|heritage month|organi[sz]ations?|groups?|clients?|customers?|students|families|founders|patients)\b)|(?:half|part|one[- ]quarter|a quarter|quarter)[- ]${HERITAGES}\b|(?:first|second|third|1st|2nd|3rd)[- ]generation\s+(?:[a-z]+[- ])?(?:american|immigrant)\b|(?:black(?!\s+(?:and|&)\s+white\b)|(?<!black and\s)(?<!black &\s)white|brown(?!\s+(?:university|student|alum|alumna|alumnus|grad|graduate)\b)|caucasian|asian|arab|south asian|east asian|southeast asian|desi|puerto rican|middle eastern|(?:${HERITAGES}|latin)[- ]american)(?:\s+(?:american|british|canadian|australian|african|european))?(?:\s+(?:${WORK_FIELD}\s+){0,2}(?:${PERSON_NOUN}|owner)\b(?!')|${CLAUSE_END})`;

const RELIGIOUS_IDENTITY = String.raw`(?:ex-|ex\s+|former\s+|recovering\s+|(?:practicing|practising|devout|observant|lapsed|non-practicing|non-practising|born-again|orthodox|reform|conservative|secular|cultural|converted)\s+)?(?:christian(?!\s+(?:bale|dior|louboutin|slater|grey|pulisic|mccaffrey|siriano)\b)|catholic|roman catholic|protestant|evangelical|baptist|methodist|lutheran|presbyterian|anglican|episcopalian|pentecostal|mormon|latter-day saint|lds|jehovah'?s witness|eastern orthodox|muslim|moslem|sunni|shia|shiite|jewish|jew|hindu|buddhist|sikh|jain|baha'?i|taoist|shintoist|pagan|wiccan|atheist|unitarian|quaker|amish|mennonite|rastafarian|zoroastrian|scientologist|pastor|priest|rabbi|imam|nun|monk|deacon|vicar|reverend|chaplain|clergyman|clergywoman|clergy member|preacher|missionary|seminarian|swami|granthi|mullah|friar|ordained minister|worship leader|church elder)\b(?!-(?:majority|minority|owned|led|run|friendly|focused|themed|style|inspired)\b)(?!(?:\s+[a-z'-]+)?\s+(?:fans?|lovers?|enthusiasts?|collectors?)\b|\s+(?:schools?|college|university|hospital|charity|charities|radio|rock|music|history|studies|art|literature|deli|food|cuisine|bakery|newspaper|magazine|publishing|publisher|bookstore)\b)`;

const RELIGIOUS_STANCE = String.raw`(?:not\s+|non-)?(?:agnostic|religious|spiritual|spiritual but not religious|a believer|a person of faith|a churchgoer|a non-?believer)${CLAUSE_END}`;

const POLITICAL_IDENTITY = String.raw`(?:(?:lifelong|registered|staunch|committed|proud|card-carrying|loyal)\s+)?(?:democrat|republican|socialist|democratic socialist|communist|marxist|libertarian|anarchist|tory(?!\s+burch\b)|leftist|left-wing|right-wing|(?:left|right) wing(?!\s+(?:for|in|on|at|position|player|forward)\b)|far-left|far-right|far left|far right|left-leaning|right-leaning|centre-left|center-left|centre-right|center-right|pro-life|pro-choice|anti-abortion|nationalist|feminist|maga|zionist|anti-zionist|non-zionist|(?:labour|lib dem|liberal democrat|green party|snp|plaid cymru|reform uk) (?:voter|supporter|member|councill?or|mp|msp|candidate|activist|organi[sz]er|campaigner|canvasser|politician|peer|minister|staffer|volunteer|delegate)|registered independent|independent voter|swing voter|brexiteer|remainer|remoaner|trumper|trumpist|anti-vaxx?er)\b`;

const POLITICAL_STANCE = String.raw`(?:(?:lifelong|registered|staunch|committed|proud|socially|fiscally|politically)\s+)?(?:liberal|conservative|progressive|centrist|moderate)(?:\s+(?:voter|democrat|republican|activist))?${CLAUSE_END}`;

const ORIENTATION_IDENTITY = String.raw`(?:openly\s+|proudly\s+)?(?:gay|lesbian|bisexual|bi(?=\s*(?:[.,;:!?)]|$)|\s+(?:${GENDERED_PERSON}|and|but|who|since)\b)|pansexual|asexual|aromantic|demisexual|queer|homosexual|lgbt(?:q(?:ia)?)?\+?)(?![-\w+])(?!\s+(?:rights|theory|studies|scholars?|scholarship|cinema|film|literature|history|bars?|clubs?|liberation|ally|allies|advocates?|organi[sz]ations?|groups?|events?|issues)\b)`;

const MALE_SELF = String.raw`(?:man|guy|male|boy|dad|father|husband|boyfriend)`;

const FEMALE_SELF = String.raw`(?:woman|lady|female|girl|mom|mum|mother|wife|girlfriend)`;

const PARTNERED_WITH = String.raw`(?:who is\s+)?(?:married to|engaged to|dating|in a relationship with|partnered with)\s+(?:an?|another)\s+`;

const SAME_GENDER_PARTNER = String.raw`${SELF_DESCRIBED}${DESCRIPTORS}(?:${MALE_SELF}\s+${PARTNERED_WITH}(?:man|guy|male)|${FEMALE_SELF}\s+${PARTNERED_WITH}(?:woman|lady|female))\b|${SELF_DESCRIBED}${DESCRIPTORS}${MALE_SELF}\b[^.;!?]{0,40}?\b(?:my|his)\s+(?:husband|boyfriend)\b|${SELF_DESCRIBED}${DESCRIPTORS}${FEMALE_SELF}\b[^.;!?]{0,40}?\b(?:my|her)\s+(?:wife|girlfriend)\b|\b(?:my|his|her|their)\s+(?:wife|husband|partner|girlfriend|boyfriend|spouse)\s+and\s+(?:i|he|she|they)\s+are\s+both\s+(?:women|men|female|male|gay|lesbians?|queer|bi(?:sexual)?)\b`;

const GENDER_IDENTITY = String.raw`(?:openly\s+)?(?:trans(?![-\w])(?!\s+(?:fats?|fatty|acids?|am|siberian|atlantic|pacific|alpine|european|national|mountain)\b)|transgender|transsexual|non-?binary|enby|genderqueer|gender ?fluid|gender-fluid|agender|bigender|two-spirit|intersex|gender non-?conforming|(?:man|woman|person) of trans experience)\b`;

const UNION_IDENTITY = String.raw`(?:(?:proud|lifelong|card-carrying)\s+)?(?:teamster|unionist|trade unionist|(?<!credit\s)(?<!student\s)(?<!european\s)(?<!soviet\s)union (?:man|woman|worker|employee|electrician|carpenter|plumber|pipefitter|ironworker|laborer|labourer|machinist|welder|bricklayer|mason|painter|stagehand|driver|nurse|teacher|tradesman|tradesperson|craftsman)|unionized (?:worker|employee|nurse|teacher|driver))\b`;

const SENSITIVE_RULES: readonly SensitiveMemoryRule[] = [
  regexRule(
    'health.condition',
    'health',
    new RegExp(`${LIVES_WITH}${HISTORY_OF}${CONDITION_SEVERITY}${HEALTH_CONDITIONS}`),
  ),
  regexRule(
    'health.state',
    'health',
    new RegExp(`${selfIdentified(HEALTH_IDENTITY)}|${selfStated(HEALTH_STATE)}`),
  ),
  regexRule(
    'health.described',
    'health',
    new RegExp(
      String.raw`${SELF_DESCRIBED}(?:(?!(?:who|that|which|whose|of|for|to|with|helping|treating|supporting|serving|teaching|working|caring)\b)[a-z0-9'-]+\s+){1,3}${CHILDREN_OR_AGE}with\s+${CONDITION_SEVERITY}${HEALTH_CONDITIONS}|${SELF_DESCRIBED}(?:[a-z0-9'-]+\s+){0,2}${PATIENT_CONDITIONS}\s+(?:patient|sufferer)(?![-\w])(?!\s+(?:advocates?|navigators?|liaisons?|coordinators?|care|support|services?|experience|portals?|records?|data|safety|education|outreach|transport|access|groups?|organi[sz]ations?)\b)`,
    ),
  ),
  regexRule(
    'health.status',
    'health',
    new RegExp(
      String.raw`${SELF_DESCRIBED}(?:hiv\+(?![\w+-])|on prep(?=\s*(?:[.,;:!?)]|$)|\s+(?:to prevent|since|daily|for hiv)\b))`,
    ),
  ),
  regexRule(
    'health.treatment',
    'health',
    new RegExp(
      String.raw`\b(?:diagnosed (?:with|as)|(?:is|am|are|was|were|been|being|got|gets)\s+prescribed|(?:takes|taking|took|on|needs|started|starting|stopped|stopping)\s+(?:(?:daily|prescription|prescribed|regular|blood pressure|cholesterol|thyroid|heart|diabetes|seizure|anxiety|depression|adhd|pain|sleep|allergy|psychiatric|mental health|hormone|fertility|hiv)\s+)?(?:medications?|meds|medicines?)|blood (?:type|group) is|(?:is|am|are|was|were|became|got|gets|getting)\s+(?:(?:currently|now|newly|recently|finally|also)\s+)?(?:(?:\d{1,2}|a few|several|one|two|three|four|five|six|seven|eight|nine)\s+(?:weeks?|months?)\s+)?pregnant|hiv[- ]?positive|(?:undergoing|underwent|has undergone)\s+(?:chemo(?:therapy)?|radiation(?: therapy)?|dialysis|surgery|treatment (?:for|of))|(?:finished|completed)\s+chemo(?:therapy)?)\b|\b(?:hospitali[sz]ed|admitted|sectioned|institutionali[sz]ed|treated)\s+(?:(?:to|in)\s+(?:a\s+|the\s+)?(?:hospital|psychiatric (?:ward|hospital|unit))\s+)?(?:for|with)\s+${CONDITION_SEVERITY}${HEALTH_CONDITIONS}`,
    ),
  ),
  regexRule(
    'health.event',
    'health',
    new RegExp(
      String.raw`${SUBJECT}\s+(?:(?:has|have|had)\s+)?(?:(?:once|previously|recently|twice|nearly|almost|also)\s+)?(?:attempted suicide|tried to (?:commit suicide|kill ${SELF_OBJECT}|take (?:his|her|their|my) (?:own )?life|end (?:his|her|their|my) (?:own )?life)|overdosed(?=\s*(?:[.,;:!?)]|$)|\s+(?:on\s+${SUBSTANCES}|last|in|twice|once)\b))|${OWNER}\s+(?:(?:previous|past|recent|first|second|last)\s+)?suicide attempts?\b|\b(?:has|have|had)\s+(?:made\s+)?(?:an?\s+|(?:one|two|three|several|multiple)\s+)?(?:(?:previous|prior|past)\s+)?suicide attempts?\b|${SUBJECT}\s+(?:(?:has|have|had|is|am|are|was|were)\s+)?(?:(?:used to|still|sometimes|often)\s+)?(?:self[- ]harm(?:s|ed|ing)?|(?:cuts|cutting) ${SELF_OBJECT}(?!\s+(?:off|some|a|slack|short|loose|free|out|down|in|up)\b))\b|${SUBJECT}\s+(?:was|were|has been|have been|had been|got)\s+(?:(?:repeatedly|once|twice)\s+)?(?:raped|molested|sexually (?:assaulted|abused)|abused as an? (?:child|kid|teen|teenager|minor)|trafficked)\b|${SUBJECT}\s+(?:is|am|are|was|were|has been|have been|had been|got|gets|became|become|becomes|is getting)\s+(?:(?:severely|badly|seriously|hopelessly|physically|still|now|once|formerly)\s+)?(?:addicted|hooked)\s+(?:to|on)\s+${SUBSTANCES}\b|\b(?:getting|got|gets|having|had|has had|scheduled|booked|considering|planning|needs?|needed|seeking|sought|underwent|undergoing|chose|choosing)\s+(?:an?\s+)?(?:(?:medical|medication|surgical|early|late-term|second)\s+)?abortion\b(?!\s+(?:rights|laws?|polic(?:y|ies)|bans?|debates?|restrictions|access|funds?|providers?)\b)|\bterminated\s+(?:a|her|their|my|the)\s+pregnancy\b|${SUBJECT}\s+(?:(?:has|have|had)\s+)?miscarried(?=\s*(?:[.,;:!?)]|$)|\s+(?:in|at|last|this|twice|once|again|early|after|during)\b)`,
    ),
  ),
  regexRule(
    'health.medication',
    'health',
    new RegExp(
      String.raw`\b(?:takes|taking|took|on|prescribed|uses|using|started|starting|stopped|stopping|injects|injecting|needs|tried|trying)\s+(?:(?:a|an|daily|weekly|nightly|low-dose|high-dose|\d+\s?(?:mg|mcg|ml|units?)(?:\s+of)?)\s+)?${MEDICATIONS}\b|\b(?:takes|taking|took|on|prescribed|uses|using)\s+(?:[a-z0-9-]+\s+){1,3}(?:for|to (?:treat|manage|control))\s+(?:(?:his|her|their|my)\s+)?${CONDITION_SEVERITY}${HEALTH_CONDITIONS}`,
    ),
  ),
  regexRule(
    'health.care',
    'health',
    /\b(?:sees|seeing|saw|visits|visiting)\s+(?:an?\s+|his\s+|her\s+|their\s+|my\s+)?(?:therapist|psychiatrist|psychologist|psychotherapist|counsell?or|oncologist|endocrinologist|rheumatologist|gastroenterologist|neurologist|cardiologist)\b|\b(?:has|have)\s+(?:an?\s+|his\s+|her\s+|their\s+|my\s+)?(?:therapist|psychiatrist|psychologist|psychotherapist|counsell?or)\b|\b(?:goes to|going to|went to|attends|attending|attended|started|starting|is in)\s+(?:therapy|counsell?ing|rehab|physiotherapy|physical therapy|(?:aa|na) meetings|aa(?=\s*(?:[.,;:!?)]|$)|\s+(?:every|on|twice|daily|weekly|since|again)\b)|alcoholics anonymous|narcotics anonymous|group therapy|couples therapy)\b|\b(?:takes|taking|uses|using|on|carries|injects|prescribed)\s+(?:an?\s+)?(?:insulin|antidepressants?|inhalers?|epipens?|anti-?anxiety (?:medication|meds)|antipsychotics?|adderall|ritalin|methadone|hormone therapy|blood thinners|birth control)\b|\b(?:allergic|allergy|allergies) to\b|\blives? in a sober living (?:house|home|facility)\b|\b(?:user's|his|her|their|my)\s+(?:mental|physical|sexual|reproductive)\s+health\b|\bmental health (?:conditions?|issues?|problems?|struggles?|diagnos[ie]s|crisis)\b|\b(?:going through|undergoing|started|starting|trying|doing|taking|takes|took|getting|gets|got|having|had|receiving|received|on|finished|completed)\s+(?:(?:his|her|their|my|a|the)\s+)?(?:(?:first|second|third|fourth|fifth|last|final|next|another|new)\s+)?(?:(?:round|cycle|course|session)s?\s+of\s+)?(?:ivf|fertility treatment|chemo(?:therapy)?|radiation therapy|radiotherapy|immunotherapy|dialysis|menopause)\b(?!\s+(?:teams?|units?|wards?|clinics?|cent(?:er|re)s?|research|nurses?|techs?|technicians?|machines?|equipment|supplies|patients?|programs?|stud(?:y|ies)|trials?|drugs?|protocols?|software|products?|departments?)\b)|\b(?:had|has had|having|is having|recovering from|scheduled for|underwent|has undergone)\s+(?:an?\s+)?(?:[a-z]+\s+)?(?:surgery|transplant|hysterectomy|mastectomy|vasectomy|c-section|ca?esarean(?: section)?)\b|\b(?:uses|using|needs)\s+(?:an?\s+)?(?:wheelchair|walker|walking stick|cpap(?: machine)?|hearing aids?|insulin pump|colostomy bag|prosthetic (?:leg|arm|limb)|feeding tube|oxygen tank)(?=\s*(?:[.,;:!?)]|$)|\s+(?:to|for|since|after|because|at|in|when|daily|every|and)\b)|\b(?:wears|wearing)\s+(?:an?\s+)?(?:hearing aids?|insulin pump|glucose monitor|cgm)(?=\s*(?:[.,;:!?)]|$)|\s+(?:to|for|since|after|because|at|in|when|daily|every|and)\b)|\b(?:user's|his|her|their|my)\s+(?:doctor|gp|physician|therapist|psychiatrist|psychologist|cardiologist|oncologist|neurologist|endocrinologist|rheumatologist|dermatologist|surgeon)\s+(?:recommended|prescribed|said|says|told|diagnosed|advised|ordered)\b/,
  ),
  regexRule(
    'ethnicity.named',
    'racial_or_ethnic_origin',
    /\b(?:user's|his|her|their|my)\s+(?:race|ethnicity|ethnic (?:background|origin|group|identity|heritage)|racial (?:background|identity))\b|\b(?:race|ethnicity) is\b|\bethnically\b/,
  ),
  regexRule(
    'ethnicity.descent',
    'racial_or_ethnic_origin',
    new RegExp(
      `${SELF_DESCRIBED}(?:of|from)\\s+(?:a\\s+)?(?:[a-z'-]+\\s+){1,2}(?:descent|ancestry|heritage|extraction|origin)\\b|\\b(?:user|i|he|she|they)\\s+(?:has|have)\\s+(?:[a-z'-]+\\s+){1,2}(?:ancestry|heritage)\\b`,
    ),
  ),
  regexRule(
    'ethnicity.identity',
    'racial_or_ethnic_origin',
    new RegExp(selfIdentified(ETHNIC_IDENTITY)),
  ),
  regexRule(
    'religion.named',
    'religious_belief',
    /\b(?:user's|his|her|their|my)\s+(?:religion|faith(?!\s+in\b)|religious (?:beliefs?|views|affiliation|background|identity|practice)|spiritual (?:beliefs?|practice))\b|\breligion is\b/,
  ),
  regexRule(
    'religion.identity',
    'religious_belief',
    new RegExp(`${selfIdentified(RELIGIOUS_IDENTITY)}|${selfStated(RELIGIOUS_STANCE)}`),
  ),
  regexRule(
    'religion.practice',
    'religious_belief',
    /\b(?:practices|practises|practicing|practising|follows|observes|converted to|convert to|converting to|converts to|reverted to|reverting to|believes in|follower of)\s+(?:the\s+)?(?:islam|judaism|christianity|catholicism|protestantism|mormonism|orthodoxy|eastern orthodoxy|hinduism|buddhism|sikhism|jainism|taoism|paganism|wicca|zoroastrianism|scientology|baha'?i(?: faith)?|(?:jewish|christian|muslim|catholic|hindu|buddhist|sikh) faith|(?:catholic|lds|mormon|orthodox) church|god|allah|jesus(?: christ)?)\b(?!(?:\s+christ)?\s+superstar\b)|\b(?:member of|part of|belongs to|joined)\s+the\s+clergy(?=\s*(?:[.,;:!?)]|$)|\s+(?:since|for|in|at|of)\b)|\b(?:goes to|go to|going to|went to|attends|attend|attending|attended)\s+(?:(?:a|the|his|her|their|my)\s+)?(?:(?:local|catholic|baptist|methodist|lutheran|presbyterian|anglican|episcopal|pentecostal|evangelical|orthodox|mormon|lds|reform|conservative|hindu|buddhist|sikh|jewish|muslim)\s+)?(?:church(?!\s+meetings?\s+for\b|\s+(?:street|road|lane)\b)|mass(?!\s+(?:events?|gatherings?|meetings?|transit|market)|\s+(?:general|ave(?:nue)?|pike|effect)\b)|mosque|synagogue|shul|temple(?!\s+(?:university|run|bar|street|grandin)\b)|gurdwara|bible study|friday prayers?|sunday school)\b|\b(?:keeps|keep|keeping|follows|follow|following|observes|observing|sticks to|eats only|only eats|eats|eating)\s+(?:an?\s+)?(?:strict(?:ly)?\s+)?(?:kosher|halal)\b|\b(?:wears?|wearing|wore)\s+(?:an?\s+|the\s+)?(?:hijab|niqab|burqa|burka|chador|kippah|kippa|yarmulke|tichel|dastar|patka)\b|\b(?:fasts|fasting|observes|keeps)\s+(?:during\s+|for\s+)?(?:ramadan|yom kippur|lent|the sabbath|shabbat)\b|\b(?:does not|doesn't|do not|don't) believe in god\b|\bprays\s+(?:five times|daily|every day|regularly)\b|\b(?:celebrates?|celebrating|observes?|observing)\s+(?:eid(?: al-(?:fitr|adha))?|diwali|hanukkah|chanukah|passover|rosh hashanah|vaisakhi|navratri)\b|\b(?:member of|belongs to|joined)\s+(?:the\s+|a\s+)?(?:lds|mormon|catholic|baptist|methodist|lutheran|presbyterian|anglican|episcopal|pentecostal|evangelical|orthodox)\s+church\b|\b(?:reads|reading|studies|studying)\s+(?:the\s+)?(?:bible|quran|koran|torah|bhagavad gita|scriptures?)\s+(?:daily|every day|every morning|every night|regularly)\b|\b(?:deacon|church elder|church warden|sunday school teacher)\s+(?:at|of|in)\s+(?:his|her|their|my|a|the)\s+(?:local\s+)?(?:church|parish|congregation)\b|\b(?:loves?|loved|likes?|adores?|praises?|thanks)\s+(?:jesus(?: christ)?|god|allah|the lord|the buddha|the prophet|prophet muhammad|hashem|jehovah)\b(?!(?:\s+christ)?\s+(?:of|bowls?|superstar)\b)|\b(?:worships?|worshipp?ed|worshipp?ing|prays?\s+to|prayed\s+to|praying\s+to)\s+(?:the\s+)?(?:jesus|god|gods|allah|lord|krishna|shiva|vishnu|ganesh|ganesha|buddha|jehovah|hashem|waheguru|goddess)\b|\bpracti[cs]ing member of (?:the|a|an)\s+(?:[a-z]+\s+){0,3}?(?:church|mosque|synagogue|temple|parish|congregation|faith|kirk)\b|\bbeliever in (?:god|jesus(?: christ)?|christ|allah|the lord|a higher power)\b|\b(?:from|born into|raised in|grew up in|comes from|come from)\s+(?:an?\s+)?(?:(?:devout|religious|observant|strict|practicing|practising)\s+)?(?:christian|catholic|protestant|evangelical|baptist|mormon|muslim|jewish|hindu|buddhist|sikh|orthodox jewish|amish|mennonite|jehovah'?s witness)\s+(?:family|household|home)\b|\b(?:loves?|likes?|enjoys?)\s+(?:praying(?!\s+mantis(?:es)?\b)|reading the (?:bible|quran|koran|torah|bhagavad gita|scriptures?))\b|\bfor religious reasons\b/,
  ),
  regexRule(
    'politics.named',
    'political_opinion',
    /\b(?:user's|his|her|their|my)\s+(?:political (?:views?|beliefs?|opinions?|leanings?|affiliation|party|stance|position|identity)|politics|voting (?:intention|preference|history))\b|\bpolitical (?:views?|beliefs?|opinions?|leanings?|affiliation) (?:is|are)\b|\bpolitically\s+(?:liberal|conservative|progressive|moderate|left|right|centrist|left-leaning|right-leaning|independent|active)\b|\b(?:liberal|conservative|progressive|left-wing|right-wing|leftist|socialist|libertarian|centrist|moderate)\s+political\s+(?:views?|beliefs?|opinions?|leanings?)\b|\bleans?\s+(?:left|right|liberal|conservative|progressive|democratic|republican)\b|\b(?:likes?|loves?|prefers?|enjoys?|hates?|dislikes?)\s+(?:conservative|liberal|progressive|left-wing|right-wing|socialist|libertarian|centrist)\s+(?:politics|politicians|candidates|values)\b/,
  ),
  regexRule(
    'politics.identity',
    'political_opinion',
    new RegExp(`${selfIdentified(POLITICAL_IDENTITY)}|${selfStated(POLITICAL_STANCE)}`),
  ),
  regexRule(
    'politics.voting',
    'political_opinion',
    /\b(?:votes?|voted|voting|will vote)\s+(?:for\s+)?(?:the\s+)?(?:democrats?|democratic party|republicans?|republican party|gop|labour(?: party)?|labor party|conservatives?|conservative party|tories|tory|liberal democrats?|lib dems?|liberals?|liberal party|greens?|green party|snp|plaid cymru|reform uk|ukip|bjp|congress party|aap|ndp|cdu|csu|spd|fdp|afd|die linke|national rally|rassemblement national|la france insoumise|psoe|morena|likud|one nation|maga)\b|\b(?:supports?|backs?|donates? to|member of|belongs to|joined|campaigns? for|volunteers? for)\s+(?:the\s+)?(?:democratic|republican|labour|labor|conservative|green|liberal|liberal democrat|socialist|communist|libertarian|reform|bharatiya janata|congress|new democratic)\s+(?:party|candidates?|campaigns?|causes|politicians)\b|\b(?:democratic|republican|labour|labor|conservative|green|liberal|liberal democrat|socialist|communist|libertarian|reform|new democratic)\s+party\s+(?:member|supporter|voter|activist|donor|volunteer|candidate)\b|\bvoted\s+(?:leave|remain)\b|\bvoted\s+(?:for|against)\s+brexit\b|\b(?:supports?|supported|opposes?|opposed|is against|is for)\s+(?:gun control|gun rights|abortion(?: rights)?|the right to (?:bear arms|choose)|brexit|palestinian (?:rights|statehood|liberation)|same-sex marriage|the death penalty|capital punishment|medicare for all)\b/,
  ),
  regexRule(
    'politics.candidate',
    'political_opinion',
    new RegExp(
      String.raw`${selfIdentified(String.raw`(?:(?:lifelong|registered|staunch|committed|proud|die-?hard|loyal|big|huge|strong|longtime|long-time|avid|vocal)\s+)*(?:${POLITICIANS}|maga|pro-trump|anti-trump)\s+(?:supporter|voter|fan|backer|loyalist|donor|volunteer|delegate)\b`)}|\b(?:votes?|voted|voting|will vote|plans to vote|campaigns?|campaigned|campaigning|volunteers?|volunteered|volunteering|canvass(?:es|ed|ing)?|donates?|donated|donating)\s+(?:for|to)\s+${POLITICIANS}\b|\b(?:supports?|supported|supporting|backs?|backed|backing|endorses?|endorsed|endorsing|loves?|loved|likes?|liked|adores?|admires?|admired|trusts?|distrusts?|dislikes?|disliked|hates?|hated|opposes?|opposed|despises?|loathes?|can't stand|cannot stand|prefers?|preferred|is an? (?:(?:big|huge|longtime|massive|great)\s+)?fan of)\s+(?:${POLITICIANS}\b(?!-|\s+(?:tweed|county|street|university|college|school|hall|park|tower|card|cards|mac)\b)|${PARTIES}(?![-\w]))|${selfIdentified(String.raw`(?:pro|anti)-(?:palestine|palestinian|israel|israeli|brexit|eu|gun|guns|immigration|trump|biden|union|abortion)\b`)}`,
    ),
  ),
  regexRule(
    'politics.movement',
    'political_opinion',
    new RegExp(
      String.raw`\b(?:member of|members of|belongs to|joined|is in|am in|donates? to|donated to|donating to|volunteers? (?:for|with)|volunteered (?:for|with)|volunteering (?:for|with)|organi[sz]es (?:for|with)|organi[sz]ed (?:for|with)|marches with|marched with|canvasses for|canvassed for|supports?|supported|supporting)\s+(?:the\s+)?(?:local\s+)?${POLITICAL_GROUPS}\b|\b${POLITICAL_GROUPS}\s+(?:member|members|membership|organi[sz]er|activist|volunteer|donor|supporter|chapter (?:member|leader|chair|president))\b|\b(?:supports?|supported|supporting|opposes?|opposed|opposing|is against|is for|backs?|backed|champions?|championed|marches|marched|marching|protests|protested|protesting|rallies|rallied|rallying|demonstrates|demonstrated|demonstrating|campaigns?|campaigned|campaigning|advocates?|advocated|advocating|fights?|fought|fighting|lobbies|lobbied|lobbying)\s+(?:(?:for|against|in support of|in favou?r of|on behalf of)\s+)?(?:the\s+)?${POLITICAL_CAUSES}|${selfIdentified(String.raw`${ACTIVIST_CAUSES}\s+(?:activist|campaigner|organi[sz]er|protester|protestor|advocate|lobbyist)\b`)}`,
    ),
  ),
  regexRule(
    'orientation.named',
    'sexual_orientation',
    /\b(?:user's|his|her|their|my)\s+(?:sexual orientation|sexuality|sex life|sexual (?:history|preferences?|partners?|activity))\b|\bsexual orientation is\b|\bsame[- ]sex (?:partner|spouse|husband|wife|relationship|marriage|couple)\b/,
  ),
  regexRule(
    'orientation.identity',
    'sexual_orientation',
    new RegExp(
      `${selfIdentified(ORIENTATION_IDENTITY)}|${selfStated(`(?:straight|heterosexual|ace)${CLAUSE_END}`)}|\\bcame out as\\s+(?:gay|lesbian|bisexual|bi|pansexual|asexual|queer)\\b|\\b(?:part of|member of|belongs to|in)\\s+the\\s+(?:lgbt(?:q(?:ia)?)?\\+?|queer)\\s+community\\b(?!\\s+(?:cent(?:er|re)s?|boards?|organi[sz]ations?|outreach|events?|programs?|groups?)\\b)|${SUBJECT}\\s+(?:came|has come|had come)\\s+out(?=\\s*(?:[.,;:!?)]|$)|\\s+(?:last|in \\d{4}|at (?:work|school|college|university|home|age)|to (?:his|her|their|my) (?:parents?|family|mom|mum|dad|mother|father|friends?|siblings?|brother|sister|kids|children|wife|husband|partner|boss|team|coworkers|colleagues))\\b)|\\bhis\\s+(?:husband|boyfriend)\\b|\\bher\\s+(?:wife|girlfriend)\\b|${SAME_GENDER_PARTNER}`,
    ),
  ),
  regexRule(
    'gender.named',
    'gender_identity',
    /\b(?:user's|his|her|their|my)\s+(?:gender identity|gender|assigned sex|sex assigned at birth)\b|\bgender identity is\b/,
  ),
  regexRule(
    'gender.identity',
    'gender_identity',
    new RegExp(
      `${selfIdentified(GENDER_IDENTITY)}|\\bcame out as\\s+(?:trans|transgender|non-?binary)\\b`,
    ),
  ),
  regexRule(
    'gender.pronouns',
    'gender_identity',
    /\bpronouns\s+(?:are|is)\s+[a-z]+\/[a-z]+|\b(?:uses?|using|goes by|prefers?)\s+[a-z]+\/[a-z]+(?:\/[a-z]+)?\s+pronouns\b/,
  ),
  regexRule(
    'gender.transition',
    'gender_identity',
    new RegExp(
      String.raw`\btransition(?:ed|ing)?\s+(?:from|to)\s+(?:male|female|a man|a woman)\b|\bgender[- ]affirming (?:care|surgery|treatment|hormones)\b|\b(?:on|takes|taking|took|uses|using|injects|injecting|prescribed|started|starting|began|stopped|stopping)\s+(?:hrt|hormone replacement therapy|testosterone|estrogen|oestrogen|estradiol|oestradiol|puberty blockers)\b(?!\s+(?:data|levels?|research|stud(?:y|ies)|tests?|readings?|measurements?)\b)|${SUBJECT}\s+(?:(?:has|have|had)\s+|(?:is|am|are|was|were)\s+|(?:started|began|recently|socially|medically)\s+)?(?:transitioned|transitioning)\b(?!\s+(?:to|from|into|out|away|between|back|over)\b|\s+(?:(?:his|her|their|my|the|a|an|our)\s+)?(?:careers?|roles?|jobs?|teams?|industries|fields?|codebases?|projects?|systems?|platforms?|services?|apps?|stacks?|positions?|companies|departments?|code|workloads?|databases?|customers?|clients?|users?)\b)|\bassigned (?:male|female) at birth\b|\b(?:amab|afab)\b`,
    ),
  ),
  regexRule(
    'union.membership',
    'trade_union_membership',
    new RegExp(
      String.raw`\bunion (?:member(?:ship)?|rep|representative|steward|organi[sz]er|official|dues|card)\b(?!\s+states?\b)|\bshop steward\b|\b(?:member of|part of|belongs to|joined|is in|organi[sz]es for|organi[sz]ing for)\s+(?:a|the|his|her|their|my)\s+(?:local\s+)?(?:(?:trade|labou?r|teachers'?|nurses'?|workers'?|teamsters|auto ?workers'?|steelworkers'?|machinists'?|electricians'?|musicians'?|writers'?|actors'?|screen actors|police|firefighters'?|transit|postal|public sector|tech workers'?)\s+)?union\b|${selfIdentified(UNION_IDENTITY)}|\b(?:member of|belongs to|joined|is in|am in|organi[sz]es for|organi[sz]ing for|represented by|pays dues to)\s+(?:the\s+)?${UNIONS}\b|\b${UNIONS}\s+(?:member|steward|rep|representative|organi[sz]er|delegate)\b|${selfStated(`unioni[sz]ed${CLAUSE_END}`)}`,
    ),
  ),
];

export function prohibitedMemoryRules(
  category?: ProhibitedMemoryCategory,
): readonly ProhibitedMemoryRule[] {
  return category === undefined ? RULES : RULES.filter((rule) => rule.category === category);
}

export function sensitiveMemoryRules(topic?: SensitiveMemoryTopic): readonly SensitiveMemoryRule[] {
  return topic === undefined
    ? SENSITIVE_RULES
    : SENSITIVE_RULES.filter((rule) => rule.category === topic);
}

const CONTRACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bi'm\b/gu, 'i am'],
  [/\bi've\b/gu, 'i have'],
  [/\bi'd(?=\s+been\b)/gu, 'i had'],
  [/\bi'd\b/gu, 'i would'],
  [/\bim(?=\s+[a-z0-9])/gu, 'i am'],
  [/\bive(?=\s+[a-z0-9])/gu, 'i have'],
  [/\b(he|she)'s(?=\s+(?:been|got|gotten|had)\b)/gu, '$1 has'],
  [/\b(he|she)'s\b/gu, '$1 is'],
  [/\bthey're\b/gu, 'they are'],
  [/\bthey've\b/gu, 'they have'],
];

const FIRST_PERSON_ADVERB = String.raw`(?:also|still|now|currently|really|usually|often|sometimes|always|never|just|recently|regularly|occasionally|actually|mostly|generally|typically|normally|personally|secretly|openly|proudly|truly|honestly|definitely|only|even|already|newly|finally|mainly|rarely|frequently|constantly|faithfully|devoutly|religiously|actively|no longer)`;

const FIRST_PERSON_PREDICATE = new RegExp(
  String.raw`\bi\s+((?:${FIRST_PERSON_ADVERB}\s+){0,2})([a-z][a-z'-]*)`,
  'gu',
);

const THIRD_PERSON_FORMS: Readonly<Record<string, string>> = {
  am: 'is',
  be: 'is',
  have: 'has',
  do: 'does',
  go: 'goes',
  "don't": "doesn't",
  "haven't": "hasn't",
};

const UNINFLECTED_VERB =
  /^(?:are|was|were|had|did|can|could|will|would|shall|should|may|might|must|cannot|[a-z'-]*[^e]ed|[a-z'-]+'t)$/u;

function thirdPersonVerb(verb: string): string {
  const form = THIRD_PERSON_FORMS[verb];
  if (form !== undefined) return form;
  if (UNINFLECTED_VERB.test(verb)) return verb;
  if (/(?:s|x|z|ch|sh|o)$/u.test(verb)) return `${verb}es`;
  if (/[^aeiou]y$/u.test(verb)) return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}

function thirdPersonReading(normalized: string): string {
  return normalized.replace(
    FIRST_PERSON_PREDICATE,
    (_predicate, adverbs: string, verb: string) => `user ${adverbs}${thirdPersonVerb(verb)}`,
  );
}

const CASED_TERMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:DREAMer|Dreamer)(s?)\b/gu, 'daca recipient$1'],
];

function normalize(content: string): string {
  let normalized = content;
  for (const [term, reading] of CASED_TERMS) {
    normalized = normalized.replace(term, reading);
  }
  normalized = normalized.toLowerCase().replace(/[\u2018\u2019]/gu, "'");
  for (const [contraction, expansion] of CONTRACTIONS) {
    normalized = normalized.replace(contraction, expansion);
  }
  return normalized.replace(/\s+/gu, ' ').trim();
}

function readings(content: string): readonly string[] {
  const normalized = normalize(content);
  const thirdPerson = thirdPersonReading(normalized);
  return thirdPerson === normalized ? [normalized] : [normalized, thirdPerson];
}

function matchedCategory<Category extends string>(
  rules: readonly MemoryContentRule<Category>[],
  content: string,
): Category | null {
  if (typeof content !== 'string' || !content.trim()) return null;
  const texts = readings(content);
  return rules.find((rule) => texts.some((text) => rule.matches(text)))?.category ?? null;
}

/**
 * The single screen a fact passes before it may become durable memory. It reads
 * a stated value, not a topic, so "User works in cardiology" stays storable.
 */
export function prohibitedMemoryCategory(content: string): ProhibitedMemoryCategory | null {
  return matchedCategory(RULES, content);
}

export function sensitiveMemoryTopic(content: string): SensitiveMemoryTopic | null {
  return matchedCategory(SENSITIVE_RULES, content);
}

const CATEGORY_SUBJECT: { readonly [K in ProhibitedMemoryCategory]: string } = {
  credential: 'a password, key or token',
  payment_instrument: 'payment card or bank account details',
  government_identifier: 'a government identity number',
  biometric: 'biometric identifiers',
  precise_location: 'a precise home or street location',
  criminal_history: 'criminal history',
  immigration_status: 'immigration status',
};

export function prohibitedMemoryMessage(category: ProhibitedMemoryCategory): string {
  return `Memory never stores ${CATEGORY_SUBJECT[category]}, so I left that out.`;
}

const TOPIC_SUBJECT: { readonly [K in SensitiveMemoryTopic]: string } = {
  health: 'health',
  racial_or_ethnic_origin: 'race or ethnicity',
  religious_belief: 'religious beliefs',
  political_opinion: 'politics',
  sexual_orientation: 'sexual orientation',
  gender_identity: 'gender identity',
  trade_union_membership: 'union membership',
};

const TOPIC_SUBJECTS = SENSITIVE_MEMORY_TOPICS.map((topic) => TOPIC_SUBJECT[topic]);

export const SENSITIVE_MEMORY_SUBJECTS = `${TOPIC_SUBJECTS.slice(0, -1).join(', ')} and ${TOPIC_SUBJECTS[TOPIC_SUBJECTS.length - 1]}`;

export function sensitiveMemoryMessage(topic: SensitiveMemoryTopic): string {
  return `Not saved, because it is about ${TOPIC_SUBJECT[topic]}. Memory keeps sensitive topics only when you say "Remember that" followed by the detail in a chat on the web, desktop, mobile or Chrome, or when Include sensitive topics in memory is on in Settings > Memory on the web or in the desktop or mobile app.`;
}
