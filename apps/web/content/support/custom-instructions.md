---
id: custom-instructions
title: Custom instructions for the CLI and VS Code
path: /cli
category: surfaces
tags: custom instructions, instructions, agents.md, claude.md, instructions.md, rules, repository memory, remember for this repository, project instructions
platforms: cli, vscode, macos, windows, linux
updated: 2026-09-28
scope: public
---

## Files every session reads

Before a session starts, `agi` reads your own instructions from
`~/.agiworkforce/instructions.md`, then walks from the folder you are in up to
the top of the disk and reads, in each folder, `AGENTS.md`, `CLAUDE.md` and
`.agiworkforce/instructions.md`. Your own file comes first and the folder you
are in comes last, so the closest file has the final word. Together they may
use about 10,000 tokens; files past that are left out and the session says so.

Rules in `.agiworkforce/rules/*.md` in the repository and in
`~/.agiworkforce/rules/*.md` are added too, some only for matching files.

## Repository memory

Notes the agent should keep for a repository are saved in `CLAUDE.md` at the
repository root. In VS Code, run **Remember for This Repository** to add one;
it tells you which file it saved to. Notes for every repository go in
`~/.agiworkforce/CLAUDE.md`. Each note can be up to 4,000 characters.

## Instructions set in VS Code

VS Code Settings also has instruction boxes for all workspaces and for the
current one, up to 8,000 characters each. The workspace box replaces the
general one when it has text, and whichever applies is sent with every
message. The Settings panel lists the instruction files it found in the
workspace folder.
