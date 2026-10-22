# Model evidence

The figures behind the routing defaults. Everything here changes: prices, benchmark scores and model generations. Check the date on a table before leaning on it, and refresh this file rather than editing numbers into `SKILL.md` or `routing.md`.

**Read on 2026-10-08, refreshed 2026-10-21.** The 2026-10-21 refresh read the leaderboard and the Anthropic pricing, caching, effort and model pages first-hand: every index score and cost per task was unchanged, speed and latency moved slightly. Spot-check a figure against its page before a decision rests on it. The source's own model labels are kept in the tables so each row can be traced; the rest of the skill uses family names only.

## Contents

- What the evidence changed in the defaults
- Artificial Analysis: intelligence, cost per task and speed by effort
- Anthropic: list prices and stated purpose
- Billing modifiers and cache rules
- Anthropic: effort guidance
- Coding and agent benchmarks
- What is not established
- This installation
- How to refresh

## What the evidence changed in the defaults

1. **Effort moves quality and cost as much as the family does.** On the Artificial Analysis index, each family spans 11 to 20 points between low and max, about the same as the gap between neighbouring families at one effort level. Anthropic says the same: "Tuning effort is often a better lever than switching models." So the routing table picks a pair, not a model.
2. **Haiku at low effort is weak; at medium or high it overlaps Sonnet at low for a fraction of the cost.** Haiku high scores 38 at $0.08 per task; Sonnet low scores 36 at $0.35. The scout profile therefore defaults to medium, and the first move for a bounded task that fell short is Haiku at high, not Sonnet. Anthropic also warns that Haiku at low "may skip a search or a check" in long agent prompts.
3. **Do not push Sonnet past high.** Sonnet xhigh (52, $2.01 per task) costs more than Opus medium (51, $1.34) for the same score, and Sonnet max (56, $5.46) costs three times Opus high (54, $1.82). When Sonnet at high is not enough, the next step is Opus at medium.
4. **Opus leads at every effort level and is Anthropic's stated starting point** ("Most workloads start with" Opus). It scores above Fable on this index at medium and above while costing less per task.
5. **Fable is the most expensive per token and per task, and slower.** Its measured advantages published by Anthropic (science and terminal tasks, automation, computer use, a hard exam benchmark) are against the previous Opus generation, not the current one. Anthropic's stated trigger for choosing it is that evaluations on Opus at xhigh or max "still fall short". That supports this skill's rule: choose Fable for a reason you can state, never by default. Using it as an independent assessor rests on a different argument (a different model is less likely to share the first one's blind spots), which is reasoning, not a benchmark result.
6. **Very high effort is slow to start.** Reported time to first output at max is several minutes for every family (the figure looks like total thinking time), and over two minutes for Opus at xhigh. Use xhigh and max where waiting is acceptable.
7. **Delegation trades quality for cost.** In Anthropic's own measured example (a strong lead with cheaper workers on a 21.6M-token corpus task), the arrangement was 47 to 55 percent cheaper and scored 10 to 12 points lower than the lead model doing it alone. Anthropic also notes that when the work is one dependent chain or fits in a single context, "the coordinator's model alone at lower effort came out ahead." Both support choosing the smallest arrangement.

## Artificial Analysis: intelligence, cost per task and speed by effort

Source: artificialanalysis.ai/leaderboards/models, read 2026-10-21. Columns: Intelligence Index; cost per task in USD; median output tokens per second; seconds to first output chunk. All rows are reasoning (effort) variants; context is listed as 1M tokens for all. Opus, Sonnet and Fable rows are labelled "with fallback". The best non-Claude row scored 56.

| Source label      | Index | $ per task | tok/s | First chunk (s) |
| ----------------- | ----- | ---------- | ----- | --------------- |
| Opus 5.5 max      | 58    | 5.98       | 95    | 647.8           |
| Opus 5.5 xhigh    | 56    | 3.46       | 83    | 123.7           |
| Opus 5.5 high     | 54    | 1.82       | 77    | 35.4            |
| Opus 5.5 medium   | 51    | 1.34       | 78    | 22.5            |
| Opus 5.5 low      | 42    | 0.55       | 79    | 5.5             |
| Sonnet 5.5 max    | 56    | 5.46       | 136   | 395.0           |
| Sonnet 5.5 xhigh  | 52    | 2.01       | 106   | 30.9            |
| Sonnet 5.5 high   | 47    | 0.88       | 102   | 11.7            |
| Sonnet 5.5 medium | 41    | 0.48       | 101   | 1.4             |
| Sonnet 5.5 low    | 36    | 0.35       | 101   | 1.3             |
| Fable 5.1 max     | 53    | 7.63       | 69    | 257.0           |
| Fable 5.1 xhigh   | 53    | 5.98       | 64    | 66.4            |
| Fable 5.1 high    | 51    | 3.91       | 55    | 20.0            |
| Fable 5.1 medium  | 49    | 2.98       | 55    | 3.2             |
| Fable 5.1 low     | 47    | 2.37       | 55    | 2.5             |
| Haiku 5.5 max     | 43    | 0.21       | 235   | 310.4           |
| Haiku 5.5 xhigh   | 41    | 0.12       | 193   | 64.5            |
| Haiku 5.5 high    | 38    | 0.08       | 179   | 23.2            |
| Haiku 5.5 medium  | 34    | 0.05       | 172   | 11.5            |
| Haiku 5.5 low     | 29    | 0.02       | 166   | 9.0             |

Not on that page when read: a coding index, an agentic index, per-token prices, and the cost to run the whole index. The per-model pages were not opened.

The index is one general measure. It does not test judgment, synthesis or writing quality directly, so it supports the ordering of the families only loosely for those.

## Anthropic: list prices and stated purpose

Source: platform.claude.com/docs/en/about-claude/models/overview and .../about-claude/pricing, read 2026-10-08. USD per million tokens. Context 1M and maximum output 128K for all four.

| Family (source label)                        | Input | Output | Cache write 5m / 1h | Cache read | Batch in / out | Speed (their word) | Stated purpose                                                                             |
| -------------------------------------------- | ----- | ------ | ------------------- | ---------- | -------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| Fable (Fable 5.1)                            | 10    | 50     | 12.50 / 20          | 0.25       | 5 / 25         | Slower             | "For demanding reasoning and long-horizon agentic work"                                    |
| Opus (Opus 5.5)                              | 4     | 20     | 5 / 8               | 0.20       | 2 / 10         | Moderate           | "For long-running agentic coding and knowledge work"                                       |
| Sonnet (Sonnet 5.5)                          | 2     | 10     | 2.50 / 4            | 0.10       | 1 / 5          | Fast               | "The best combination of speed and intelligence"                                           |
| Haiku (Haiku 5.5), prompts up to 100K tokens | 0.10  | 0.50   | 0.125 / 0.20        | 0.01       | 0.05 / 0.25    | Fastest            | "For high-volume, latency-sensitive tasks such as classification, extraction, and routing" |
| Haiku, prompts over 100K tokens              | 0.50  | 2.50   | 0.625 / 1           | 0.05       | 0.25 / 1.25    |                    |                                                                                            |

Per token, Opus is twice Sonnet, Fable is two and a half times Opus, and Haiku on short prompts is one twentieth of Sonnet. Haiku costs five times more per token once a prompt passes 100K tokens, so keep scout assignments narrow. The pricing page, reread 2026-10-21: "A request's prompt length counts all of its input tokens, including cache reads and cache writes. Each request is priced on its own: a request over the threshold pays the higher prices even when part of its prompt is a cache hit". Every other current family, Sonnet 5.5 ($2/$10), Opus 5.5 ($4/$20) and Fable, bills the full 1M window at its standard rate, so Haiku over 100K ($0.50/$2.50) is still a quarter of Sonnet and an eighth of Opus per token. A cache read costs about a twentieth to a tenth of fresh input, which is why continuing an existing agent is cheaper than starting a new one that rereads the same material.

Worked comparison from the table above (list prices, 1-hour cache, rounded; Claude Code subscription usage is metered differently and was not checked). A Haiku worker holding 120K tokens of context needs about ten more turns producing 5K tokens of output in all:

- Keep the same Haiku worker past the line: reads 10 x 125K x $0.05/M = $0.06, output 5K x $2.50/M = $0.01; about $0.08.
- Hand the material to Sonnet: write 120K x $4/M = $0.48, reads 10 x 125K x $0.10/M = $0.13, output 5K x $10/M = $0.05; about $0.65.
- Start a fresh Haiku batch from a 20K summary instead of the material: about $0.01 to $0.02, if the summary is enough.

The 5x tier mostly matters when a Haiku worker is planned too large; once it holds the material, a family switch costs more than the tier.

## Billing modifiers and cache rules

Source: platform.claude.com/docs/en/about-claude/pricing, build-with-claude/prompt-caching, thinking, effort, fast-mode and token-counting, read 2026-10-21.

- Thinking tokens bill as output, including thinking that is not shown ("reduces latency, not cost"); thinking cannot be turned off on the current four families. Effort changes the number of tokens, not the price per token.
- The current models use a newer tokenizer that counts about 30 percent more tokens for the same text than the previous generation.
- Fast mode (current Opus only): $8 / $40, "up to 2.5x" faster output, no batch, and fast and standard requests do not share a cache. US-only inference is 1.1 times every rate.
- Cache reads cost 0.05 times input on Opus and Sonnet, 0.1 times on Haiku and 0.025 times on Fable. A 5-minute write is 1.25 times input and pays back after one read; a 1-hour write is 2 times and pays back after two. Every read refreshes the timer at no cost. Minimum cacheable prompt is 512 tokens; up to 4 breakpoints; caches are isolated per workspace and need a byte-identical prefix.
- Rebuilds: changing tool definitions invalidates everything after them; web search, citations or speed toggles invalidate system and messages; images and `tool_choice` invalidate messages. The API page says thinking and effort changes invalidate messages; Claude Code's page says effort changes keep the cache on the current models. Sharing across models is not documented.
- Claude Code's cache lifetimes: the main conversation gets 1 hour on a subscription within plan usage, otherwise 5 minutes; sub-agents, workflow agents and compaction get 5 minutes. Settings: `promptCacheTtl`, `subagentPromptCacheTtl`, the `CLAUDE_CODE_*PROMPT_CACHE_TTL` variables, and `experimental.cacheTtl` in an agent file.
- Subscription limits: five-hour and weekly limits are shared across Claude and Claude Code and every model; Max adds a separate weekly limit for Fable ("up to 50% of your weekly usage limits"). No per-model weights are published. Over the limit, usage credits bill at API rates and the main cache drops to 5 minutes. Anthropic's average: about $13 per developer per active day.

Other statements from the same pages: batch processing is half price; "Most workloads start with" Opus; move to Fable if "evals at xhigh or max effort still fall short"; Haiku is listed for "sub-agent tasks".

## Anthropic: effort guidance

Source: platform.claude.com/docs/en/build-with-claude/effort, read 2026-10-08. All four current families support low, medium, high, xhigh and max.

| Level  | Anthropic's description                                                                      |
| ------ | -------------------------------------------------------------------------------------------- |
| low    | "Simpler tasks that need the best speed and lowest costs, such as subagents"                 |
| medium | "Agentic tasks that require a balance of speed, cost, and performance"                       |
| high   | "Complex reasoning, difficult coding problems, agentic tasks"                                |
| xhigh  | "Long-running agentic and coding tasks (over 30 minutes) with token budgets in the millions" |
| max    | "Tasks requiring the deepest possible reasoning"                                             |

Per family: for Sonnet, "start with medium for well-specified tasks and move to high for harder or longer ones"; for Haiku, "Start with medium ... including agentic coding". API default effort: Fable high, Opus medium, Sonnet high, Haiku medium. Claude Code's own defaults differ in places (its documentation lists medium for the current Opus, Sonnet and Haiku).

## Coding and agent benchmarks

| Benchmark                                               | Figures                                                                                                                                                                        | Source                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Terminal-Bench 4.0                                      | Opus 5.5 66.4% at xhigh (standard error 2.6); Fable 5.1 55.8%                                                                                                                  | anthropic.com/news (Opus 5.5 launch post) and anthropic.com/claude-fable-and-mythos-5-1 |
| Fable 5.1 against the previous Opus generation (Opus 5) | Terminal-Bench 4.0 55.8 vs 52.3; CursorBench 73.4 vs 70.0; AutomationBench 31.4 vs 26.9; a hard exam benchmark without tools 60.9 vs 56.6; Terminal-Bench-Science 52.6 vs 29.0 | anthropic.com/claude-fable-and-mythos-5-1                                               |
| Anthropic's summary                                     | The current Opus "performs at the level of" the current Fable "on most work"                                                                                                   | anthropic.com/news (Opus 5.5 launch post)                                               |

Third-party trackers reported effort-by-effort Terminal-Bench figures for Sonnet and a SWE-bench Pro ranking, but the same snippet contradicted itself, so those numbers are left out.

## What is not established

- No official coding benchmark for the current Sonnet or Haiku was found, and no SWE-bench Verified figure for any of the four.
- Artificial Analysis ranks the current Opus above the current Fable on its index, while Anthropic's overview calls Fable its most capable; they measure different things.
- Nothing found tests "judgment" or "synthesis" as such. The preference for Opus on that work rests on the general index, Anthropic's positioning, and the user's own experience.
- The claim that Haiku suits _verifiable_ work is this skill's reading (cheap, fast, lower scoring, so pair it with evidence you can check), not a statement from a source.

## This installation

Checked on 2026-10-21.

- Claude Code 2.1.307. Model aliases `haiku`, `sonnet`, `opus`, `fable`, plus `best` (Fable where available, else Opus) and `opusplan` (Opus in plan mode, Sonnet to execute; each switch rebuilds the cache). Effort levels `low` to `max`; a top-level `effortLevel` in user settings is ignored for the current Opus, so per-model `modelSettings` entries apply.
- Agent files accept `model`, `effort`, `tools`, `maxTurns`, `autoCompactWindow`, `isolation`, `background`, `omitClaudeMd`, `memory` and `experimental.cacheTtl`. A `model` or `effort` passed on the Agent call wins over the file.
- Project settings: `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`, so unconfigured sub-agents run on Sonnet; agent teams off by default; a project `Explore` agent runs searches on Haiku at medium. `orch-builder` and `orch-principal` keep a 1-hour cache because their tool calls often run longer than 5 minutes; scouts stay on 5 minutes.
- User settings: main model `opus`, Opus effort `high`; the `haiku` alias is pinned through `ANTHROPIC_DEFAULT_HAIKU_MODEL`.
- Machine: a 16 GB laptop on a Max 20x plan, so memory, not plan usage, is the binding constraint. Heavy commands go through `scripts/dev/heavy-job.sh` (one at a time, waits for 3 GB free) and scoped tests through `scripts/dev/light-job.sh` (two slots); a PreToolUse hook denies unwrapped heavy commands.

## How to refresh

1. Reread the Artificial Analysis leaderboard and the Anthropic models, pricing, effort and "choosing a model" pages. Record the date and the source's labels.
2. Recompute the three comparisons the defaults rest on: Haiku high against Sonnet low; Sonnet xhigh against Opus medium; Fable against Opus at high.
3. If a comparison flips, change the row in `routing.md` and the table in `SKILL.md`, and note the change at the top of this file.
4. Check `claude --help` for the model aliases and effort levels, and the sub-agents documentation for frontmatter fields.
