---
id: models-and-reasoning
title: Pick a model, and control how hard it thinks
path: /models
category: models
tags: model picker, choose model, auto, switch model, extended thinking, reasoning effort, thinking budget, vision, image output, video output, tools, model unavailable, retired model, prompt cache
updated: 2026-09-17
scope: public
---

## Picking a model by name

The model control under the composer lists every model your plan and trust mode
make available, grouped and searchable by name. Each entry carries what it can
do: **Vision**, **Tools**, **Search**, **Image output**, **Video output**,
**Reasoning**. Models on your own machine appear under **On this device**.

Leaving the control on **Auto** picks the best model for each message. An
explicit choice is never silently replaced with a different provider.

## What the badges mean

- **Upgrade**: the model exists but your plan does not include it.
- **Coming soon, not yet available**: it is in the catalogue but not live.
- **Unavailable right now**: it is live but not answering at the moment.
- **Auto (free) · community models, capacity varies**: the free routing lane,
  whose capacity is not guaranteed.

## Thinking and effort

How reasoning is controlled depends on the model. Some have no reasoning
control, some always reason, some expose an on/off **Extended thinking**
switch, some a thinking budget, and some a set of effort levels. The control
under the composer says which applies: "Always on for this model", "Extended
thinking is off for this model", or an effort picker whose hint is "Higher
effort thinks longer before it answers."

## Switching mid-conversation

Within the same trust boundary you can switch models in the middle of a
conversation; the provider label updates before the next request. The control
warns that switching here starts a new prompt cache, so the next message is
processed fresh.

Moving between Local, BYOK and managed cloud is different: it is always an
explicit continuation with context selection, a payload preview, your consent,
and a visible destination label.

## A model that was retired

If a conversation was saved with a model that no longer exists, the chat says so
in place: that model is no longer available, new messages will use the named
replacement, and you can pick a different one. The conversation is not lost and
nothing is rewritten.

## How many there are

{{MARKETING.models.display}} models across {{MARKETING.providers.display}}
provider integrations. Providers ship and retire models constantly, so the
picker in the product is the current source of truth, never a number in a
document.
