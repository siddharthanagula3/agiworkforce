import { describe, expect, it } from 'vitest';
import {
  PROHIBITED_MEMORY_CATEGORIES,
  SENSITIVE_MEMORY_SUBJECTS,
  SENSITIVE_MEMORY_TOPICS,
  prohibitedMemoryCategory,
  prohibitedMemoryMessage,
  prohibitedMemoryRules,
  sensitiveMemoryMessage,
  sensitiveMemoryRules,
  sensitiveMemoryTopic,
  type ProhibitedMemoryCategory,
  type SensitiveMemoryTopic,
} from '../memory-content-policy';

const REFUSED: { readonly [K in ProhibitedMemoryCategory]: readonly string[] } = {
  credential: [
    `User's password is ${'correct-horse-battery'}`,
    'Remember: my api key is abcd1234efgh5678',
    `authorization: ${'a'.repeat(24)}`,
    `My GitHub token is ghp_${'a1'.repeat(18)}`,
  ],
  payment_instrument: [
    'User pays with card 4111 1111 1111 1111',
    'The CVV is 731 for that card',
    'My IBAN is GB29NWBK60161331926819',
  ],
  government_identifier: [
    'User SSN is 123-45-6789',
    'My passport number is X1234567',
    'Aadhaar number: 234512345678',
    "My driver's license is D1234567",
    'My passport is X1234567',
  ],
  biometric: [
    'User unlocks the laptop with a fingerprint',
    'Store the retina scan reference for the user',
  ],
  precise_location: [
    'User lives at 221 Baker Street',
    'User is usually at 37.774929, -122.419416',
    'I live at 5 Rue de Rivoli, Paris',
    'User lives at Hauptstraße 12',
  ],
  criminal_history: [
    'User has a criminal record',
    'User is an ex-con',
    'User was arrested in 2019',
    'User served time in prison',
    'User had a DUI last year',
    'User is a convicted felon',
    'User is a felon',
    'User did time in prison',
    'User was in prison',
    'User is on probation for a DUI',
    'User is on court-ordered probation',
    'User is a former inmate.',
    'User has a record',
    'User has a record with the police',
    'I have a record for shoplifting',
    'User was charged with assault',
    'User was charged with fraud by the SEC',
    'User is charged with assault and battery',
    'User is on parole for burglary',
    'My arrest record is sealed',
    'I did two years for robbery',
    'User did time for drug possession',
    'User served time.',
    'I have a conviction for theft',
    'User has an expunged record',
    'User was locked up for theft',
    'User spent two years in prison',
    'I spent a night in jail',
    'User served five years in a federal prison',
    'User spent five years in prison as a young man',
    'User was sentenced to 5 years of probation',
    'I was released from prison in 2019',
    'I got out of prison last year',
    'User is out of jail now',
    'User was released from custody',
    'I have a criminal background',
    'User has a sealed record',
    'User has a sealed juvenile record',
    "User's juvenile record is sealed",
    'User did time.',
    'I did time',
    "I've done time",
    'I did some time as a teenager',
    'User is doing time.',
    'I was formerly incarcerated',
    'User is formerly incarcerated',
    'User is a formerly incarcerated person',
    'I pleaded guilty to fraud',
    'User pled guilty to assault',
    'User pleaded guilty to a DUI',
    'I was found guilty of theft',
    'User was found guilty in 2019',
    'I have two DUIs',
    'User has 2 DUIs',
    'User has multiple DUIs on his record',
    'User has several arrests on her record',
    'I have a juvenile record',
    'User had a juvenile conviction',
    'I have a rap sheet',
    'User has a long rap sheet',
    "I'm on the sex offender registry",
    'User is listed on the state sex offender registry',
    'I was paroled last year',
    'User was paroled in 2021',
    "I'm out on bail",
    'User is out on bond',
    'User was released on bail',
    'I was on house arrest',
    'User is under house arrest',
    'User served six months of house arrest',
    'User was booked for assault',
    'User was booked into county jail',
    'User spent two years incarcerated',
    'User served a 5-year sentence',
    'User is on supervised release',
    'User was on death row',
    'User committed fraud.',
    'User committed tax evasion in 2015',
    'User is awaiting trial for assault',
    'User has a pending criminal case',
    'User has an outstanding warrant',
    'User has a warrant out',
    'User is wanted by the police',
    'User is a fugitive',
    'User was a drug dealer',
    'User got busted for possession',
    'User was busted for weed',
    'User was caught shoplifting',
    'User sold drugs as a teenager',
    'User deals drugs',
    'User shoplifted as a teenager',
    'User embezzled money from his employer',
    'User was sent to juvenile hall',
    'User was in a youth detention center',
  ],
  immigration_status: [
    'User is undocumented',
    "User's immigration status is pending",
    'User is on an H-1B visa',
    'User applied for asylum last spring',
    'User was deported in 2015',
    'User has a green card',
    'User is waiting for a green card',
    'User is in the US on a student visa',
    "User's work permit expires in June",
    "I'm on an H-1B",
    'User is on OPT',
    'User has an EAD',
    'User has TPS',
    'User is in the US on an F-1',
    "User's H-1B was approved",
    "User's visa expires in March",
    'I overstayed my visa',
    "I'm a naturalized citizen",
    'User is applying for citizenship',
    'User is a US permanent resident',
    'User has a pending green card application',
    'User is a refugee from Syria',
    'I came to the US illegally',
    'I crossed the border illegally',
    "I'm here illegally",
    "I'm in the country without a visa",
    'User entered the country without inspection',
    "I don't have papers",
    "I'm a DREAMer",
    'I came across the border illegally',
    'User lives here without legal status',
    "I'm facing deportation",
    'User faces deportation',
    'I am fighting deportation',
    "I'm in removal proceedings",
    'User is in deportation proceedings',
    'User has a removal order',
    'I have a deportation order',
    'I was detained by ICE',
    'User was picked up by ICE',
    'User is in ICE detention',
    'User has an ICE check-in next month',
    'User lacks legal immigration status',
    'I lack legal status',
    'User does not have legal status in the US',
    "I don't have legal status in the UK",
    'User has no legal status',
    'I have no papers',
    'User is living in the US illegally',
    "I'm living here illegally",
    'User has been staying in the country illegally',
    'User was granted asylum',
    'I was granted asylum',
    'User is a DACA holder',
    "I'm a TPS holder",
    'User is a recipient of Temporary Protected Status',
    'User is an illegal.',
    'User needs visa sponsorship',
    'I will need H-1B sponsorship',
    'User needs sponsorship to work in the US',
    'User is not authorized to work in the US',
    'I am unauthorized to work in the United States',
    'User is a Dreamer',
    'User has a Tier 2 visa',
    'User is on a B-2 visa',
    'User has indefinite leave to remain',
    'User has settled status',
    'User has pre-settled status',
    'User has an EU Blue Card',
    'User is on a bridging visa',
    "User's I-485 is pending",
    'User has a pending I-485',
    'User is a naturalized American',
    'User is a US citizen by naturalization',
    'User is an immigrant without papers',
    'User snuck into the US',
    'User is sin papeles',
  ],
};

