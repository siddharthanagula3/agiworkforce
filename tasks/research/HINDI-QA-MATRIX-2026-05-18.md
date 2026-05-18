# Hindi QA Matrix — Qwen3-4B-Instruct-2507

**Date:** 2026-05-18  
**Target model:** Qwen3-4B-Instruct-2507 (on-device, mobile)  
**Scope:** v1 Hindi support validation. Marathi / Bengali / Tamil deferred to v1.1.  
**Human action required:** Founder runs this suite on real device, scores outputs, sets acceptance threshold.

---

## Scoring rubric (per prompt)

| Score | Meaning                                         |
| ----- | ----------------------------------------------- |
| 0     | Completely wrong / gibberish / English fallback |
| 1     | Partially correct but major errors              |
| 2     | Acceptable with minor issues                    |
| 3     | Native-quality / correct                        |

BLEU / chrF scores apply only to translation and summarization categories.  
All other categories use 0–3 human score.

---

## Category A — Casual Chat (10 prompts)

> Goal: natural conversational Hindi, correct register, no code-switching unless prompted.

**A-01** (WhatsApp draft)

```
User: मेरे दोस्त की शादी कल है और मुझे बधाई संदेश भेजना है। एक WhatsApp message लिखो।
Expected criteria: Warm, informal Hindi. Mentions shaadi/vivah. Under 3 sentences. No English except proper nouns.
```

**A-02** (Customer service — complaint)

```
User: मुझे अपने internet provider को एक complaint message लिखना है कि उनकी service बहुत खराब है।
Expected criteria: Polite but firm Hindi. Formal register (आप). Mentions service quality issue.
```

**A-03** (Birthday wish — elder)

```
User: अपने दादाजी को जन्मदिन की बधाई देने के लिए एक संदेश लिखो।
Expected criteria: Respectful register (आपको, आप). Traditional warm phrasing. No slang.
```

**A-04** (Declining invitation politely)

```
User: मेरे colleague ने party में बुलाया है लेकिन मैं नहीं जा सकता। Politely decline करने का message लिखो।
Expected criteria: Polite refusal. Apologetic tone. Suggests future meeting.
```

**A-05** (Follow-up after interview)

```
User: Interview के बाद HR को एक follow-up email लिखो हिंदी में।
Expected criteria: Professional Hindi. Thanks interviewer. Expresses interest. Appropriate salutation.
```

**A-06** (Breaking news reaction — casual)

```
User: तुमसे बात करते हुए अच्छा लगा। आज का दिन कैसा था तुम्हारा?
Expected criteria: Natural conversational reply. Correct verb conjugation (मेरा दिन / मैंने). Under 50 words.
```

**A-07** (Apology to friend)

```
User: अपने दोस्त से माफी माँगने के लिए एक message लिखो जो कल उसके call का जवाब नहीं दे पाए।
Expected criteria: Informal register (तू/तुम). Genuine apology. Explanation included.
```

**A-08** (Food delivery complaint)

```
User: Swiggy पर order किया था, खाना ठंडा आया। Customer care को Hindi में complaint करो।
Expected criteria: Mentions specific issue (thanda khana). Requests resolution. Hindi throughout except brand name.
```

**A-09** (Reminder message)

```
User: अपने flatmate को remind करो कि कल rent देना है।
Expected criteria: Friendly tone. Mentions rent/kiraya. Short and clear.
```

**A-10** (Congratulations — promotion)

```
User: मेरे colleague को promotion मिली। उन्हें बधाई दो।
Expected criteria: Celebratory tone. Correct congratulations phrasing (बधाई हो / शुभकामनाएं). Appropriate formality for colleague.
```

---

## Category B — Translation (10 prompts)

> Goal: accurate bidirectional translation. BLEU ≥ 0.35 for EN→HI; chrF ≥ 0.55 for HI→EN back-translation.

**B-01** (EN→HI: simple sentence)

