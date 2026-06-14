# AGI Mobile — Reddit Launch Drafts

**Target date:** 2026-07-12
**Per GTM playbook:** Reddit is second channel after HN.  
**Subreddits covered:** r/LocalLLaMA, r/india, r/iphone, r/android

---

---

## r/LocalLLaMA

**Title:**

```
We shipped Local Mode AI for iOS + Android. Here's what we learned.
```

**Body:**

Hi LocalLLaMA. We are preparing AGI Mobile as a free Local Mode assistant for iOS and Android, with Cloud by invite. Thought this community would be interested in the technical choices.

**Model stack**

iOS:

- local model support where the device and runtime allow it
- clear unavailable and downloadable states when local support is not ready

Android:

- local model support where the device and runtime allow it
- clear unavailable and downloadable states when local support is not ready

**Why the model state matters**

Local model quality, runtime support, download size, and battery impact vary by device. We decided the app should make that state visible instead of pretending every phone can run the same model.

**Local performance**

Benchmarks are not public claims until they are measured and reproducible on the target build and device matrix.

**Memory and context**

Local memory and context behavior are being kept explicit and user-visible. We are not publishing context-window, summarization, or benchmark claims until they are measured on release builds.

**What we did not do (yet)**

- LoRA fine-tuning on-device
- Model swapping mid-conversation
- Streaming model downloads

Mobile page: agiworkforce.com/mobile. Questions welcome, especially on inference optimization.

---

---

## r/india

**Title:**

```
Launched free Local Mode AI app for India today — Cloud by invite
```

**Body:**

Namaste r/india. We are preparing AGI Mobile for iOS and Android. Wanted to share it here because India is an important early market for Local Mode.

**What it is**

A free AI assistant where users choose the route: Local on the phone or AGI Cloud by invite. Local mode works offline when the selected local model is available.

**Why we built it for India first**

Most AI apps hide the execution route. We wanted a mobile app that shows whether the work is Local, unavailable on the device, or available through AGI Cloud invite access.

We wanted an app that respects practical phone constraints and does not silently move local work to Cloud.

**Hindi**

Hindi and Hinglish quality are launch-review items. We will not make quality claims until they are measured and reviewed.

**DPDP Act 2023**

India's new data protection law requires careful handling of personal data. Local-mode inference stays on-device where supported, and Cloud requires explicit invite-gated routing with visible provider labels.

**Free**

Local Mode is free. Cloud features such as hosted models and sync are invite-gated.

Download: agiworkforce.com/mobile (iOS + Android links on page)

Happy to answer questions in the thread.

---

---

## r/iphone

**Title:**

```
Built a free Local Mode AI app for iPhone — Cloud by invite
```

**Body:**

Hey r/iphone. We are preparing AGI Mobile and thought iPhone users here would like to know about the Local Mode approach.

**What it is**

A free AI assistant that runs locally where the selected model route is available. Cloud is invite-gated.

**How it uses your iPhone's AI**

AGI shows which local route is installed, downloadable, unavailable, or offline. Unsupported local work is not silently sent to Cloud.

**Features**

- Local chat
- Model setup with visible device states
- Voice input where device support is available
- Memory and personalization controls
- Projects and artifacts preview
- App lock, age gate, privacy, and data controls
- Cloud invite and waitlist flow

**Privacy**

Local-mode conversations stay on your iPhone where supported and are not silently routed to Cloud. Cloud use is a separate, visible route.

**Cloud**

Cloud models, sync, and hosted tools are available by invite. Local is the free launch path.

Mobile page: agiworkforce.com/mobile

---

---

## r/android

**Title:**

```
AGI Mobile: free Local Mode AI for Android — Cloud by invite
```

**Body:**

Hey r/android. We are preparing AGI Mobile as an AI assistant with Local Mode first and Cloud by invite.

**The Gemini Intelligence gap**

On-device AI support varies heavily by Android device, runtime, RAM, and model size.

We designed AGI Mobile to show what is actually available on the device.

**How AGI Mobile works on your Android**

The app should detect and display local model states: installed, downloadable, unavailable, runtime-offline, or Cloud invite-gated.

**Features**

- Local chat
- Model setup with visible device states
- Voice input where device support is available
- Memory, projects, and artifacts preview
- Works offline when the selected local model is available
- Privacy: Local mode is not silently routed to Cloud

**Cloud**

Cloud models, sync, and hosted tools are available by invite. Local is the free launch path.

Mobile page: agiworkforce.com/mobile

Happy to talk Android performance or inference stacks in the comments.