const SENSITIVE: { readonly [K in SensitiveMemoryTopic]: readonly string[] } = {
  health: [
    'User was diagnosed with type 1 diabetes',
    'User is prescribed 20mg daily',
    "User's blood type is O negative",
    'User has type 2 diabetes',
    'User lives with chronic pain',
    'User is autistic',
    'User sees a therapist every week',
    'User is allergic to peanuts',
    'User had knee surgery in March',
    'User is a breast cancer survivor',
    'User takes sertraline for anxiety',
    'User takes metformin',
    'User is 20 weeks pregnant',
    'User was hospitalized for depression',
    'User is HIV+',
    'User is on PrEP',
    'User has high cholesterol',
    'User is lactose intolerant',
    'User is on blood pressure medication',
    'User underwent chemotherapy',
    'User uses a wheelchair',
    "User's doctor recommended a low-sodium diet",
    'User experiences panic attacks',
    'User is trying to quit smoking',
    'User is a veteran with PTSD',
    'User is a cancer patient',
    'User is a migraine sufferer',
    'I have a history of depression',
    'I have chronic back pain',
    'I have breast cancer',
    'User is a deaf developer',
    'User is sober',
    'User is a 45-year-old asthmatic runner',
    'User is a 25-year-old type 1 diabetic',
    'User is a dad who is on antidepressants.',
    'User has a brain tumor',
    'User attempted suicide last year',
    'User is a rape survivor',
    'User is a survivor of sexual assault',
    'User is a domestic violence survivor',
    'User was sexually assaulted',
    'User self-harms',
    'User is a heroin addict',
    'User is addicted to opioids',
    'User overdosed last year',
    'User has MS',
    'User is getting an abortion',
    'User is on HRT for menopause',
    'User is a schizophrenic',
    'User is a mom of two with lupus',
    'User is a guy in my 40s with depression',
    'User is a transplant recipient',
    'User is an ADHD adult',
    'User is a dyslexic designer',
    'User is an amputee',
    "I'm in AA",
    'User is a veteran with a TBI',
    'User is a new mom recovering from a C-section',
    'User is a T1D',
    'User is an ADHD-er',
    'User lives in a sober living house',
    'User is a bipolar disorder patient',
    'User is taking chemo',
    'User is on her second round of chemo',
    'User goes to AA every week',
    'User is going to NA meetings',
  ],
  racial_or_ethnic_origin: [
    "User's ethnicity is Han Chinese",
    'User is of Korean descent',
    'User has Irish ancestry',
    'User is Hispanic',
    'User is Black.',
    'User is half Japanese',
    'User is a first-generation Mexican American',
    'User is South Asian',
    'User is a Black woman in tech',
    'User is a Korean American engineer',
    'User is a 29-year-old Black woman working in tech',
    'User is the first Black engineer at the company',
    'User is a 3rd generation Mexican-American',
    'User is a Black software engineer in Atlanta',
    'User is a Black business owner',
    'User is a Desi software developer',
    'User is an Asian American product manager',
    'User is a second generation Nigerian immigrant',
    "I'm Afro-Latina",
  ],
  religious_belief: [
    "User's religion is Islam",
    'User is a practicing Catholic',
    'User is agnostic.',
    'User keeps kosher',
    'User goes to church on Sundays',
    'User loves going to mass every Sunday',
    'User wears a hijab',
    'User follows a halal diet',
    'User attends a Catholic church',
    'User celebrates Eid',
    'User is LDS',
    'User is a member of the LDS Church',
    'User is spiritual but not religious',
    'User reads the Bible daily',
    'User is a deacon at his church',
    'User loves Jesus',
    'User is an ex-Mormon',
    'User is a recovering Catholic',
    'User prays to Krishna every morning',
    'User goes to temple on Saturdays',
    'User is a devout Christian',
    'User is a dad of three and a practicing Catholic',
    'User is a software engineer and a devout Muslim',
    'User describes herself as a devout Muslim',
    'User became Catholic last year',
    'User is not religious.',
    'User is a pastor',
    'User is a rabbi',
    'User is an imam',
    'User is a priest',
    'User is a nun',
    'User is a deacon',
    'User is a convert to Islam',
    'User is a member of the clergy',
    'User is a worship leader at my church',
    'User works as a pastor at Grace Church',
    'User is a church elder',
    'User is a practising member of the Church of England',
    'User is a believer in God',
    'User is from a Muslim family',
    'User loves praying',
    'User likes reading the Quran',
    'User is a vegetarian for religious reasons',
  ],
  political_opinion: [
    "User's political views are left of centre",
    'User is a lifelong Republican',
    'User is conservative.',
    'User votes for the Green Party',
    'User is a member of the Labour Party',
    'User is a Trump supporter',
    'User is a lifelong Bernie supporter',
    'User voted for Kamala Harris',
    'User leans left',
    'User is a Conservative Party member',
    'User supports gun control',
    'User voted Leave in the Brexit referendum',
    'User is a registered independent',
    'User dislikes Trump',
    'User donates to Republican candidates',
    'User has strong progressive political views',
    'User loves Bernie',
    'User likes Obama',
    'User dislikes Republicans',
    'User loves the Labour Party',
    'User is a teacher and a proud Democrat',
    'User considers himself a progressive.',
    'User is a 60-year-old Trump voter',
    'User is socially liberal.',
    'User is a DSA member',
    'User is an NRA member',
    'User is a Zionist',
    'User supports Black Lives Matter',
    'User marched for Black Lives Matter',
    'User is a pro-choice activist',
    'User donates to Planned Parenthood',
    'User is a Labour councillor',
    'User is an animal rights activist',
    'User is a member of the NAACP',
    'User prefers Democrats',
    'User prefers the Democratic candidate',
    'User likes conservative politics',
    'User is a big fan of AOC',
    'User is a Brexiteer',
    'User is a member of the KKK',
  ],
  sexual_orientation: [
    "User's sexual orientation is bisexual",
    'User is gay',
    'User is straight.',
    'User has a same-sex partner',
    'User is part of the LGBTQ+ community',
    'User came out last year',
    'User and his husband live in Austin',
    'User is a queer artist',
    'User is a 34 year old gay man living in Austin',
    'User is a nurse and a lesbian',
    'User is a lawyer who is gay',
    'User is single and gay',
    'User is bi and married',
    'User is a man married to a man',
    'User is a woman dating a woman',
    'User is a dad to two kids with my husband',
    'My partner and I are both women',
  ],
  gender_identity: [
    "User's gender identity is female",
    'User is non-binary',
    'User transitioned to male in 2020',
    'User started testosterone last year',
    'User transitioned last year',
    'User uses they/them pronouns',
    "User's pronouns are she/her",
    'User is a 25-year-old trans woman',
    'User takes estrogen',
    'User injects testosterone weekly',
    'User is a woman of trans experience',
  ],
  trade_union_membership: [
    'User is a union member',
    'User is a member of the teachers union',
    'User is a shop steward',
    'User is a Teamster',
    'User is a member of the UAW',
    'User belongs to the Teamsters',
    'User is an SEIU member',
    'User is unionized',
    'User is part of a labor union',
    'User is a retired nurse and a Teamster',
    'User is a nurse and unionized.',
    'User is a union electrician',
  ],
};

