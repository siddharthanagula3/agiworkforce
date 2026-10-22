---
id: chat-basics
title: Start, steer and manage a chat
path: /chat
category: chat
tags: theme, dark theme, dark mode, light mode, appearance, accent colour, high contrast, motion, chat font, text size, display language, chat, new chat, conversation, compose, send message, edit message, regenerate, retry, branch, variant, rename, archive, delete chat, thinking, response style
updated: 2026-10-16
description: How to start a chat, choose how answers are written, attach files, edit or branch a conversation and organize chats.
scope: public
---

## Start a new chat

Open the chat surface and type. A new conversation begins with the first
message you send; nothing is created before that. Shift+Cmd/Ctrl+O starts a new
conversation from anywhere in the app. Cmd/Ctrl+B shows or hides the sidebar.

## Choose how the answer is written

The composer carries a **Response style** control with Default, Concise,
Detailed, Technical and Creative, plus a response-length control. You can save
your own style by naming it and giving it an instruction, or by pasting a
writing sample for AGI to match. Custom styles can be edited and deleted from
the same menu.

## Attach files and tools

The **+** button beside the composer attaches files, adds a project or folder as
scope, and lists **Connectors**. {{AVAILABILITY.connectors}} Typing `/` opens the
command menu:
`/search` searches the web, `/think` asks for extended reasoning, `/image`
generates an image, `/code` runs code in a sandbox. `/browser`, `/terminal` and
`/database` appear only on surfaces whose capabilities allow them.

## Change a message after you sent it

Hover a message to reveal its actions. You can edit your own message and send
it again, copy a response, give a good or bad rating, and regenerate the answer.
Shift+Cmd/Ctrl+R regenerates the last response and Shift+Cmd/Ctrl+C copies it.
Regenerating keeps the earlier answer as a variant; the pager under the message
steps between variants, and a variant can be deleted from there.

## Branch a conversation

Hover a message and choose **Branch conversation from here**. A new conversation
opens holding everything up to and including that message, and the chat you
branched from stays as it was. **Duplicate as branch** in the conversation title
menu does the same from the last message, so it copies the whole thread.

A message that has been branched shows a branch pager, which steps between the
conversations that share it. While a branch is being created the control reads
"Creating branch…" and cannot be pressed a second time. A message can hold only
so many branches, and a conversation only so many branch points; past either
limit the request is refused and the message says which.

## Rename, archive and delete

The conversation title menu renames a chat. Archiving moves it out of the
sidebar without deleting anything, and Settings holds an **Archived chats** list
that restores a chat or moves it to **Recently deleted**. A deleted chat stays
there for 30 days, so you can restore it, and is then deleted for good.

## Change the theme and appearance

Open Settings, General and find the **Preferences** group. The **Appearance**
row sets the theme: System follows your device, while Light and Dark stay as
you chose. To switch to dark theme, choose Dark there.

The rows beneath it change how the app looks. **Accent colour** offers AGI
amber, Green, Blue, Violet and Rose. **High contrast** is a switch. **Motion**
offers System, which follows your device setting, and Reduced, which turns down
animation in streaming responses and other interface elements. **Chat font**
changes the typeface of message text to Sans, Serif or Dyslexic friendly, and
code stays monospace. **Chat text size** runs from Small to Large.

**Display Language** translates pricing, marketing pages, device sign-in, and
the app's navigation: the sidebar, menus, and the composer's own labels.
Settings field labels and your conversations are unaffected.

## When a chat will not load

The failure notice says "Chat could not be displayed" and offers **Try again**.
If the browser is offline it says "You are offline" instead. In both cases your
messages are already saved, so retrying or opening a different conversation
loses nothing.