```
Source: "Please submit your report by Friday evening."
Reference: "कृपया शुक्रवार शाम तक अपनी रिपोर्ट जमा करें।"
Metric: BLEU vs reference
```

**B-02** (EN→HI: technical)

```
Source: "The model failed to converge due to an exploding gradient problem."
Reference: "मॉडल एक्सप्लोडिंग ग्रेडिएंट समस्या के कारण कन्वर्ज नहीं हो पाया।"
Metric: BLEU vs reference (technical terms may be retained in English)
```

**B-03** (EN→HI: legal/formal)

```
Source: "The user hereby agrees to the terms and conditions of this agreement."
Reference: "उपयोगकर्ता इस समझौते के नियमों और शर्तों से सहमत है।"
Metric: BLEU vs reference
```

**B-04** (HI→EN: news sentence)

```
Source: "सरकार ने नई शिक्षा नीति को मंजूरी दे दी है।"
Reference: "The government has approved the new education policy."
Metric: chrF vs reference
```

**B-05** (HI→EN: casual)

```
Source: "कल बहुत बारिश हुई, बाहर जाना मुश्किल था।"
Reference: "It rained heavily yesterday, going outside was difficult."
Metric: chrF vs reference
```

**B-06** (EN→HI: idiom)

```
Source: "It's raining cats and dogs outside."
Expected: Natural Hindi equivalent (मूसलाधार बारिश हो रही है or similar). Literal translation penalized.
Metric: Human score 0–3
```

**B-07** (HI→EN: proverb)

```
Source: "जैसी करनी वैसी भरनी।"
Expected: "As you sow, so shall you reap." or equivalent.
Metric: Human score 0–3 (idiom equivalence)
```

**B-08** (EN→HI: medical instruction)

```
Source: "Take two tablets orally twice a day after meals."
Reference: "भोजन के बाद दिन में दो बार दो गोलियाँ मुँह से लें।"
Metric: BLEU vs reference
```

**B-09** (HI→EN: emotional)

```
Source: "मुझे आज बहुत अकेला महसूस हो रहा है।"
Reference: "I am feeling very lonely today."
Metric: chrF vs reference
```

**B-10** (EN→HI: numbers + units)

```
Source: "The package weighs 3.5 kilograms and costs 250 rupees."
Reference: "पैकेज का वजन 3.5 किलोग्राम है और इसकी कीमत 250 रुपये है।"
Metric: BLEU vs reference (numbers must be correct)
```

---

## Category C — Summarization (10 prompts)

> Goal: 2-sentence Hindi summary. Captures main idea, discards filler. BLEU ≥ 0.25 vs human reference.

**C-01** (News — politics)

```
Article: "भारत सरकार ने हाल ही में एक नई डिजिटल नीति की घोषणा की है जिसका उद्देश्य ग्रामीण क्षेत्रों में इंटरनेट की पहुँच को बढ़ाना है। इस नीति के तहत 2027 तक 5 लाख गाँवों में हाई-स्पीड इंटरनेट उपलब्ध कराने का लक्ष्य रखा गया है। सरकार ने इसके लिए 10,000 करोड़ रुपये का बजट आवंटित किया है।"
Expected: 2-sentence summary capturing the policy, goal year, and budget.
```

**C-02** (Tech news)

```
Article: "एक नई रिपोर्ट के अनुसार, भारत में स्मार्टफोन उपयोगकर्ताओं की संख्या 2026 तक 80 करोड़ को पार कर जाएगी। इसका मुख्य कारण सस्ते डेटा प्लान और किफायती हैंडसेट की उपलब्धता है। ग्रामीण भारत इस वृद्धि का मुख्य चालक है।"
Expected: 2-sentence summary. Mention growth figure and rural driver.
```

**C-03** (Health article)

