# Task Triage System — Features

## Overview

Daily automated task triage system.

**Inputs**

* Notion tasks (next 7 days + overdue)
* Google Calendar (today only)

**Outputs**

* Ranked task list
* Top 3 focus tasks
* Capacity check
* Structured Slack message

System is deterministic. No behavioral modeling. No adaptive heuristics.

---

# 1. Task Ingestion

## 1.1 Notion Query

Pull tasks with:

* Status ≠ Done
* Due date within next 7 days OR overdue

Required fields:

* `id`
* `title`
* `priority` (1–5)
* `due_date`
* `project`
* `estimated_minutes`
* `last_edited_time`

---

# 2. Task Preprocessing

For each task compute:

* `due_in_days`
* `days_since_last_touch`
* `is_overdue`

---

# 3. Scoring Function

## 3.1 Normalizations

P(p) = p / 5

D(d) = 1 / (d + 1)

S(s) = log(1 + s)

---

## 3.2 Final Score

score = 0.5P + 0.35D + 0.15S

If overdue:

* Float to top bucket or apply fixed boost.

---

# 4. Bucketing

Tasks categorized into:

* `overdue`
* `due_today`
* `due_soon` (1–3 days)
* `later` (4–7 days)

Sort within bucket by score (descending).

Bucket precedence:

1. overdue
2. due_today
3. due_soon
4. later

---

# 5. Top 3 Selection

Greedy selection:

* Walk sorted list
* Select first 3 tasks
* Constraint:

  * Avoid selecting more than 2 from same project if possible

Output:

* `top_3_task_ids`

---

# 6. Google Calendar Capacity Module

## 6.1 Pull Today’s Events

Exclude:

* All-day events
* Declined events

Define work window (configurable):

* Default: 9:00–18:00

---

## 6.2 Compute Free Time

free_minutes = work_window - sum(event_durations)

---

## 6.3 Compute Required Time

required_minutes = sum(estimated_minutes_for_top_3)

---

## 6.4 Capacity Classification

If required <= free → balanced_day
If required > free → constrained_day

---

# 7. Slack Output Format

```
DAILY TRIAGE — {date}

⚠ OVERDUE ({n})
• Task A (Xd late)

🔥 DUE SOON ({n})
• Task B — due tomorrow
• Task C — due in 2d

🎯 TODAY — TOP 3
1. Task X
2. Task Y
3. Task Z

⏱ CAPACITY
Free: 3h 20m
Planned: 4h 10m
Status: CONSTRAINED

→ Suggested defer: {lowest_score_task}
```

Rules:

* Omit empty sections.
* Keep under ~15 lines.
* No motivational text.

---

# 8. Logging

Daily JSON log entry:

```json
{
  "date": "...",
  "num_tasks": 12,
  "num_overdue": 1,
  "num_due_soon": 3,
  "top_3_ids": [...],
  "free_minutes": 210,
  "required_minutes": 280,
  "day_status": "constrained"
}
```

Purpose:

* Observability
* Debugging scoring
* Future extensibility

---

# 9. Configuration

Configurable parameters:

* Workday start/end
* Weights (w_p, w_d, w_s)
* Due-soon window (default: 3 days)
* Max tasks in Slack output
* Project diversity constraint

---

# Non-Goals (v1)

* No adaptive learning
* No productivity coaching
* No automatic calendar blocking
* No LLM reasoning layer