const STORABLE = [
  'User prefers concise answers',
  'User lives in Berlin',
  'User works in cardiology at a teaching hospital',
  'User is a security engineer who reviews token handling',
  'User decided to use TypeScript for the new service',
  'User is building an app for diabetes patients',
  'User speaks German and English',
  'User is a criminal defense attorney',
  'User works in immigration law',
  'User helps students with visa applications',
  'User was charged twice for one order',
  "User's microservice is stateless",
  'User is a therapist who runs group sessions',
  'User writes about religion and politics for a newspaper',
  'User studies the Great Depression',
  'User is a white-hat security researcher',
  'User has a black belt in karate',
  'User prefers answers that are straight to the point',
  'User is a progressive web app developer',
  "User's country is in the European Union",
  'User is transitioning to a management role',
  'User is a Latin American history professor',
  'User is framework agnostic about state management',
  "User's faith in the team is high",
  'User is a refugee lawyer',
  'User is a bi-weekly newsletter writer',
  'User is from India',
  'User is a probation officer',
  'User works as a parole officer',
  'User is a criminal defense lawyer who handles criminal record expungement',
  'User works in criminal history background checks',
  'User was charged with the Q3 launch',
  'User was charged with responsibility for hiring',
  "I'm charged with fraud detection at Stripe",
  'I am charged with fraud prevention for the payments team',
  "I'm charged with harassment training for new hires",
  'User is charged with money laundering compliance at the bank',
  'I was charged with fraud prevention at my bank',
  'User is charged with assault rifle procurement',
  "I'm on parole board duty",
  'User is on parole hearing panels this year',
  'User got out of jail free in Monopoly',
  'User was released from the hospital last week',
  'User got out of the prison museum before closing',
  'User has a criminal background check scheduled',
  'My criminal background check came back clean',
  'User has a sealed record of Thriller',
  'User crossed the street illegally',
  'User came to the meeting without documents',
  "User doesn't have papers for the conference",
  "User doesn't have status in the guild",
  'User is a dreamer',
  "I'm a dreamer and a doer",
  'User is in the country without his family',
  'User served time in the army',
  'User studies sex offender rehabilitation',
  'User is an immigration paralegal who helps people who have a green card',
  'User is on probation at work',
  'User is in prison ministry',
  'I spent two years in prison ministry',
  'User spent three years in prison chaplaincy',
  'User spent six months in prison volunteering',
  'User spent a year in prison education programs',
  'User spent ten years in prison as a guard',
  'User was in a prison drama on Netflix',
  'User has a record collection',
  'Remember that I got a record from Japan',
  'I have a record from my grandfather',
  'I have a record in the 400m',
  'My daughter has a record in swimming',
  'I got a record in the mail today',
  'User has a record for the fastest lap',
  'User has been sentenced to read the whole spec',
  'User has a Visa card',
  'User is a Liverpool supporter',
  'User voted for the new logo',
  'User transitioned the team to Rust',
  'User uses lithium batteries in the robot',
  'User takes the train to work',
  'User is a Union Pacific engineer',
  'User went to the mass transit hub',
  'User loves Harris Tweed jackets',
  'User is on probation',
  "I'm on probation for the first 90 days at my new job",
  'I am on probation for six months at my new job',
  'User is on probation until March at the new company',
  "I'm a refugee coordinator at UNHCR",
  'User is waiting for a work visa decision for his employee',
  'User has an L-1 visa sponsorship job offer',
  'User needs a work permit for the festival food stall',
  'User is applying for a work permit for his nanny',
  'User got a student visa for his son',
  'User has a green card for the gym',
  'User was locked up in a meeting all day',
  'User was sentenced to two weeks of on-call duty',
  'User was jailed in Monopoly last night',
  'User is in jail in the board game',
  'User is a former inmate advocate',
  'User has a felony murder case study for class',
  'User has a DUI checkpoint app',
  'User reviews H-1B petitions for clients',
  'User has a TPS report due Friday',
  'User has OPT-in emails',
  "User's passport is from Canada",
  "User's driver's license is valid until 2030",
  'User has a pending H-1B petition for his employee',
  'User is applying for citizenship for his son',
  'User overstayed his welcome',
  'User is a US citizen',
  'The key is consistency',
  'User has F1 tickets',
  "User's Visa card expires in June",
  'User served time in the army',
  'User has a strong conviction for fairness',
  'User is a nurse who treats gout patients',
  'User is on prep duty in the kitchen',
  'User is on prep for the exam',
  'User leans toward TypeScript',
  'User dislikes Harris Tweed jackets',
  'User voted to leave early',
  'User is half asleep in the mornings',
  'User is a first-generation college student',
  'User came out of the meeting late',
  'User came out in support of the policy',
  "User's doctor friend recommended a restaurant",
  'User uses a walker script for the build',
  'User celebrates Christmas with family',
  'User is a South Asian studies professor',
  'User volunteers at the LGBTQ+ community center',
  'User has a diabetes startup',
  'User is colorblind-friendly design advocate',
  "User's pronouns are on the profile page settings",
  'User finished radiation safety training',
  'User is part of a book club',
  'User is a teacher of kids with ADHD',
  'User is a man with a plan',
  'User is a cancer patient advocate',
  'User has a history of shipping on time',
  'User is a blind reviewer for the journal',
  'User is blind to the risks',
  'User likes Buddha bowls',
  'User loves God of War',
  'User loves the Lord of the Rings',
  'User likes Jesus Christ Superstar',
  'User loves Bernie Mac',
  'User loves greens',
  'User is a Brown student',
  'User is a proud American',
  'User is an all-American athlete',
  'User attended Temple University',
  'User goes to Mass General for work',
  'User went to mass marketing class',
  'User attends church meetings for the HOA',
  'User goes to Church Street station',
  'User is a Christian Bale fan',
  'User is a Jewish deli lover',
  'User is a sober driver',
  'User is a queer theory scholar',
  'User is a gay bar owner',
  'User loves Labour Day weekends',
  'User hates labour costs',
  'User likes Obama-era architecture',
  'User is a former Christian school teacher',
  'User is a Jewish history professor',
  'User is a senior BI analyst',
  'User is a Power BI developer',
  'User is a 34 year old software engineer living in Austin',
  'User is a nurse and a mom of two',
  'User is a nurse helping gay teens',
  'User is a teacher serving Hispanic families',
  'User is building an app for gay and lesbian couples',
  'User is a mentor for Black and Latino founders',
  'User is an LGBTQ+ ally',
  'User is a coffee addict',
  'User is platform agnostic.',
  'User is an Indigenous rights lawyer',
  'User is a Tory Burch fan',
  'User is a left wing for the Bruins',
  'User is a Muslim-majority country analyst',
  'User is in recovery mode after the launch',
  'User is a disabled-access consultant',
  'User is a trans fat researcher',
  'User is an alcoholic beverage distributor',
  'User gets abuse from customers on the phone',
  'User handles abuse cases for the trust and safety team',
  'User has Ms. Lee as a mentor',
  'User got MS Office',
  "User's library supports Israel locale",
  'User is an environmental volunteer at the park',
  'User is a BLM volunteer in Nevada',
  'User is a DSA compliance lead',
  'User is an NRA-certified instructor',
  'User is a cleric main in World of Warcraft',
  'User is a Judas Priest fan',
  'User is a Thelonious Monk fan',
  'User is addicted to coffee',
  'User is hooked on smoking meats',
  'User cuts himself some slack',
  'User researches self-harm prevention',
  'User is a suicide prevention counselor',
  'User is planning a series on abortion law',
  'User terminated a contract',
  'User miscarried the delivery estimate',
  'User has brain tumor research funding',
  'User got rehab equipment for the clinic',
  'User measures estrogen levels for a study',
  'User overdosed on coffee this morning',
  'User is a member of the clergy reform task force',
  'User is a black belt teacher',
  'User is a black metal musician',
  'User is a black cat owner',
  'User is a black and white photographer',
  'User is a black and white artist',
  'User is a credit union employee',
  'User is a student union worker',
  'User is an ADHD researcher',
  'User is a mom of two kids with autism',
  'User is in AA Executive Platinum',
  'User works as a translator',
  'User works as a Christian school teacher',
  'User is a grant recipient',
  'User is a man married to a woman',
  'User is a Labour Day organizer',
  'User is a human rights lawyer',
  'User is a schizophrenia researcher',
  'User is an amputee support group organizer',
  'User is a T1D advocate',
  'User has a TBI app',
  'User is a second generation iPhone user',
  'User prefers Harris Tweed',
  'User prefers liberal arts colleges',
  'User is a big fan of Bernie Mac',
  'User grew up in a Christian school',
  'User loves praying mantis photos',
  'User studies the Muslim Brotherhood',
  'User is an Afro-American studies professor',
  'User likes centrist UI layouts',
  'User recovered from a C-suite reorg',
  'User is a sober living advocate',
  'My partner and I are both engineers',
  'My police background helps me in security consulting',
  'User is here without papers for the exam',
  'I came here without documents for my dog',
  'User moved across the country without papers',
  'User came out of the prison break escape room',
  'User works as a bipolar disorder researcher',
  'User works as a diabetic educator',
  'User is a diabetic recipe blogger',
  'User follows Jesus Christ Superstar on tour',
  'User works on the dialysis unit',
  'User is taking the chemo nurses to lunch',
  'User goes to AA lounges before flights',
  'User did time trials for the 100m',
  'User is doing time-series analysis',
  'User served time as a juror',
  'I did a lot of time thinking about it',
  'I plead guilty to eating the last cookie',
  'User found a guilty pleasure in reality TV',
  'User was found guilty of nothing in the code review',
  'User has two arrests in the plot of her crime novel',
  'User has two kids',
  'User has a juvenile records clerk job',
  'User works on bail bond software',
  'User is on the board of a bail fund',
  'User is on bond trading',
  'User is out on a bond deal',
  'User writes about house arrest in his novel',
  'User was booked for a flight to Denver',
  'User served a two-year term on the board',
  'User is on supervised release testing for the app',
  'User is facing a deadline',
  'User handles deportation cases',
  'User fights deportation cases for clients',
  'User is in deportation law',
  'User was detained at the airport by a delay',
  'User was granted tenure',
  'User was granted a patent',
  'User is a DACA advocate',
  'User is a TPS report writer',
  'User has no legal background',
  'User has no status meeting today',
  'User lacks legal knowledge',
  'User has no papers for the conference',
  'User needs visa sponsorship for his employees',
  'User handles visa sponsorship for the company',
  'User is not authorized to work on that repo',
  'User committed fraud rules to main',
  'User committed fraud detection code to the repo',
  'User committed a fix for the theft report',
  'User is on trial for the Pro plan',
  'User has outstanding questions',
  'User is wanted by recruiters',
  'User was caught in traffic',
  'User got picked up for a job interview',
  'User deals with drugs policy at the hospital',
  'User sells drugs for Pfizer',
  'User is a drug dealer character in a play',
  'User loves the Dreamer series',
  'User has a B-2 bomber model',
  'User is on I-90 every morning',
  'User snuck into the movies',
  'User is a naturalized plant enthusiast',
  'User has a pending pull request',
  'User has an H-1B employee on their team',
  'User has a green card holder on staff',
];

