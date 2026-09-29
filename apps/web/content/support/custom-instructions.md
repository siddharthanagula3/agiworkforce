---
id: custom-instructions
title: Custom instructions for the CLI and VS Code
path: /cli
category: surfaces
tags: custom instructions, agents.md, claude.md, instructions.md, project instructions, vscode instructions, personalize
platforms: cli, vscode, macos, windows, linux
updated: 2026-09-28
scope: public
---

## Instruction files

The CLI and the VS Code extension's local sessions read instructions from
files. In each folder from the top of the drive down to the one you work in,
they read `AGENTS.md`, `CLAUDE.md` and `.agiworkforce/instructions.md`. Your own
`~/.agiworkforce/instructions.md` is read first, and a deeper folder's file
comes after a shallower one, so the closest instructions are read last.

Together the files can use about 10,000 tokens, and files past that are left
out. The same file is never
read twice. An edited, added or removed file reaches the next turn, and so does
moving to another worktree.

## Instructions set in VS Code

Settings, Custom instructions in the extension holds instructions of up to
8,000 characters, either for every workspace on this computer or for the open
workspace only. A workspace's own instructions replace the computer-wide ones
while it is open. They are kept in VS Code's workspace storage, not in a project
file, and the instruction files above are read separately.

## Your account's instructions

`/personalize` in the CLI shows and changes your account's personalization,
such as what to call you, your work and how answers are written; the same
settings are in Settings, General on the web. In a Managed session, your
account's memories and the instructions of the account project you linked are
added to the turn as well.
