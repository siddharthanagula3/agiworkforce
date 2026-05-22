# Wave 0 Smoke Test Log

> Copy this file and rename it: `SMOKE-TEST-LOG-YYYY-MM-DD-<device>.md`  
> Fill in every field. PASS/FAIL only — no "maybe" entries.

---

## Test metadata

| Field         | Value                                         |
| ------------- | --------------------------------------------- |
| Date          | YYYY-MM-DD                                    |
| Tester        |                                               |
| Test run ID   | (from ios-smoke.sh / android-smoke.sh output) |
| EAS build URL |                                               |

---

## Device: iPhone

| Field         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Device model  | (e.g. iPhone 15 Pro)                                           |
| iOS version   | (e.g. 17.4.1)                                                  |
| Available RAM | (check Settings → General → About, or from device-tier screen) |
| Detected tier | Tier 1 / Tier 2 / Tier 3                                       |
| App version   | (from About screen or EAS build)                               |

---

## Core smoke steps — iPhone

### Step 1 — Cold launch

|                      |             |
| -------------------- | ----------- |
| Result               | PASS / FAIL |
| Cold-start time (ms) |             |
| Notes                |             |

### Step 2 — Onboarding hero

| Check                                            | Result      |
| ------------------------------------------------ | ----------- |
| Tagline: "AGI runs on your device."              | PASS / FAIL |
| Trust chip: "AGI Automation LLC · Delaware, USA" | PASS / FAIL |
| DPDP Act badge present                           | PASS / FAIL |
| "Start chatting" button visible                  | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Notes:

### Step 3 — Disclosure modal (Article 50)

| Check                                           | Result      |
| ----------------------------------------------- | ----------- |
| Modal appears after tapping "Start chatting"    | PASS / FAIL |
| Provider list present (Anthropic, OpenAI, etc.) | PASS / FAIL |
| "Article 50" language in modal                  | PASS / FAIL |
| Accept / Agree button present                   | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Notes:

### Step 4 — Device-tier detection

| Check                      | Result      |
| -------------------------- | ----------- |
| Device model name shown    | PASS / FAIL |
| RAM tier detected          | PASS / FAIL |
| Model recommendation shown | PASS / FAIL |
| No crash or blank screen   | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Detected tier: Tier 1 / Tier 2 / Tier 3  
Recommended model name shown on screen:  
Notes:

### Step 5 — Download model

> Skip if Tier 1 (Apple Foundation Models — no download needed). Note "Tier 1 skip" below.

| Check                                       | Result      |
| ------------------------------------------- | ----------- |
| Tier 1 skip                                 | YES / NO    |
| "Download model" button tappable            | PASS / FAIL |
| Model name shown: Qwen3-4B-Instruct-2507    | PASS / FAIL |
| File size shown (~2 GB)                     | PASS / FAIL |
| Download progress updates (not stuck at 0%) | PASS / FAIL |

**Overall step result:** PASS / FAIL / SKIPPED (Tier 1)  
Download speed (MB/s):  
Notes:

### Step 6 — Chat empty state

| Check                                          | Result      |
| ---------------------------------------------- | ----------- |
| On-device shield badge / chip visible          | PASS / FAIL |
| ModeToggle: "On-device" active, "Cloud" locked | PASS / FAIL |
| Empty chat state visible                       | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Notes:

### Step 7 — First inference

| Check                                    | Result      |
| ---------------------------------------- | ----------- |
| Response streams (appears progressively) | PASS / FAIL |
| PerformanceChip appears below response   | PASS / FAIL |
| PerformanceChip shows tok/s              | PASS / FAIL |
| PerformanceChip shows ttft (ms)          | PASS / FAIL |
| Response is coherent (a greeting)        | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Time to first token (ms):  
Tokens per second (from chip):  
TTFT shown in chip (ms):  
Notes:

---

## Extended procedure — Cloud waitlist (iPhone)

### Step 8 — Tap Cloud chip

|        |             |
| ------ | ----------- |
| Result | PASS / FAIL |
| Notes  |             |

### Step 9 — Enter email

|        |             |
| ------ | ----------- |
| Result | PASS / FAIL |
| Notes  |             |

### Step 10 — Submit

|        |             |
| ------ | ----------- |
| Result | PASS / FAIL |
| Notes  |             |

### Step 11 — Confirmation with rank

