#!/bin/sh
set -eu
export SUPABASE_URL="${SUPABASE_URL:-}" SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
export RENDER_URL="${RENDER_URL:-}"
case "$RENDER_URL" in *[!a-zA-Z0-9_:/.-]*) echo 'Invalid render URL' >&2; exit 1;; esac
export TRANSCRIPTION_URL="${TRANSCRIPTION_URL:-}"
case "$TRANSCRIPTION_URL" in *[!a-zA-Z0-9_:/.-]*) echo 'Invalid transcription URL' >&2; exit 1;; esac
export AUTH_EMAIL_ENABLED="${AUTH_EMAIL_ENABLED:-false}"
export BILLING_ENABLED="${BILLING_ENABLED:-false}"
case "$BILLING_ENABLED" in true|false) ;; *) echo 'Invalid billing setting' >&2; exit 1;; esac
case "$AUTH_EMAIL_ENABLED" in true|false) ;; *) echo 'Invalid email setting' >&2; exit 1;; esac
# Only public client configuration. Reject characters that can escape the JavaScript string.
case "$SUPABASE_URL" in *[!a-zA-Z0-9_:/.-]*) echo 'Invalid Supabase URL' >&2; exit 1;; esac
case "$SUPABASE_ANON_KEY" in *[!a-zA-Z0-9_.-]*|sb_secret_*) echo 'Invalid public Supabase key' >&2; exit 1;; esac
case "$SUPABASE_ANON_KEY" in
  ''|sb_publishable_*) ;;
  *.*.*)
    payload=$(printf '%s' "$SUPABASE_ANON_KEY" | cut -d. -f2 | tr '_-' '/+')
    case $((${#payload} % 4)) in 2) payload="${payload}==";; 3) payload="${payload}=";; esac
    if ! printf '%s' "$payload" | base64 -d 2>/dev/null | grep -Eq '"role"[[:space:]]*:[[:space:]]*"anon"'; then
      echo 'The browser requires a public anon key' >&2; exit 1
    fi
    ;;
  *) echo 'The browser requires a public Supabase key' >&2; exit 1;;
esac
envsubst '${RENDER_URL} ${TRANSCRIPTION_URL} ${SUPABASE_URL} ${SUPABASE_ANON_KEY} ${AUTH_EMAIL_ENABLED} ${BILLING_ENABLED}' < /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js
