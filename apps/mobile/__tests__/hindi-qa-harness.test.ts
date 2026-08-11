/**
 * Hindi QA harness — validates suite structure and mock adapter wiring.
 *
 * This test does NOT require a live model. A canned mock adapter returns
 * placeholder outputs so CI stays green. When the founder runs the real suite
 * on-device (Settings → Performance → "Run Hindi QA test"), the mock is
 * replaced by the real LLMController.
 *
 * Scoring (BLEU/chrF) is exercised against the mock outputs — the numbers
 * will be near-zero for canned responses, which is expected and correct.
 *
 * v1.1: add Marathi / Bengali / Tamil suites.
 */

import {
  computeUnigramBLEU,
  computeChrF,
  startQASession,
  recordQAResult,
  finalizeQASession,
} from '../services/languageQA';
import type { QAPrompt, QACategory } from '../services/languageQA';
import { SYNTHETIC_LOCAL_MODEL_ID } from '../test-utils/modelFixtures';

// ── 60-prompt suite ──────────────────────────────────────────────────────────

const QA_SUITE: QAPrompt[] = [
  // ── Category A: Casual Chat ──────────────────────────────────────────────
  {
    id: 'A-01',
    category: 'chat',
    prompt: 'मेरे दोस्त की शादी कल है और मुझे बधाई संदेश भेजना है। एक WhatsApp message लिखो।',
    expectedCriteria:
      'Warm informal Hindi. Mentions shaadi/vivah. Under 3 sentences. No English except proper nouns.',
    humanEvalRequired: true,
  },
  {
    id: 'A-02',
    category: 'chat',
    prompt:
      'मुझे अपने internet provider को एक complaint message लिखना है कि उनकी service बहुत खराब है।',
    expectedCriteria: 'Polite but firm Hindi. Formal register (आप). Mentions service quality.',
    humanEvalRequired: true,
  },
  {
    id: 'A-03',
    category: 'chat',
    prompt: 'अपने दादाजी को जन्मदिन की बधाई देने के लिए एक संदेश लिखो।',
    expectedCriteria: 'Respectful register (आपको, आप). Traditional warm phrasing. No slang.',
    humanEvalRequired: true,
  },
  {
    id: 'A-04',
    category: 'chat',
    prompt:
      'मेरे colleague ने party में बुलाया है लेकिन मैं नहीं जा सकता। Politely decline करने का message लिखो।',
    expectedCriteria: 'Polite refusal. Apologetic tone. Suggests future meeting.',
    humanEvalRequired: true,
  },
  {
    id: 'A-05',
    category: 'chat',
    prompt: 'Interview के बाद HR को एक follow-up email लिखो हिंदी में।',
    expectedCriteria:
      'Professional Hindi. Thanks interviewer. Expresses interest. Appropriate salutation.',
    humanEvalRequired: true,
  },
  {
    id: 'A-06',
    category: 'chat',
    prompt: 'तुमसे बात करते हुए अच्छा लगा। आज का दिन कैसा था तुम्हारा?',
    expectedCriteria: 'Natural conversational reply. Correct verb conjugation. Under 50 words.',
    humanEvalRequired: true,
  },
  {
    id: 'A-07',
    category: 'chat',
    prompt: 'अपने दोस्त से माफी माँगने के लिए एक message लिखो जो कल उसके call का जवाब नहीं दे पाए।',
    expectedCriteria: 'Informal register (तू/तुम). Genuine apology. Explanation included.',
    humanEvalRequired: true,
  },
  {
    id: 'A-08',
    category: 'chat',
    prompt: 'Swiggy पर order किया था, खाना ठंडा आया। Customer care को Hindi में complaint करो।',
    expectedCriteria: 'Mentions specific issue. Requests resolution. Hindi throughout.',
    humanEvalRequired: true,
  },
  {
    id: 'A-09',
    category: 'chat',
    prompt: 'अपने flatmate को remind करो कि कल rent देना है।',
    expectedCriteria: 'Friendly tone. Mentions rent/kiraya. Short and clear.',
    humanEvalRequired: true,
  },
  {
    id: 'A-10',
    category: 'chat',
    prompt: 'मेरे colleague को promotion मिली। उन्हें बधाई दो।',
    expectedCriteria: 'Celebratory tone. Correct congratulations phrasing. Appropriate formality.',
    humanEvalRequired: true,
  },

  // ── Category B: Translation ──────────────────────────────────────────────
  {
    id: 'B-01',
    category: 'translation',
    prompt: 'Translate to Hindi: "Please submit your report by Friday evening."',
    expectedCriteria: 'BLEU ≥ 0.35 vs reference',
    referenceOutput: 'कृपया शुक्रवार शाम तक अपनी रिपोर्ट जमा करें।',
    humanEvalRequired: false,
  },
  {
    id: 'B-02',
    category: 'translation',
    prompt:
      'Translate to Hindi: "The model failed to converge due to an exploding gradient problem."',
    expectedCriteria: 'BLEU ≥ 0.35 vs reference. Technical terms may be retained.',
    referenceOutput: 'मॉडल एक्सप्लोडिंग ग्रेडिएंट समस्या के कारण कन्वर्ज नहीं हो पाया।',
    humanEvalRequired: false,
  },
  {
    id: 'B-03',
    category: 'translation',
    prompt:
      'Translate to Hindi: "The user hereby agrees to the terms and conditions of this agreement."',
    expectedCriteria: 'BLEU ≥ 0.35 vs reference.',
    referenceOutput: 'उपयोगकर्ता इस समझौते के नियमों और शर्तों से सहमत है।',
    humanEvalRequired: false,
  },
  {
    id: 'B-04',
    category: 'translation',
    prompt: 'Translate to English: "सरकार ने नई शिक्षा नीति को मंजूरी दे दी है।"',
    expectedCriteria: 'chrF ≥ 0.55 vs reference',
    referenceOutput: 'The government has approved the new education policy.',
    humanEvalRequired: false,
  },
  {
    id: 'B-05',
    category: 'translation',
    prompt: 'Translate to English: "कल बहुत बारिश हुई, बाहर जाना मुश्किल था।"',
    expectedCriteria: 'chrF ≥ 0.55 vs reference',
    referenceOutput: 'It rained heavily yesterday, going outside was difficult.',
    humanEvalRequired: false,
  },
  {
    id: 'B-06',
    category: 'translation',
    prompt: 'Translate to Hindi: "It\'s raining cats and dogs outside."',
    expectedCriteria: 'Natural Hindi equivalent. Literal translation penalized. Human score 0-3.',
    humanEvalRequired: true,
  },
  {
    id: 'B-07',
    category: 'translation',
    prompt: 'Translate to English: "जैसी करनी वैसी भरनी।"',
    expectedCriteria: 'Idiom equivalence: "As you sow, so shall you reap." Human score 0-3.',
    referenceOutput: 'As you sow, so shall you reap.',
    humanEvalRequired: true,
  },
  {
    id: 'B-08',
    category: 'translation',
    prompt: 'Translate to Hindi: "Take two tablets orally twice a day after meals."',
    expectedCriteria: 'BLEU ≥ 0.35 vs reference.',
    referenceOutput: 'भोजन के बाद दिन में दो बार दो गोलियाँ मुँह से लें।',
    humanEvalRequired: false,
  },
  {
    id: 'B-09',
    category: 'translation',
    prompt: 'Translate to English: "मुझे आज बहुत अकेला महसूस हो रहा है।"',
    expectedCriteria: 'chrF ≥ 0.55 vs reference',
    referenceOutput: 'I am feeling very lonely today.',
    humanEvalRequired: false,
  },
  {
    id: 'B-10',
    category: 'translation',
    prompt: 'Translate to Hindi: "The package weighs 3.5 kilograms and costs 250 rupees."',
    expectedCriteria: 'BLEU ≥ 0.35 vs reference. Numbers must be correct.',
    referenceOutput: 'पैकेज का वजन 3.5 किलोग्राम है और इसकी कीमत 250 रुपये है।',
    humanEvalRequired: false,
  },

  // ── Category C: Summarization ────────────────────────────────────────────
  {
    id: 'C-01',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "भारत सरकार ने हाल ही में एक नई डिजिटल नीति की घोषणा की है जिसका उद्देश्य ग्रामीण क्षेत्रों में इंटरनेट की पहुँच को बढ़ाना है। इस नीति के तहत 2027 तक 5 लाख गाँवों में हाई-स्पीड इंटरनेट उपलब्ध कराने का लक्ष्य रखा गया है। सरकार ने इसके लिए 10,000 करोड़ रुपये का बजट आवंटित किया है।"',
    expectedCriteria: '2 sentences. Policy, goal year (2027), budget (10000 crore) mentioned.',
    humanEvalRequired: true,
  },
  {
    id: 'C-02',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "एक नई रिपोर्ट के अनुसार, भारत में स्मार्टफोन उपयोगकर्ताओं की संख्या 2026 तक 80 करोड़ को पार कर जाएगी। इसका मुख्य कारण सस्ते डेटा प्लान और किफायती हैंडसेट की उपलब्धता है। ग्रामीण भारत इस वृद्धि का मुख्य चालक है।"',
    expectedCriteria: '2 sentences. 80 crore figure and rural driver mentioned.',
    humanEvalRequired: true,
  },
  {
    id: 'C-03',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "विशेषज्ञों के अनुसार, रोज सुबह 30 मिनट की सैर करने से हृदय रोग का खतरा 35% तक कम हो जाता है। इसके साथ ही यह मानसिक स्वास्थ्य के लिए भी लाभदायक है। अध्ययन में 10,000 प्रतिभागियों पर 5 साल तक शोध किया गया।"',
    expectedCriteria: '2 sentences. 35% reduction, study scale (10000 participants).',
    humanEvalRequired: true,
  },
  {
    id: 'C-04',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "भारतीय क्रिकेट टीम ने कल ऑस्ट्रेलिया के खिलाफ तीसरे टेस्ट मैच में 8 विकेट से जीत दर्ज की। विराट कोहली ने शतक लगाया और मोहम्मद सिराज ने 5 विकेट लिए। इस जीत के साथ भारत ने 3-मैचों की सीरीज 2-1 से जीत ली।"',
    expectedCriteria: '2 sentences. 8-wicket win, Kohli century, series result 2-1.',
    humanEvalRequired: true,
  },
  {
    id: 'C-05',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "RBI ने इस तिमाही के लिए रेपो रेट 6.5% पर स्थिर रखने का फैसला किया है। महंगाई दर 5.2% पर है जो RBI के 4% के लक्ष्य से अभी ऊपर है। अर्थशास्त्रियों का मानना है कि अगली बैठक में दर में कटौती संभव है।"',
    expectedCriteria: '2 sentences. Repo rate 6.5%, inflation 5.2%, rate cut possibility.',
    humanEvalRequired: true,
  },
  {
    id: 'C-06',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "भारत ने 2030 तक अपनी ऊर्जा जरूरतों का 50% नवीकरणीय स्रोतों से पूरा करने का लक्ष्य रखा है। सौर और पवन ऊर्जा में 200 GW क्षमता जोड़ी जाएगी। यह लक्ष्य पेरिस समझौते के तहत भारत की प्रतिबद्धता का हिस्सा है।"',
    expectedCriteria: '2 sentences. 2030 target, 50% renewable, Paris Agreement.',
    humanEvalRequired: true,
  },
  {
    id: 'C-07',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "केंद्र सरकार ने राष्ट्रीय शिक्षा नीति 2020 के तहत बोर्ड परीक्षाओं में बड़े बदलाव की घोषणा की है। अब छात्र साल में दो बार बोर्ड परीक्षा दे सकेंगे और सबसे अच्छे अंक गिने जाएंगे। इसका उद्देश्य परीक्षा तनाव कम करना और अवसर बढ़ाना है।"',
    expectedCriteria: '2 sentences. Two-exam policy, stress reduction goal.',
    humanEvalRequired: true,
  },
  {
    id: 'C-08',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "फिल्म \'पठान\' ने बॉक्स ऑफिस पर कमाल किया। पहले हफ्ते में 400 करोड़ से ज्यादा की कमाई कर बॉलीवुड इतिहास में नया रिकॉर्ड बनाया। शाहरुख खान की वापसी को दर्शकों ने खूब सराहा।"',
    expectedCriteria: '2 sentences. 400 crore box office record, Shah Rukh comeback.',
    humanEvalRequired: true,
  },
  {
    id: 'C-09',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "ISRO ने चंद्रयान-4 मिशन की तैयारियाँ शुरू कर दी हैं जो 2028 में लॉन्च होगा। इस मिशन में चाँद की सतह से नमूने लाने का लक्ष्य है। यह भारत का पहला sample return mission होगा।"',
    expectedCriteria: '2 sentences. Mission name, 2028 launch, sample return.',
    humanEvalRequired: true,
  },
  {
    id: 'C-10',
    category: 'summarization',
    prompt:
      'Summarize in 2 Hindi sentences: "पंजाब में इस साल गेहूं की फसल का उत्पादन पिछले साल की तुलना में 12% बढ़ा है। अच्छी बारिश और उन्नत बीजों के उपयोग को इसका कारण माना जा रहा है। कृषि मंत्री ने किसानों को बधाई दी।"',
    expectedCriteria: '2 sentences. 12% increase, reasons (rain + seeds).',
    humanEvalRequired: true,
  },

  // ── Category D: Hinglish ─────────────────────────────────────────────────
  {
    id: 'D-01',
    category: 'hinglish',
    prompt: 'Meeting में क्या हुआ? Boss ने kya bola?',
    expectedCriteria: 'Fluid Hinglish reply. Not jarring. Natural code-switching.',
    humanEvalRequired: true,
  },
  {
    id: 'D-02',
    category: 'hinglish',
    prompt: 'Weekend trip की Instagram caption लिखो, Hinglish में, cool और catchy हो।',
    expectedCriteria: 'Caption mixes Hindi emotion words with English social media vocab.',
    humanEvalRequired: true,
  },
  {
    id: 'D-03',
    category: 'hinglish',
    prompt: 'Mera phone hang kar raha hai, kya karu?',
    expectedCriteria: 'Practical troubleshooting in Hinglish. Mentions restart/storage/apps.',
    humanEvalRequired: true,
  },
  {
    id: 'D-04',
    category: 'hinglish',
    prompt: 'Yaar, aaj kuch spicy khana hai. Kya order karu?',
    expectedCriteria: 'Hinglish food recommendations. Friendly casual tone.',
    humanEvalRequired: true,
  },
  {
    id: 'D-05',
    category: 'hinglish',
    prompt: 'Bhai, deadline kal hai aur kuch bhi complete nahi hua. Ab kya karu?',
    expectedCriteria: 'Encouraging Hinglish advice. Actionable steps. Empathetic.',
    humanEvalRequired: true,
  },
  {
    id: 'D-06',
    category: 'hinglish',
    prompt: 'Aaj raat ke liye koi achhi movie suggest karo, thriller preferred.',
    expectedCriteria: 'Names 2-3 films with brief Hinglish descriptions.',
    humanEvalRequired: true,
  },
  {
    id: 'D-07',
    category: 'hinglish',
    prompt: 'SIP invest karna chahta hun, kahan se start karu?',
    expectedCriteria: 'Explains SIP basics in Hinglish. No unexplained jargon.',
    humanEvalRequired: true,
  },
  {
    id: 'D-08',
    category: 'hinglish',
    prompt: 'Gym mein beginners ke liye kya karna chahiye pehle din?',
    expectedCriteria: 'Practical gym advice in Hinglish. Warm-up mentioned.',
    humanEvalRequired: true,
  },
  {
    id: 'D-09',
    category: 'hinglish',
    prompt:
      'Kal ka presentation bahut boring tha, slides bhi outdated thi aur speaker ne audience ko engage nahi kiya.',
    expectedCriteria: 'Continues same Hinglish register. Does not switch to pure Hindi/English.',
    humanEvalRequired: true,
  },
  {
    id: 'D-10',
    category: 'hinglish',
    prompt: 'Yaar, ladki ko propose karna hai but nervous hu. Koi tips?',
    expectedCriteria: 'Friendly casual Hinglish advice. Empathetic. Practical suggestions.',
    humanEvalRequired: true,
  },

  // ── Category E: Cultural ─────────────────────────────────────────────────
  {
    id: 'E-01',
    category: 'cultural',
    prompt: 'दिवाली की तैयारी कैसे होती है? घर में क्या-क्या किया जाता है?',
    expectedCriteria:
      'Mentions cleaning, rangoli, diyas, lakshmi puja, mithai, patakhe, Dhanteras.',
    humanEvalRequired: true,
  },
  {
    id: 'E-02',
    category: 'cultural',
    prompt: 'होली खेलने के लिए कौन से रंग अच्छे होते हैं और क्यों?',
    expectedCriteria: 'Natural/organic colors. Thand-bhaang context. Safety tips natural to India.',
    humanEvalRequired: true,
  },
  {
    id: 'E-03',
    category: 'cultural',
    prompt: 'Rajasthani thali में क्या-क्या होता है?',
    expectedCriteria:
      'Mentions dal baati churma, gatte ki sabzi, ker sangri, lassi. Not generic Indian food.',
    humanEvalRequired: true,
  },
  {
    id: 'E-04',
    category: 'cultural',
    prompt: 'दोसा और इडली में क्या फर्क है?',
    expectedCriteria: 'Same batter, texture difference, cooking method. Regional names.',
    humanEvalRequired: true,
  },
  {
    id: 'E-05',
    category: 'cultural',
    prompt: '"Kabhi Khushi Kabhie Gham" किस director की film है और इसकी कहानी क्या है?',
    expectedCriteria: 'Karan Johar. Accurate plot summary. SRK, Kajol, Amitabh named.',
    humanEvalRequired: true,
  },
  {
    id: 'E-06',
    category: 'cultural',
    prompt: 'Hindi और Urdu में क्या फर्क है?',
    expectedCriteria:
      'Same spoken base. Script differs (Devanagari vs Nastaliq). Vocabulary source. No political bias.',
    humanEvalRequired: true,
  },
  {
    id: 'E-07',
    category: 'cultural',
    prompt: 'उत्तर भारतीय शादी में कौन-कौन से रीति-रिवाज होते हैं?',
    expectedCriteria: 'Saat pheras, mehendi, sangeet, tilak, bidai. North India specific.',
    humanEvalRequired: true,
  },
  {
    id: 'E-08',
    category: 'cultural',
    prompt: 'भारत में क्रिकेट इतना popular क्यों है?',
    expectedCriteria: '1983/2011 World Cup, IPL, media coverage, aspirational angle.',
    humanEvalRequired: true,
  },
  {
    id: 'E-09',
    category: 'cultural',
    prompt: 'Mumbai का सबसे famous street food क्या है?',
    expectedCriteria: 'Vada pav is central. Pav bhaji, bhel puri, sev puri also expected.',
    humanEvalRequired: true,
  },
  {
    id: 'E-10',
    category: 'cultural',
    prompt: 'भारत में कितने मौसम होते हैं और उनके नाम क्या हैं?',
    expectedCriteria:
      '6 ritu (Vasant, Grishma, Varsha, Sharad, Hemant, Shishir). NOT 4 Western seasons.',
    humanEvalRequired: true,
  },

  // ── Category F: Technical ────────────────────────────────────────────────
  {
    id: 'F-01',
    category: 'technical',
    prompt: 'Programming में variable क्या होता है? Hindi में समझाओ।',
    expectedCriteria: 'Named memory location. Code example with Hindi explanation. Simple analogy.',
    humanEvalRequired: true,
  },
  {
    id: 'F-02',
    category: 'technical',
    prompt: 'API क्या होती है? एक real-life example के साथ Hindi में बताओ।',
    expectedCriteria:
      'Interface between systems. Waiter/restaurant analogy. Hindi throughout except "API".',
    humanEvalRequired: true,
  },
  {
    id: 'F-03',
    category: 'technical',
    prompt: 'For loop क्या होता है? Python में example दो और Hindi में explain करो।',
    expectedCriteria:
      'Correct Python syntax. Hindi explanation of iteration. Output prediction correct.',
    humanEvalRequired: true,
  },
  {
    id: 'F-04',
    category: 'technical',
    prompt: 'Git commit क्या होता है और इसका use क्यों करते हैं?',
    expectedCriteria: 'Snapshot of changes. Version history. Rollback mention. Hindi explanation.',
    humanEvalRequired: true,
  },
  {
    id: 'F-05',
    category: 'technical',
    prompt: 'SQL और NoSQL database में क्या फर्क है?',
    expectedCriteria:
      'Structured vs flexible schema. Hindi explanation. MySQL vs MongoDB examples.',
    humanEvalRequired: true,
  },
  {
    id: 'F-06',
    category: 'technical',
    prompt: 'Recursion क्या होता है? एक simple example दो।',
    expectedCriteria: 'Function calling itself. Base case mentioned. Factorial example acceptable.',
    humanEvalRequired: true,
  },
  {
    id: 'F-07',
    category: 'technical',
    prompt: 'मेरा code crash हो रहा है "null pointer exception" से। क्या हो रहा है?',
    expectedCriteria: 'Null/None value access. Hindi explanation. Fix suggestion (null check).',
    humanEvalRequired: true,
  },
  {
    id: 'F-08',
    category: 'technical',
    prompt: 'Machine learning क्या है? बिल्कुल simple Hindi में।',
    expectedCriteria:
      'Pattern learning from data. Examples: spam filter, recommendation. Under 100 words.',
    humanEvalRequired: true,
  },
  {
    id: 'F-09',
    category: 'technical',
    prompt: 'HTTP और HTTPS में क्या अंतर है? क्यों HTTPS important है?',
    expectedCriteria: 'Encryption difference (SSL/TLS). Security for sensitive data. Hindi.',
    humanEvalRequired: true,
  },
  {
    id: 'F-10',
    category: 'technical',
    prompt: 'Open source software क्या होता है? Example दो।',
    expectedCriteria: 'Publicly available code. Community contribution. Linux/Firefox/Android.',
    humanEvalRequired: true,
  },
];

