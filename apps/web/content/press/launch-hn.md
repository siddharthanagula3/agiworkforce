# AGI Mobile — Hacker News Show HN Draft

**Target date:** 2026-07-12
**Per GTM playbook:** HN is the first channel, before Reddit, Discord, and YouTube.  
**Format:** Show HN (submit to https://news.ycombinator.com/submit)

---

## Title (max ~80 chars for HN display)

```
Show HN: AGI Mobile – on-device AI for iOS and Android (free, works offline)
```

**Characters:** 76

---

## URL to submit

```
https://agiworkforce.com/mobile
```

---

## Comment body (paste as first comment immediately after submission)

---

Hi HN. I am the founder of AGI Automation LLC and we are preparing AGI Mobile, a free Local Mode assistant for iOS and Android, with Cloud by invite.

**What it does**

It is a chat assistant with Local Mode, memory, projects, artifacts preview, voice input where supported, and Cloud by invite. Local mode works in airplane mode when the selected local model is available and is not silently routed to Cloud.

**On-device AI stack**

- iOS: local model availability is device-dependent and shown in the model picker.
- Android: local model availability is device-dependent and shown in the model picker.

The key product requirement is honest state: installed, downloadable, unavailable, runtime-offline, and Cloud invite-gated should all be visible.

**Why we built it this way**

Every AI assistant I used forced one default cloud path. I wanted mobile users to start with local hardware when privacy or cost matters, and use AGI Cloud only when they ask for managed compute.

**Tech stack**

- Expo 55 + React Native 0.83.6
- expo-sqlite (conversation persistence)
- MMKV + expo-secure-store (keys and preferences)
- local model runtimes where supported
- crash diagnostics and analytics are separated from conversation content

**What is not in v1**

Cloud models, cross-device sync, and team features are invite-gated. Local is the free launch wedge.

**What I would like feedback on**

1. The local model state UX. Is it clear enough when a model is installed, needs download, is unavailable, or requires Cloud invite access?
2. The memory design. Do users want explicit local memory controls, project-scoped memory, or automatic summaries by default?
3. On-device model routing. What runtime/device-state labels make the tradeoff clear without sounding technical?

Mobile page: agiworkforce.com/mobile

Happy to answer technical questions.

---

## Backup title (if primary is rejected)

```
Show HN: AGI Mobile shows Local, downloadable, unavailable, and Cloud routes
```

---

## Notes on HN submission timing

- Submit on a weekday, ideally Tuesday through Thursday
- 9:00 AM or 2:00 PM Eastern US are historically higher-traffic windows for Show HN
- Do not submit multiple URLs at the same time
- The first comment (above) should be posted within 2 minutes of submission to establish context before voting begins