function normalized(content: string): string {
  return content.toLowerCase().replace(/\s+/gu, ' ').trim();
}

const FIRST_PERSON_FORMS: Readonly<Record<string, string>> = {
  is: 'am',
  has: 'have',
  was: 'was',
  does: 'do',
  goes: 'go',
};

function firstPersonVerb(verb: string): string {
  const form = FIRST_PERSON_FORMS[verb];
  if (form !== undefined) return form;
  if (/[^aeiou]ies$/u.test(verb)) return `${verb.slice(0, -3)}y`;
  if (/(?:ss|sh|ch|x|z)es$/u.test(verb)) return verb.slice(0, -2);
  return verb.replace(/s$/u, '');
}

function inTheFirstPerson(content: string): string | null {
  const match = /^User('s)? (?!and\b)(\S+)(.*)$/u.exec(content);
  if (!match) return null;
  const [, possessive, word, rest] = match;
  const firstPersonRest = rest!
    .replace(/\b(?:his|her|their)\b/gu, 'my')
    .replace(/\b(?:himself|herself|themselves)\b/gu, 'myself');
  return possessive
    ? `My ${word}${firstPersonRest}`
    : `I ${firstPersonVerb(word!)}${firstPersonRest}`;
}

function firstPersonFixtures(fixtures: readonly string[]): string[] {
  return fixtures.flatMap((content) => inTheFirstPerson(content) ?? []);
}

describe('prohibited memory content policy', () => {
  it('gives every declared category at least one rule and a message', () => {
    expect(new Set(PROHIBITED_MEMORY_CATEGORIES).size).toBe(PROHIBITED_MEMORY_CATEGORIES.length);
    for (const category of PROHIBITED_MEMORY_CATEGORIES) {
      expect(prohibitedMemoryRules(category).length).toBeGreaterThan(0);
      expect(prohibitedMemoryMessage(category)).toMatch(/Memory never stores/);
    }
    expect(prohibitedMemoryRules()).toHaveLength(
      PROHIBITED_MEMORY_CATEGORIES.reduce(
        (total, category) => total + prohibitedMemoryRules(category).length,
        0,
      ),
    );
  });

  it('refuses a stated value in every category', () => {
    for (const category of PROHIBITED_MEMORY_CATEGORIES) {
      expect(REFUSED[category].length, `${category} has no fixture`).toBeGreaterThan(0);
      for (const content of REFUSED[category]) {
        expect(prohibitedMemoryCategory(content), content).toBe(category);
      }
    }
  });

  it('gives every rule a unique id and a fixture that reaches it', () => {
    const ids = prohibitedMemoryRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of prohibitedMemoryRules()) {
      const reached = REFUSED[rule.category].some((content) => rule.matches(normalized(content)));
      expect(reached, `no fixture reaches ${rule.id}`).toBe(true);
    }
  });

  it('leaves an ordinary fact storable', () => {
    for (const content of STORABLE) {
      expect(prohibitedMemoryCategory(content), content).toBeNull();
    }
    expect(prohibitedMemoryCategory('')).toBeNull();
    expect(prohibitedMemoryCategory('   ')).toBeNull();
  });

  it('refuses the same value stated in the first person, which is how a remembered sentence arrives', () => {
    for (const category of PROHIBITED_MEMORY_CATEGORIES) {
      for (const content of firstPersonFixtures(REFUSED[category])) {
        expect(prohibitedMemoryCategory(content), content).toBe(category);
      }
    }
  });

  it('leaves an ordinary fact storable in the first person', () => {
    for (const content of firstPersonFixtures(STORABLE)) {
      expect(prohibitedMemoryCategory(content), content).toBeNull();
      expect(sensitiveMemoryTopic(content), content).toBeNull();
    }
  });

  it('refuses a card number only when the digits check out', () => {
    expect(prohibitedMemoryCategory('User card 4111 1111 1111 1111')).toBe('payment_instrument');
    expect(prohibitedMemoryCategory('User order reference 4111111111111112')).toBeNull();
  });
});