```
Article: "विशेषज्ञों के अनुसार, रोज सुबह 30 मिनट की सैर करने से हृदय रोग का खतरा 35% तक कम हो जाता है। इसके साथ ही यह मानसिक स्वास्थ्य के लिए भी लाभदायक है। अध्ययन में 10,000 प्रतिभागियों पर 5 साल तक शोध किया गया।"
Expected: Captures health benefit, percentage, and study scale in 2 sentences.
```

**C-04** (Sports)

```
Article: "भारतीय क्रिकेट टीम ने कल ऑस्ट्रेलिया के खिलाफ तीसरे टेस्ट मैच में 8 विकेट से जीत दर्ज की। विराट कोहली ने शतक लगाया और मोहम्मद सिराज ने 5 विकेट लिए। इस जीत के साथ भारत ने 3-मैचों की सीरीज 2-1 से जीत ली।"
Expected: 2-sentence summary. Mention win margin, Kohli century, series result.
```

**C-05** (Economy)

```
Article: "RBI ने इस तिमाही के लिए रेपो रेट 6.5% पर स्थिर रखने का फैसला किया है। महंगाई दर 5.2% पर है जो RBI के 4% के लक्ष्य से अभी ऊपर है। अर्थशास्त्रियों का मानना है कि अगली बैठक में दर में कटौती संभव है।"
Expected: Mentions repo rate, inflation figure, and future rate cut possibility.
```

**C-06** (Environment)

```
Article: "भारत ने 2030 तक अपनी ऊर्जा जरूरतों का 50% नवीकरणीय स्रोतों से पूरा करने का लक्ष्य रखा है। सौर और पवन ऊर्जा में 200 GW क्षमता जोड़ी जाएगी। यह लक्ष्य पेरिस समझौते के तहत भारत की प्रतिबद्धता का हिस्सा है।"
Expected: 2-sentence summary. Target year, energy mix goal, Paris Agreement mention.
```

**C-07** (Education)

```
Article: "केंद्र सरकार ने राष्ट्रीय शिक्षा नीति 2020 के तहत बोर्ड परीक्षाओं में बड़े बदलाव की घोषणा की है। अब छात्र साल में दो बार बोर्ड परीक्षा दे सकेंगे और सबसे अच्छे अंक गिने जाएंगे। इसका उद्देश्य परीक्षा तनाव कम करना और अवसर बढ़ाना है।"
Expected: 2-sentence summary. Two-exam policy, stress reduction goal.
```

**C-08** (Entertainment — movie review snippet)

```
Article: "फिल्म 'पठान' ने बॉक्स ऑफिस पर कमाल किया। पहले हफ्ते में 400 करोड़ से ज्यादा की कमाई कर बॉलीवुड इतिहास में नया रिकॉर्ड बनाया। शाहरुख खान की वापसी को दर्शकों ने खूब सराहा।"
Expected: Captures box office record and Shah Rukh Khan's comeback.
```

**C-09** (Science)

```
Article: "ISRO ने चंद्रयान-4 मिशन की तैयारियाँ शुरू कर दी हैं जो 2028 में लॉन्च होगा। इस मिशन में चाँद की सतह से नमूने लाने का लक्ष्य है। यह भारत का पहला sample return mission होगा।"
Expected: Mission name, launch year, sample return objective.
```

**C-10** (Agriculture)

```
Article: "पंजाब में इस साल गेहूं की फसल का उत्पादन पिछले साल की तुलना में 12% बढ़ा है। अच्छी बारिश और उन्नत बीजों के उपयोग को इसका कारण माना जा रहा है। कृषि मंत्री ने किसानों को बधाई दी।"
Expected: 12% increase, reasons (rain + seeds), minister congratulation.
```

---

## Category D — Hinglish / Code-switching (10 prompts)

> Goal: natural Hinglish output matching Indian urban speech patterns. Human score 0–3.

**D-01** (Tech startup culture)

```
User: Meeting में क्या हुआ? Boss ने kya bola?
Expected: Fluid Hinglish reply mixing Hindi grammar with English nouns/verbs naturally. Not jarring.
```