| Check                                       | Result      |
| ------------------------------------------- | ----------- |
| Rank shown as "#N in line"                  | PASS / FAIL |
| Rank is a positive integer (not 0 or blank) | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Rank shown: #  
Notes:

### Step 12 — Continue on-device

|        |             |
| ------ | ----------- |
| Result | PASS / FAIL |
| Notes  |             |

### Step 13 — Header chip updated

| Check                              | Result      |
| ---------------------------------- | ----------- |
| Cloud segment shows "Cloud · ✓ #N" | PASS / FAIL |
| On-device still active / selected  | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Notes:

---

## Device: Pixel (Android)

| Field                         | Value                                   |
| ----------------------------- | --------------------------------------- |
| Device model                  | (e.g. Google Pixel 8 Pro)               |
| Android version               | (e.g. 14 / API 34)                      |
| Available RAM                 |                                         |
| Detected tier                 | Tier 2 / Tier 3 (Tier 1 N/A on Android) |
| AICore / Gemini Nano detected | YES / NO                                |
| App version                   |                                         |

---

## Core smoke steps — Android

> Same 7-step procedure. Tier 1 is never applicable on Android. Fill below.

### Step 1 — Cold launch

|                      |             |
| -------------------- | ----------- |
| Result               | PASS / FAIL |
| Cold-start time (ms) |             |
| Notes                |             |

### Step 2 — Onboarding hero

| Check                                            | Result      |
| ------------------------------------------------ | ----------- |
| Tagline: "AGI runs on your device."              | PASS / FAIL |
| Trust chip: "AGI Automation LLC · Delaware, USA" | PASS / FAIL |
| DPDP Act badge present                           | PASS / FAIL |
| "Start chatting" button visible                  | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Notes:

### Step 3 — Disclosure modal (Article 50)

| Check                                | Result      |
| ------------------------------------ | ----------- |
| Modal appears after "Start chatting" | PASS / FAIL |
| Provider list present                | PASS / FAIL |
| Article 50 language                  | PASS / FAIL |
| Accept button present                | PASS / FAIL |

**Overall step result:** PASS / FAIL  
Notes:

### Step 4 — Device-tier detection

**Overall step result:** PASS / FAIL  
Detected tier (Tier 2 or 3 expected):  
Notes:

### Step 5 — Download model

**Overall step result:** PASS / FAIL  
Download speed (MB/s):  
Notes:

### Step 6 — Chat empty state

**Overall step result:** PASS / FAIL  
Notes:

### Step 7 — First inference

**Overall step result:** PASS / FAIL  
Time to first token (ms):  
Tokens per second (from chip):  
TTFT shown in chip (ms):  
Notes:

---

## Screenshots / video

Upload screenshots or screen recordings here (attach to the task in tasks/todo.md or paste link):

| Step                      | File / URL | Notes |
| ------------------------- | ---------- | ----- |
| Step 2 hero               |            |       |
| Step 3 disclosure         |            |       |
| Step 7 PerformanceChip    |            |       |
| Step 11 rank confirmation |            |       |
| Any failure               |            |       |

---

## Metrics summary

| Metric                      | iPhone | Android |
| --------------------------- | ------ | ------- |
| Cold-start (ms)             |        |         |
| Model download speed (MB/s) |        |         |
| Time to first token (ms)    |        |         |
| Tokens per second           |        |         |
| TTFT shown in chip (ms)     |        |         |

---

## Defects found

> One row per defect. Leave blank if none.

| #   | Platform | Step | Description | Severity (P0/P1/P2) |
| --- | -------- | ---- | ----------- | ------------------- |
| 1   |          |      |             |                     |
| 2   |          |      |             |                     |

Severity guide: **P0** = blocks Wave 0 (app unusable), **P1** = major UX issue, **P2** = minor.

---

## Final verdict

| Platform | Core steps (1-7) | Extended (8-13)       | Overall    |
| -------- | ---------------- | --------------------- | ---------- |
| iPhone   | PASS / FAIL      | PASS / FAIL / NOT RUN | GO / NO-GO |
| Android  | PASS / FAIL      | PASS / FAIL / NOT RUN | GO / NO-GO |

**Wave 0 GO/NO-GO:** GO / NO-GO

> Wave 0 is GO if both platforms pass all 7 core steps. Extended steps are best-effort.

Tester sign-off:  
Date:
