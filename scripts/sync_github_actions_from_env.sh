#!/usr/bin/env bash
set -euo pipefail

# Sync selected keys from a local .env file to GitHub Actions secrets/variables.
#
# Usage:
#   ./scripts/sync_github_actions_from_env.sh [owner/repo] [path/to/.env]
#
# Examples:
#   ./scripts/sync_github_actions_from_env.sh
#   ./scripts/sync_github_actions_from_env.sh my-org/notion-digest .env

REPO="${1:-}"
ENV_FILE="${2:-.env}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is not installed."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found at '$ENV_FILE'"
  exit 1
fi

if [[ -n "$REPO" ]]; then
  gh repo set-default "$REPO" >/dev/null
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login"
  exit 1
fi

SECRET_KEYS=(
  NOTION_API_KEY
  NOTION_DATABASE_ID
  DISCORD_WEBHOOK_URL
  SLACK_WEBHOOK_URL
  GEMINI_API_KEY
  GOOGLE_CLIENT_EMAIL
  GOOGLE_PRIVATE_KEY
  GOOGLE_CALENDAR_ID
)

VARIABLE_KEYS=(
  NOTIFIER
  ENABLE_AI_SUMMARY
  GEMINI_MODEL
  AI_SUMMARY_WINDOW_DAYS
  AI_SUMMARY_MAX_TASKS
  NOTION_TASK_PROP
  NOTION_PRIORITY_PROP
  NOTION_STATUS_PROP
  NOTION_DUE_PROP
  NOTION_DONE_CHECKBOX_PROP
  NOTION_PROJECT_PROP
  NOTION_ESTIMATED_MINUTES_PROP
  NOTION_CREATED_TIME_PROP
  NOTION_LAST_EDITED_PROP
  HIGH_PRIORITY_VALUES
  CLOSED_STATUS_VALUES
  DUE_WINDOW_DAYS
  DUE_SOON_DAYS
  W_PRIORITY
  W_DUE
  W_STALE
  OVERDUE_BOOST
  STALENESS_CAP_DAYS
  TOP3_MAX_PER_PROJECT
  DEFAULT_ESTIMATED_MINUTES
  WORKDAY_START_HOUR
  WORKDAY_END_HOUR
  FOCUS_BUFFER_MINUTES
  MAX_SLACK_LINES
  MAX_TASKS_PER_SECTION
  TIMEZONE
  MORNING_HOUR_LOCAL
  EVENING_HOUR_LOCAL
)

is_in_list() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

strip_outer_quotes() {
  local v="$1"
  if [[ "${#v}" -ge 2 ]]; then
    local first="${v:0:1}"
    local last="${v: -1}"
    if [[ ( "$first" == "\"" && "$last" == "\"" ) || ( "$first" == "'" && "$last" == "'" ) ]]; then
      printf '%s' "${v:1:${#v}-2}"
      return
    fi
  fi
  printf '%s' "$v"
}

secrets_set=0
vars_set=0
skipped=0

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="${raw_line%$'\r'}"
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  line="${line#export }"

  if [[ "$line" != *"="* ]]; then
    continue
  fi

  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
  value="$(strip_outer_quotes "$value")"

  if [[ -z "$key" ]]; then
    continue
  fi

  if is_in_list "$key" "${SECRET_KEYS[@]}"; then
    if [[ -n "$value" ]]; then
      gh secret set "$key" --body "$value" >/dev/null
      echo "set secret: $key"
      secrets_set=$((secrets_set + 1))
    else
      echo "skip empty secret: $key"
      skipped=$((skipped + 1))
    fi
    continue
  fi

  if is_in_list "$key" "${VARIABLE_KEYS[@]}"; then
    if [[ -n "$value" ]]; then
      gh variable set "$key" --body "$value" >/dev/null
      echo "set variable: $key"
      vars_set=$((vars_set + 1))
    else
      echo "skip empty variable: $key"
      skipped=$((skipped + 1))
    fi
    continue
  fi
done < "$ENV_FILE"

echo
echo "Done."
echo "Secrets set:   $secrets_set"
echo "Variables set: $vars_set"
echo "Skipped:       $skipped"
