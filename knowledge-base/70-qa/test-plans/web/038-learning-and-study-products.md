---
id: "PLAN-web-038"
type: "test-plan"
title: "Web · 38. Learning and study products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "38"
---
# Web · 38. Learning and study products

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S38.01 Study-mode entry.

- **Expected:** A Study entry point starts a tutoring session that changes how the model teaches.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Earlier check in the running app:** FAIL: E053 [FAIL; Study setup opens, but Start studying fails to create the session]: Entered Browser QA: adding small integers, selected Practise and Some background, Start studying immediately returned The study conversation could not be created. No session created.
- **Where to find it:** Sidebar > Study > Start studying (labels found in the code)
- **Needs:** a Free account or a paid account (none special)
- **Steps:**
  1. Sign in and click Study in the sidebar.
  2. On the Study page, type a subject in the field 'What are you studying?' (for example: eigenvalues).
  3. Leave How set to 'Learn it' and click 'Start studying'.
  4. Look at whether a new chat opens at /chat/<id> with the study tutoring started, and compare with Expected.

## S38.02 Learning-goal setup.

- **Expected:** The user states what they want to learn before a session starts.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E053 [PASS; Study setup form accepts goal/topic/background; session creation separately fails]: Entered Browser QA: adding small integers, selected Practise and Some background, Start studying immediately returned The study conversation could not be created. No session created.
- **Where to find it:** Sidebar > Study > What are you studying? (labels found in the code)
- **Steps:**
  1. Sign in and click Study in the sidebar.
  2. Click the field 'What are you studying?' and type a learning goal or topic (for example: photosynthesis).
  3. Check that 'Start studying' stays disabled while the field is empty and becomes enabled once text is typed.
  4. Compare the form with Expected: the user has stated the topic before the session starts.

## S38.03 Subject selection.

- **Expected:** The user picks the subject to study.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E053 [PASS; Study setup form accepts goal/topic/background; session creation separately fails]: Entered Browser QA: adding small integers, selected Practise and Some background, Start studying immediately returned The study conversation could not be created. No session created.
- **Where to find it:** Sidebar > Study > What are you studying? (labels found in the code)
- **Needs:** none (a project is needed to see the 'Course material' drop-down)
- **Steps:**
  1. Sign in and click Study in the sidebar.
  2. Click the field 'What are you studying?' and type the subject (for example: German dative case).
  3. Optionally open the 'Course material' drop-down (shown only when the account has projects) and choose 'From project: <name>' or 'None'.
  4. Compare with Expected: the user has picked the subject to study and it appears in the session title after starting.

## S38.04 Level or background selection.

- **Expected:** The user sets their level or background and the tutor adapts to it.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E053 [PASS; Study setup form accepts goal/topic/background; session creation separately fails]: Entered Browser QA: adding small integers, selected Practise and Some background, Start studying immediately returned The study conversation could not be created. No session created.
- **Where to find it:** Sidebar > Study > Where you are with it (labels found in the code)
- **Steps:**
  1. Sign in and click Study in the sidebar.
  2. Open the drop-down 'Where you are with it' and choose 'Some background' (other choices: 'New to it', 'Know it well').
  3. Type a topic, leave How as 'Learn it', and click 'Start studying'.
  4. In the new chat, ask a basic question and compare the tutor's explanation depth with Expected: it should adapt to the chosen level.