describe('sensitive memory topics', () => {
  it('gives every topic at least one rule, a subject and a refusal that names the opt-in', () => {
    expect(new Set(SENSITIVE_MEMORY_TOPICS).size).toBe(SENSITIVE_MEMORY_TOPICS.length);
    for (const topic of SENSITIVE_MEMORY_TOPICS) {
      expect(sensitiveMemoryRules(topic).length, topic).toBeGreaterThan(0);
      expect(sensitiveMemoryMessage(topic)).toContain('Include sensitive topics in memory');
    }
    expect(SENSITIVE_MEMORY_SUBJECTS).toBe(
      'health, race or ethnicity, religious beliefs, politics, sexual orientation, gender identity and union membership',
    );
  });

  it('points a refusal at the settings that carry the opt-in, on the web and in the desktop and mobile apps', () => {
    for (const topic of SENSITIVE_MEMORY_TOPICS) {
      expect(sensitiveMemoryMessage(topic)).toContain(
        'Settings > Memory on the web or in the desktop or mobile app',
      );
    }
  });

  it('names the chats where saying "Remember that" keeps a sensitive fact', () => {
    for (const topic of SENSITIVE_MEMORY_TOPICS) {
      expect(sensitiveMemoryMessage(topic)).toContain(
        '"Remember that" followed by the detail in a chat on the web, desktop, mobile or Chrome',
      );
    }
  });

  it('recognises a stated value in every topic', () => {
    for (const topic of SENSITIVE_MEMORY_TOPICS) {
      expect(SENSITIVE[topic].length, `${topic} has no fixture`).toBeGreaterThan(0);
      for (const content of SENSITIVE[topic]) {
        expect(sensitiveMemoryTopic(content), content).toBe(topic);
      }
    }
  });

  it('gives every rule a unique id and a fixture that reaches it', () => {
    const ids = sensitiveMemoryRules().map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of sensitiveMemoryRules()) {
      const reached = SENSITIVE[rule.category].some((content) => rule.matches(normalized(content)));
      expect(reached, `no fixture reaches ${rule.id}`).toBe(true);
    }
  });

  it('reads a stated value, not a topic, so professional and everyday facts stay ordinary', () => {
    for (const content of STORABLE) {
      expect(sensitiveMemoryTopic(content), content).toBeNull();
    }
    expect(sensitiveMemoryTopic('')).toBeNull();
  });

  it('keeps health under the opt-in, so a stated diagnosis or treatment is never refused outright', () => {
    expect(PROHIBITED_MEMORY_CATEGORIES).not.toContain('health');
    for (const content of [
      'User was diagnosed with type 1 diabetes',
      'User is prescribed 20mg daily',
      "User's blood type is O negative",
      'User is HIV-positive',
      'User is undergoing chemotherapy',
      'User takes medication for anxiety',
      "I'm pregnant",
    ]) {
      expect(prohibitedMemoryCategory(content), content).toBeNull();
      expect(sensitiveMemoryTopic(content), content).toBe('health');
    }
  });

  it('reads a typographic apostrophe the way it reads a straight one', () => {
    expect(sensitiveMemoryTopic('User\u2019s religion is Hindu')).toBe('religious_belief');
  });

  it('reads a first-person statement, which is how a remembered sentence arrives', () => {
    expect(sensitiveMemoryTopic("I'm a practicing Catholic")).toBe('religious_belief');
    expect(sensitiveMemoryTopic('I\u2019ve got type 1 diabetes')).toBe('health');
    expect(sensitiveMemoryTopic("She's bisexual")).toBe('sexual_orientation');
    expect(sensitiveMemoryTopic("They're non-binary")).toBe('gender_identity');
    expect(prohibitedMemoryCategory("I'm undocumented")).toBe('immigration_status');
    expect(prohibitedMemoryCategory("I'm on parole")).toBe('criminal_history');
    expect(prohibitedMemoryCategory("I've got a green card")).toBe('immigration_status');
  });

  it('recognises the same value stated in the first person', () => {
    for (const topic of SENSITIVE_MEMORY_TOPICS) {
      for (const content of firstPersonFixtures(SENSITIVE[topic])) {
        expect(sensitiveMemoryTopic(content), content).toBe(topic);
      }
    }
  });

  it('reads a first-person verb after an adverb, the way the extractor keeps the clause', () => {
    for (const [content, topic] of [
      ['I suffer from depression', 'health'],
      ['I also take Lexapro', 'health'],
      ['I still see a psychiatrist for my bipolar', 'health'],
      ['I really believe in God', 'religious_belief'],
      ['I belong to a union', 'trade_union_membership'],
      ['I no longer struggle with anxiety', 'health'],
    ] as const) {
      expect(sensitiveMemoryTopic(content), content).toBe(topic);
    }
  });

  it('reads a contraction typed without its apostrophe', () => {
    expect(sensitiveMemoryTopic('im gay')).toBe('sexual_orientation');
    expect(sensitiveMemoryTopic('Im diabetic')).toBe('health');
    expect(sensitiveMemoryTopic('ive been sober for 3 years')).toBe('health');
    expect(prohibitedMemoryCategory('im undocumented')).toBe('immigration_status');
    expect(prohibitedMemoryCategory('Im on an h1b')).toBe('immigration_status');
    expect(prohibitedMemoryCategory("I'd been in prison")).toBe('criminal_history');
    expect(prohibitedMemoryCategory("He's been arrested twice")).toBe('criminal_history');
  });
});
