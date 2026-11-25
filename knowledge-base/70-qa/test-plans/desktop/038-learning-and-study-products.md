---
id: "PLAN-desktop-038"
type: "test-plan"
title: "Desktop · 38. Learning and study products"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "38"
---
# Desktop · 38. Learning and study products

4 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S38.01 Study-mode entry.

- **Expected:** A Study entry point starts a tutoring session that changes how the model teaches.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Study (also Composer + menu > Study) (labels found in the code)
- **Needs:** a Free account or a paid account
- **Steps:**
  1. Sign in and click "Study" in the sidebar (or click the + button under the chat box and choose "Study").
  2. On the page titled "Study", type a subject in "What are you studying?", keep the "How" choice, and click "Start studying".
  3. Wait for the chat to open. Look for the "Studying: <your subject>" indicator above the chat, and check that the tutor teaches one idea at a time and asks a question before moving on.

## S38.02 Learning-goal setup.

- **Expected:** The user states what they want to learn before a session starts.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Study > "What are you studying?" and "How" (labels found in the code)
- **Steps:**
  1. Click "Study" in the sidebar.
  2. Under "Start a session", click in the field "What are you studying?" and type a goal such as eigenvalues. The field stops at 200 characters.
  3. Choose one option under "How": "Learn it", "Practise it" or "Revise it". Each shows a one-line description.
  4. Optionally tick "Start with a personal study plan", then click "Start studying". Check that the chat opens and the first reply is about your goal.

## S38.03 Subject selection.

- **Expected:** The user picks the subject to study.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Study > "What are you studying?" (and "Course material" when projects exist) (labels found in the code)
- **Needs:** none (a project is needed to see the Course material menu)
- **Steps:**
  1. Click "Study" in the sidebar.
  2. Type the subject into "What are you studying?". There is no list of subjects to pick from; the subject is typed.
  3. If you have projects, open the "Course material" menu and pick "From project: <name>" (or "None").
  4. Click "Start studying" and check that the chat title starts with the mode label and the subject, and the indicator shows "Studying: <subject>".

## S38.04 Level or background selection.

- **Expected:** The user sets their level or background and the tutor adapts to it.
- **Code:** done. Evidence moved: apps/web/features/study/components/StudyPage.tsx:56; apps/web/features/study/services/study-api.ts:46; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:2892 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Study > "Where you are with it" (labels found in the code)
- **Steps:**
  1. Click "Study" in the sidebar.
  2. Open the "Where you are with it" menu. The options are "New to it" (default), "Some background" and "Know it well".
  3. Pick "Know it well", type a subject, click "Start studying".
  4. In the new chat, check that the tutor skips the basics and uses precise vocabulary, compared with a session started at "New to it", which defines every term first.
