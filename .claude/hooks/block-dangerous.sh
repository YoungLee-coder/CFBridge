#!/bin/bash
# Block dangerous commands before they execute.
# Invoked by .claude/settings.json as a PreToolUse hook on Bash.
# Stdin is the Claude Code hook payload (JSON).
# Exit 0 → allow the command. Exit 2 → block it (shown to user).
#
# Generic by design: checks for universally dangerous patterns regardless
# of language or framework. No project-specific edits required.

set -u

# Need jq to read the payload. No jq → allow everything (can't evaluate).
command -v jq > /dev/null 2>&1 || exit 0

COMMAND=$(jq -r '.tool_input.command // empty' 2> /dev/null || true)
[[ -z "$COMMAND" ]] && exit 0

# --- Patterns that are ALWAYS dangerous ---
# Each pattern is a regex; if the command matches, block it.

DANGER_PATTERNS=(
  # System destruction
  'rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+|.*--no-preserve-root\s+)/(\s|$)'
  'rm\s+-rf\s+/'
  ':(){ :\|:& };:'                        # fork bomb

  # Force push to main/default branches
  'git\s+push\s+.*--force\s+.*(origin\s+)?(main|master)'
  'git\s+push\s+.*-f\s+.*(origin\s+)?(main|master)'
  'git\s+push\s+--force-with-lease\s+.*(origin\s+)?(main|master)'

  # Database destruction
  'DROP\s+(DATABASE|SCHEMA|TABLE)\s+(?!IF\s+EXISTS)'

  # Credential/secret exposure
  'curl\s+.*-u\s+.*:.*\s+.*>(\s|$)'     # curl with credentials piped to file
  'aws\s+s3\s+.*--public'                 # public S3 bucket

  # Irreversible network changes
  'iptables\s+.*-F'                       # flush all firewall rules
  'route\s+.*del\s+default'

  # chmod/chown to wide permissions on system dirs
  'chmod\s+(777|666|a+rwx)\s+/(etc|usr|var|root|bin|sbin)'

  # Kill all processes
  'kill\s+-9\s+1\b'                       # kill PID 1 (init)
  'killall\s+-9'
)

for pattern in "${DANGER_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: command matches dangerous pattern: $pattern"
    echo "Command: $COMMAND"
    echo "If you really need to run this, bypass the hook manually."
    exit 2
  fi
done

# --- Allow everything else ---
exit 0
