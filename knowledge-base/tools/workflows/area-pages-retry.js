export const meta = {
  name: "kb-area-pages-retry",
  description: "Write the feature guide: one page per product area on the cheap model, and one map of the whole codebase",
  phases: [
    { title: "Areas", detail: "the eight areas whose first attempt failed", model: "sonnet" },
    { title: "Map", detail: "one page that explains how the whole codebase fits together", model: "sonnet" },
  ],
};

const AREAS = ["004-signed-in-application-destinations", "007-layout-systems", "009-compound-interface-components", "016-user-message-components", "034-search-experiences", "035-research-workspace", "061-persistent-agents-and-agent-rosters", "079-routing-and-model-neutral-orchestration"];
const REPO = '~/Desktop/agiworkforce'
const BRIEFS = '~/Desktop/agiworkforce/knowledge-base/data/area-briefs'

const GUIDE = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    what_it_is_for: { type: 'string' },
    who_uses_it: { type: 'string' },
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ids: { type: 'array', items: { type: 'string' } },
          use: { type: 'string' },
          how_people_use_it: { type: 'array', items: { type: 'string' } },
          how_it_should_work: { type: 'array', items: { type: 'string' } },
          on_each_app: { type: 'string' },
        },
        required: ['name', 'ids', 'use', 'how_people_use_it', 'how_it_should_work', 'on_each_app'],
      },
    },
    how_it_works: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, detail: { type: 'string' }, code: { type: 'array', items: { type: 'string' } } }, required: ['step', 'detail', 'code'] } },
    key_files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, role: { type: 'string' } }, required: ['path', 'role'] } },
    data_kept: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' } }, required: ['what', 'where'] } },
    switches: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, effect: { type: 'string' }, where: { type: 'string' } }, required: ['name', 'effect', 'where'] } },
    shared_code: { type: 'string' },
    things_that_look_wrong: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' } }, required: ['what', 'where'] } },
    not_sure: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'what_it_is_for', 'who_uses_it', 'features', 'how_it_works', 'key_files', 'data_kept', 'switches', 'shared_code', 'things_that_look_wrong', 'not_sure'],
}

function prompt(slug) {
  return `Write the feature guide page for one product area of AGI Workforce, an AI assistant product with six apps (Web, Desktop, Mobile, CLI, VS Code extension, Chrome extension) that does what Claude and ChatGPT do, lets the user choose the model, and can run a model on the user's own device for free. It runs in three separate ways: Local (on the device), own key (the user's provider key), and Cloud (our managed service, paid by plan).

Readers: a new engineer who must change this area, and a QA tester who must use it like a person. Neither has seen the code.

Start from the brief: ${BRIEFS}/${slug}.md. It lists every item in the area, what should happen ("Should"), its status in each app, and where its code is.
Then read the code in the project folder ${REPO} (READ ONLY: never edit, create or delete anything there, and never run builds, tests, installs or servers). Open the files the brief names, and follow the path from the screen to the server and to where data is stored. Search with rg when a file has moved.

Return:
- area: the area's name.
- what_it_is_for: 2 to 4 sentences: what a person gets from this area and why it matters.
- who_uses_it: which users (every user, paid plans only, workspace admins, developers ...), as the code shows.
- features: group the brief's items into the 4 to 12 features a person would recognise. For each: a plain name; ids (every item ID from the brief that belongs to it; each ID in exactly one feature); use (what it is for, one or two sentences); how_people_use_it (the steps or gestures: click, type, drag, tap, swipe, keyboard shortcut, command); how_it_should_work (what must happen, including the empty state, the waiting state, what happens on failure, and any limit by plan); on_each_app (which apps have it and how they differ, from the Status lines).
- how_it_works: the path through the code in order, 4 to 10 steps, from what the person touches to what is stored or sent. Each step: a short name, what happens in plain words, and code: the files and lines you actually opened, as "path:line".
- key_files: the 5 to 12 files someone must know, each with its role in one line.
- data_kept: what is stored and where (database table, browser storage, file on disk, device storage), only what you saw in the code.
- switches: plan gates, feature flags, settings and environment values that turn parts of this area on or off, with where each is read.
- shared_code: which code is shared between apps and which is separate per app.
- things_that_look_wrong: places where the code does not do what the brief's "Should" says, or looks unfinished or contradictory. Only what you saw, with path:line. Empty list if none.
- not_sure: everything you could not establish. An honest gap is better than a guess.

Rules: plain words, short sentences, explain any technical term in a few words the first time. Every "code" and "where" entry must be a real path you opened in this project. Never invent a file, a function, a setting or a behaviour. Do not write model names or vendor names of AI providers.`
}

const MAP_PROMPT = `Write one page that explains how the whole AGI Workforce codebase fits together, for a new engineer and for a QA tester. Project folder (READ ONLY: never edit, create or delete anything, and never run builds, tests, installs or servers): ${REPO}
Read ARCHITECTURE.md, AGENTS.md, README.md, docs/architecture/ (every file), docs/agent-context/repo-map.json and lanes.json, package.json, pnpm-workspace.yaml, Cargo.toml, and the top of each app's and package's own README or package.json. Open code where the documents are unclear.
Write Markdown with these sections, in plain words and short sentences, explaining each technical term in a few words the first time:
1. The product in five lines (six apps; Local, own key and Cloud as three separate ways of running; the user chooses the model).
2. The apps: for each of Web, Desktop, Mobile, CLI, VS Code extension and Chrome extension: its folder, what it is built with, how it starts, and what it shares with the others. Say plainly that the public Desktop app shows the hosted web app in its window and what the older retained desktop code is.
3. The shared packages and services: a table of every folder under packages/, services/, crates/ and infrastructure/ with one line on what it is for and which apps use it.
4. What happens when a person sends a chat message in Cloud mode, step by step from the screen to the model provider and back, and where the conversation is stored. Then the same in a few lines for Local mode and for own key.
5. Accounts, plans and usage: where sign-in, plans, allowances and billing live in the code.
6. Where data is kept: the database and its migration folder, files, caches, device storage.
7. The rules the code enforces (trust boundaries between Local, own key and Cloud; the generated model catalog; protocol types generated from Rust; the guard scripts) and where each is enforced.
8. How to build, run and check each app: the commands, taken from docs/agent-context/commands.json.
9. Where to look first: a table "if you need to change X, start in Y" with at least 25 rows covering the main features.
Cite the file for every statement as (path) or (path:line). Only real paths you opened. Never invent a file, a command or a behaviour; where the documents and the code disagree, say so and trust the code. Do not write model names or vendor names of AI providers. End with a section "Not established" listing what you could not find.`;

const areas = parallel(AREAS.map((slug) => () => agent(prompt(slug), { label: `area:${slug.slice(0, 34)}`, phase: "Areas", schema: GUIDE, model: "sonnet" }).then((r) => ({ slug, model: "haiku", guide: r }))));
const map = Promise.resolve("");
const [pages, mapText] = await Promise.all([areas, map]);
const done = pages.filter((p) => p && p.guide);
log(`area pages written: ${done.length} of ${AREAS.length}`);
return { pages: done, map: mapText || "" };
