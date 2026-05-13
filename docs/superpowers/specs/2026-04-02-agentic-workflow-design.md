# Agentic Workflow Design
**Date:** 2026-04-02

## Overview

Replace the current GitHub Actions + deterministic scoring digest with two scheduled remote Claude agents (morning + evening) backed by a token-efficient CLI formatter, plus first-class on-demand cowork via Claude Code sessions.

**Goals:**
- Actual reasoning over tasks (infer hard deadlines, understand context) vs. mechanical scoring
- Drop scheduled pushes you ignore — morning and evening only, both actionable
- Token efficiency: compress Notion MCP output before Claude reasons over it
- On-demand task management (add tasks, process spreadsheets) via natural Claude Code sessions
- No GitHub Actions, no persistent bot process, no infrastructure to maintain

**Non-Goals:**
- Discord slash command bot (removed)
- Midday replan (removed)
- Adaptive learning or productivity coaching
- Automatic calendar blocking

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  notion-digest repo                                  │
│  src/formatter.js  ← new: reads Notion JSON, outputs │
│                       compact task summary           │
│  src/digestService.js ← unchanged: scoring/bucketing │
│  src/config.js        ← unchanged                   │
└─────────────────────────────────────────────────────┘
        ↑                          ↑
        │ git checkout             │ Notion MCP
        │                          │
┌───────────────┐        ┌─────────────────────┐
│ Morning Agent │        │ Evening Agent        │
│ 9am PDT cron  │        │ 7pm PDT cron         │
│ (remote CCR)  │        │ (remote CCR)         │
└───────────────┘        └─────────────────────┘
        │                          │
        ↓                          ↓
  Discord webhook             Discord webhook
  "Here's your day"           "Here's what's left"

+ On-demand Claude Code sessions (Notion MCP direct)
```

---

## Components

### 1. `src/formatter.js` (new)

**What it does:** Reads raw Notion MCP query output from stdin, runs it through the existing `preprocessTask` + `scoreTask` + bucketing logic from `digestService.js`, and outputs a compact plain-text summary.

**Why:** Raw Notion MCP responses are ~300–500 tokens per task. With 20 tasks that's up to 10,000 tokens of input. The formatter compresses this to ~25 tokens per task (~500 tokens total) — a 10–20x reduction. Claude reasons over the compact output, not the raw JSON.

**Output format:**
```
OVERDUE (1):
- Fix auth bug | p0 | 3d late | Backend | 45min

DUE TODAY (2):
- Paper submission | p1 | due today | Research | 120min [HARD DEADLINE]
- Team sync prep | p2 | due today | Work | 20min

DUE SOON (3):
- Job application follow-up | p2 | due in 2d | Job Search | 30min
...
```

Hard deadline detection: the formatter checks for a `Hard Deadline` checkbox property on each Notion task. If checked, the task is flagged `[HARD DEADLINE]` in the output. The agent prompt instructs Claude to treat these as immovable. No keyword inference — explicit checkbox only.

**Interface:** Reads JSON array of Notion pages from stdin, writes compact text to stdout. No API keys required — auth is handled upstream by the MCP caller.

```bash
# Usage by remote agent:
echo "$NOTION_PAGES_JSON" | node src/formatter.js
```

### 2. Morning Remote Agent

**Schedule:** `0 16 * * *` (9am PDT / 16:00 UTC)

**What it does:**
1. Queries Notion MCP for all open tasks (status ≠ done, due within 14 days or overdue)
2. Fetches today's Google Calendar events
3. Pipes Notion output through `node src/formatter.js` for compression
4. Reasons over compact summary + calendar: identifies hard deadlines, assesses capacity, picks top 3 focus tasks
5. Posts morning plan to Discord webhook

**Output:** A concise Discord message:
```
MORNING PLAN — Apr 2

🔴 MUST DO (hard deadlines):
1. Paper submission — due today, cannot defer

🎯 FOCUS (top 3):
1. Paper submission
2. Job application follow-up
3. Fix auth bug