**D-02** (Social media caption)

```
User: Weekend trip की Instagram caption लिखो, Hinglish में, cool और catchy हो।
Expected: Caption mixes Hindi emotion words with English social media vocabulary. Uses relevant emojis mention only (model should not output emojis unless asked, but caption context = allowed).
```

**D-03** (Tech help — Hinglish)

```
User: Mera phone hang kar raha hai, kya karu?
Expected: Practical troubleshooting advice. Hinglish throughout. Mentions restart, storage, apps naturally.
```

**D-04** (Food order — restaurant)

```
User: Yaar, aaj kuch spicy khana hai. Kya order karu?
Expected: Hinglish food recommendations. Mix of Hindi/English food terms. Friendly casual tone.
```

**D-05** (Deadline panic)

```
User: Bhai, deadline kal hai aur kuch bhi complete nahi hua. Ab kya karu?
Expected: Encouraging Hinglish advice. Actionable steps. Empathetic tone.
```

**D-06** (Movie recommendation)

```
User: Aaj raat ke liye koi achhi movie suggest karo, thriller preferred.
Expected: Names 2-3 actual films with brief Hinglish descriptions. Mix of Hindi and Hollywood.
```

**D-07** (Finance — Hinglish)

```
User: SIP invest karna chahta hun, kahan se start karu?
Expected: Explains SIP/mutual fund basics in Hinglish. No technical jargon without explanation.
```

**D-08** (Health — Hinglish gym culture)

```
User: Gym mein beginners ke liye kya karna chahiye pehle din?
Expected: Practical gym advice in Hinglish. Warm-up, compound movements mentioned.
```

**D-09** (Code-switching mid-sentence)

```
User: Kal ka presentation bahut boring tha, slides bhi outdated thi aur speaker ne audience ko engage nahi kiya.
Expected: Model responds continuing the same Hinglish register naturally. Does not switch to pure Hindi or pure English.
```

**D-10** (Relationship advice — Hinglish)

```
User: Yaar, ladki ko propose karna hai but nervous hu. Koi tips?
Expected: Friendly, casual Hinglish advice. Empathetic. Practical suggestions.
```

---

## Category E — Cultural knowledge (10 prompts)

> Goal: accurate cultural context, regional nuance, no Western-centric errors. Human score 0–3.

**E-01** (Festival — Diwali)

```
User: दिवाली की तैयारी कैसे होती है? घर में क्या-क्या किया जाता है?
Expected: Accurate: cleaning, rangoli, diyas, lakshmi puja, mithai, patakhe. Mentions Dhanteras.
```

**E-02** (Festival — Holi)

```
User: होली खेलने के लिए कौन से रंग अच्छे होते हैं और क्यों?
Expected: Natural/organic colors mentioned. Thand-bhaang cultural context. Safety tips natural to Indian context.
```

**E-03** (Food — regional)

```
User: Rajasthani thali में क्या-क्या होता है?
Expected: Mentions dal baati churma, gatte ki sabzi, ker sangri, lassi. No generic Indian food list.
```

**E-04** (Food — South Indian in Hindi)

```
User: दोसा और इडली में क्या फर्क है?
Expected: Accurate: batter (same), texture difference, cooking method. Regional names acknowledged.
```

**E-05** (Bollywood reference)

```
User: "Kabhi Khushi Kabhie Gham" किस director की film है और इसकी कहानी क्या है?
Expected: Karan Johar. Accurate plot summary. Main cast named correctly (SRK, Kajol, Amitabh).
```

**E-06** (Regional language awareness)

```
User: Hindi और Urdu में क्या फर्क है?
Expected: Accurate: same spoken base, script differs (Devanagari vs Nastaliq), vocabulary source differs (Sanskrit vs Persian/Arabic). No political bias.
```

**E-07** (Wedding customs)