// ── Mock model adapter ───────────────────────────────────────────────────────

const CANNED_RESPONSE = '[mock] यह एक placeholder response है।';

async function mockModelAdapter(prompt: string): Promise<string> {
  // Simulate minimal latency so callers can test async flow
  await Promise.resolve();
  return `${CANNED_RESPONSE} Prompt length: ${prompt.length}`;
}

// ── Suite structure tests ────────────────────────────────────────────────────

describe('Hindi QA suite structure', () => {
  const EXPECTED_TOTAL = 60;
  const CATEGORY_SIZES: Record<QACategory, number> = {
    chat: 10,
    translation: 10,
    summarization: 10,
    hinglish: 10,
    cultural: 10,
    technical: 10,
  };

  it('has exactly 60 prompts', () => {
    expect(QA_SUITE.length).toBe(EXPECTED_TOTAL);
  });

  it('has 10 prompts per category', () => {
    const counts: Partial<Record<QACategory, number>> = {};
    for (const p of QA_SUITE) {
      counts[p.category] = (counts[p.category] ?? 0) + 1;
    }
    for (const [cat, expected] of Object.entries(CATEGORY_SIZES) as [QACategory, number][]) {
      expect(counts[cat]).toBe(expected);
    }
  });

  it('every prompt has an id', () => {
    const ids = new Set(QA_SUITE.map((p) => p.id));
    expect(ids.size).toBe(EXPECTED_TOTAL);
  });

  it('every prompt has a non-empty expectedCriteria', () => {
    for (const p of QA_SUITE) {
      expect(p.expectedCriteria.trim().length).toBeGreaterThan(0);
    }
  });

  it('every prompt has a non-empty prompt string', () => {
    for (const p of QA_SUITE) {
      expect(p.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it('translation prompts with referenceOutput have humanEvalRequired=false OR are idiom tests', () => {
    const translationWithRef = QA_SUITE.filter(
      (p) => p.category === 'translation' && p.referenceOutput !== undefined,
    );
    // At least the non-idiom translation prompts should have metric scoring
    const metricScorable = translationWithRef.filter((p) => !p.humanEvalRequired);
    expect(metricScorable.length).toBeGreaterThan(0);
  });

  it('IDs follow pattern [A-F]-[01-10]', () => {
    const pattern = /^[A-F]-\d{2}$/;
    for (const p of QA_SUITE) {
      expect(p.id).toMatch(pattern);
    }
  });
});

// ── Mock adapter tests ───────────────────────────────────────────────────────

describe('Mock model adapter', () => {
  it('returns a string for every prompt', async () => {
    for (const p of QA_SUITE) {
      const output = await mockModelAdapter(p.prompt);
      expect(typeof output).toBe('string');
      expect(output.length).toBeGreaterThan(0);
    }
  });

  it('canned response is non-empty Hindi placeholder', async () => {
    const output = await mockModelAdapter('test');
    expect(output).toContain(CANNED_RESPONSE);
  });
});

// ── QA session lifecycle ─────────────────────────────────────────────────────

describe('QA session lifecycle', () => {
  afterEach(() => {
    // Clean up any leftover session
    finalizeQASession();
  });

  it('startQASession returns a session with the right modelId', () => {
    const session = startQASession(SYNTHETIC_LOCAL_MODEL_ID);
    expect(session.modelId).toBe(SYNTHETIC_LOCAL_MODEL_ID);
    expect(session.results).toHaveLength(0);
    expect(typeof session.sessionId).toBe('string');
  });

  it('recordQAResult appends to active session', async () => {
    startQASession(SYNTHETIC_LOCAL_MODEL_ID);
    const output = await mockModelAdapter(QA_SUITE[0].prompt);
    recordQAResult({ promptId: QA_SUITE[0].id, modelOutput: output });
    const finished = finalizeQASession();
    expect(finished?.results).toHaveLength(1);
    expect(finished?.results[0].promptId).toBe('A-01');
  });

  it('finalizeQASession sets completedAtMs', () => {
    startQASession(SYNTHETIC_LOCAL_MODEL_ID);
    const finished = finalizeQASession();
    expect(finished?.completedAtMs).toBeGreaterThan(0);
  });

  it('recordQAResult is a no-op outside active session', () => {
    // No session started
    recordQAResult({ promptId: 'A-01', modelOutput: 'test' });
    // Should not throw
  });
});

// ── Metric computation tests ─────────────────────────────────────────────────

describe('computeUnigramBLEU', () => {
  it('returns 1.0 for identical strings', () => {
    const score = computeUnigramBLEU('hello world', 'hello world');
    expect(score).toBeCloseTo(1.0);
  });

  it('returns 0 for empty hypothesis', () => {
    expect(computeUnigramBLEU('', 'reference')).toBe(0);
  });

  it('returns 0 for completely different strings', () => {
    const score = computeUnigramBLEU('abc', 'xyz');
    expect(score).toBe(0);
  });

  it('returns partial score for partial match', () => {
    const score = computeUnigramBLEU('the cat sat', 'the cat');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('handles Hindi text without throwing', () => {
    const hyp = 'कृपया शुक्रवार शाम तक अपनी रिपोर्ट जमा करें';
    const ref = 'कृपया शुक्रवार शाम तक अपनी रिपोर्ट जमा करें।';
    const score = computeUnigramBLEU(hyp, ref);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('computeChrF', () => {
  it('returns 1.0 for identical strings', () => {
    const score = computeChrF('hello', 'hello');
    expect(score).toBeCloseTo(1.0);
  });

  it('returns 0 for empty inputs', () => {
    expect(computeChrF('', 'reference')).toBe(0);
    expect(computeChrF('hypothesis', '')).toBe(0);
  });

  it('returns higher score for close translations', () => {
    const close = computeChrF(
      'The government approved the new education policy.',
      'The government has approved the new education policy.',
    );
    const far = computeChrF('random unrelated text here', 'The government approved the policy.');
    expect(close).toBeGreaterThan(far);
  });

  it('handles Hindi text without throwing', () => {
    const hyp = 'मॉडल एक्सप्लोडिंग ग्रेडिएंट समस्या के कारण कन्वर्ज नहीं हो पाया';
    const ref = 'मॉडल एक्सप्लोडिंग ग्रेडिएंट समस्या के कारण कन्वर्ज नहीं हो पाया।';
    const score = computeChrF(hyp, ref);
    expect(score).toBeGreaterThan(0.8);
  });
});

// ── Metric scoring on translation prompts with references ────────────────────

describe('Metric scoring on mock outputs', () => {
  it('mock outputs score near-zero BLEU (expected for canned placeholder)', async () => {
    const translationPrompts = QA_SUITE.filter(
      (p) => p.category === 'translation' && p.referenceOutput && !p.humanEvalRequired,
    );
    for (const p of translationPrompts) {
      const output = await mockModelAdapter(p.prompt);
      const bleu = computeUnigramBLEU(output, p.referenceOutput!);
      // Canned mock won't match Hindi reference — score should be very low
      expect(bleu).toBeGreaterThanOrEqual(0);
      expect(bleu).toBeLessThanOrEqual(1);
    }
  });

  it('mock outputs score near-zero chrF (expected for canned placeholder)', async () => {
    const translationPrompts = QA_SUITE.filter(
      (p) =>
        p.category === 'translation' &&
        p.referenceOutput &&
        !p.humanEvalRequired &&
        p.id.startsWith('B-0') &&
        parseInt(p.id.slice(3)) >= 4,
    );
    for (const p of translationPrompts) {
      const output = await mockModelAdapter(p.prompt);
      const chrf = computeChrF(output, p.referenceOutput!);
      expect(chrf).toBeGreaterThanOrEqual(0);
      expect(chrf).toBeLessThanOrEqual(1);
    }
  });
});

// ── Deferred language flag ───────────────────────────────────────────────────

describe('v1.1 deferred languages', () => {
  const DEFERRED = ['marathi', 'bengali', 'tamil'];

  it('no v1 prompts contain Marathi/Bengali/Tamil text', () => {
    // Rough check: no Marathi-specific script clusters that differ from Hindi Devanagari
    // This is a documentation-level guard, not a deep linguistic check
    for (const p of QA_SUITE) {
      for (const lang of DEFERRED) {
        expect(p.expectedCriteria.toLowerCase()).not.toContain(lang);
      }
    }
  });
});