⏱ CAPACITY: 3 meetings today (~4h blocked). Tight — defer anything not in top 3.
```

**MCP connections:** Notion, Google Calendar

### 3. Evening Remote Agent

**Schedule:** `0 2 * * *` (7pm PDT / 02:00 UTC next day)

**What it does:**
1. Queries Notion for tasks that were due today and are still open
2. Pipes through formatter
3. Reasons: hard deadlines not completed → escalate with urgency flag. Soft tasks → reschedule to tomorrow
4. Posts evening sweep to Discord

**Output:**
```
EVENING SWEEP — Apr 2

✅ Done today: 2 tasks

⚠️ STILL OPEN:
- Paper submission ← NOT DONE. Hard deadline. Act now or first thing tomorrow.
- Team sync prep ← moved to tomorrow

📋 Tomorrow's top priority: Paper submission (flagged urgent)
```

**MCP connections:** Notion

### 4. On-Demand Cowork (no new build)

Claude Code sessions with Notion MCP handle all interactive task management:
- "Add these tasks: ..." → `mcp__claude_ai_Notion__notion-create-pages`
- "Look at this spreadsheet and create follow-up tasks" → paste/attach, Claude creates tasks
- "What should I focus on right now?" → Claude reads Notion, reasons, responds

No commands to remember. Just chat in Claude Code.

---

## Data Flow

```
Morning Agent:
  Notion MCP query
    → raw JSON (10k tokens)
    → node src/formatter.js
    → compact text (500 tokens)
    → Claude reasons (Haiku/Sonnet)
    → Discord POST

Evening Agent:
  Notion MCP query (filter: due_date = today, status ≠ done)
    → node src/formatter.js
    → compact text
    → Claude reasons
    → Discord POST
```

---

## What Gets Removed

| File | Status |
|------|--------|
| `.github/workflows/notion-digest.yml` | Deleted |
| `src/discordBotService.js` | Deleted |
| `src/botActions.js` | Deleted |
| `src/botStateStore.js` | Deleted |
| `src/index.js` | Simplified or replaced |
| `test/botActions.test.js` | Deleted |

Files retained and reused:
- `src/digestService.js` — preprocessing + scoring logic reused by formatter
- `src/config.js` — property name mappings reused
- `src/logger.js` — retained

---

## Hard Deadline Detection

Add a `Hard Deadline` checkbox property to the Notion task database. The formatter reads this property and flags any checked task as `[HARD DEADLINE]` in the compact output.

The agent prompt explicitly instructs Claude: tasks marked `[HARD DEADLINE]` must appear in the top focus list regardless of score, and must not be silently deferred in the evening sweep — they get an escalation flag instead.

No keyword inference. Explicit checkbox only — keeps it reliable regardless of task naming conventions.

---

## Error Handling

- If Notion MCP query fails: agent logs error and exits without posting (no broken messages)
- If formatter produces empty output: agent posts a brief "no tasks found" message
- If Discord webhook fails: agent retries once, then exits
- If Google Calendar is unavailable: morning agent proceeds without capacity section

---

## Token Budget (per run)

| Component | Estimated tokens |
|-----------|-----------------|
| System prompt + agent instructions | ~500 |
| Formatted task summary (20 tasks) | ~500 |
| Calendar summary | ~200 |
| Output (Discord message) | ~300 |
| **Total per run** | **~1,500** |

At Haiku pricing this is ~$0.0004/run, ~$0.03/month. Negligible on Pro plan.

---

## Open Questions / Future Work

- Connect Google Calendar MCP at https://claude.ai/settings/connectors before creating morning agent
- Add `Hard Deadline` checkbox property to the Notion task database before first run
- Agent prompts will need tuning after first few runs — start with Haiku (token-efficient), upgrade to Sonnet if output quality needs improvement
- Could add a `src/docs/cowork-guide.md` describing patterns for on-demand sessions (job search spreadsheet, bulk task import, etc.)