```
User: उत्तर भारतीय शादी में कौन-कौन से रीति-रिवाज होते हैं?
Expected: Mentions saat pheras, mehendi, sangeet, tilak, bidai. Regionally specific to North India.
```

**E-08** (Cricket culture)

```
User: भारत में क्रिकेट इतना popular क्यों है?
Expected: Mentions 1983/2011 World Cup moments, IPL, media coverage, aspirational angle. Culturally grounded.
```

**E-09** (Street food — Mumbai)

```
User: Mumbai का सबसे famous street food क्या है?
Expected: Vada pav is central. Pav bhaji, bhel puri, sev puri also expected. Local context (Dharavi, Juhu) optional bonus.
```

**E-10** (Seasons — Indian calendar)

```
User: भारत में कितने मौसम होते हैं और उनके नाम क्या हैं?
Expected: 6 ritu (Ritu system): Vasant, Grishma, Varsha, Sharad, Hemant, Shishir — not just 4 Western seasons. This is a cultural accuracy test.
```

---

## Category F — Technical / coding explanation in Hindi (10 prompts)

> Goal: accurate technical explanation in Hindi. Jargon acceptable in English when no Hindi equivalent exists. Human score 0–3.

**F-01** (What is a variable)

```
User: Programming में variable क्या होता है? Hindi में समझाओ।
Expected: Correct definition (named memory location). Example in code with Hindi explanation. Simple analogy.
```

**F-02** (What is an API)

```
User: API क्या होती है? एक real-life example के साथ Hindi में बताओ।
Expected: Correct: interface between systems. Waiter/restaurant analogy or similar. Hindi throughout except "API".
```

**F-03** (For loop explanation)

```
User: For loop क्या होता है? Python में example दो और Hindi में explain करो।
Expected: Correct Python syntax. Hindi explanation of iteration concept. Output prediction correct.
```

**F-04** (Git commit explanation)

```
User: Git commit क्या होता है और इसका use क्यों करते हैं?
Expected: Snapshot of changes. Version history. Rollback mention. Hindi explanation, git commands in English.
```

**F-05** (Database — simple)

```
User: SQL और NoSQL database में क्या फर्क है?
Expected: Structured vs flexible schema. Hindi explanation. Examples: MySQL vs MongoDB.
```

**F-06** (What is recursion)

```
User: Recursion क्या होता है? एक simple example दो।
Expected: Function calling itself. Base case mentioned. Hindi explanation. Factorial example acceptable.
```

**F-07** (Explain a bug)

```
User: मेरा code crash हो रहा है "null pointer exception" से। क्या हो रहा है?
Expected: Null/None value access. Hindi explanation. Fix suggestion (null check). Language-agnostic explanation.
```

**F-08** (What is machine learning — simple)

```
User: Machine learning क्या है? बिल्कुल simple Hindi में।
Expected: Pattern learning from data. Examples: spam filter, recommendation. No heavy math. Under 100 words.
```

**F-09** (HTTP vs HTTPS)

```
User: HTTP और HTTPS में क्या अंतर है? क्यों HTTPS important है?
Expected: Encryption difference (SSL/TLS). Security for sensitive data. Hindi explanation.
```

**F-10** (What is open source)

```
User: Open source software क्या होता है? Example दो।
Expected: Publicly available code. Community contribution. Examples: Linux, Firefox, Android. Hindi explanation.
```

---

## Scoring sheet (founder fills in)

| ID                | Category | Human Score (0-3) | BLEU/chrF | Notes |
| ----------------- | -------- | ----------------- | --------- | ----- |
| A-01 through F-10 |          |                   |           |       |

**Acceptance threshold (founder defines):** **_  
**Minimum per category:** _**  
**Fallback decision:** If overall score < threshold → use **\_** (Apple Translate / Llama 3.2 3B / Gemma 3n)

---

## v1.1 deferred languages

- Marathi
- Bengali
- Tamil

These require separate prompt suites and model evaluation. Not in scope for v1 Hindi launch.
