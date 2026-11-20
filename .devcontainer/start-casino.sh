#!/usr/bin/env bash
# Startet das Casino im Online-Modus und gibt den Link für Freunde frei.
cd "$(dirname "$0")/.." || exit 1

# Bereits laufenden Server nicht doppelt starten
if ! pgrep -f "node server/index.js --online" > /dev/null; then
  [ -d node_modules/express ] || npm ci --omit=dev
  setsid nohup node server/index.js --online > /tmp/casino.log 2>&1 < /dev/null &
fi

# Port 3000 öffentlich machen, damit Freunde ohne GitHub-Konto den Link öffnen können
if [ -n "$CODESPACE_NAME" ] && command -v gh > /dev/null; then
  for i in $(seq 1 20); do
    if gh codespace ports visibility 3000:public -c "$CODESPACE_NAME" > /dev/null 2>&1; then
      echo "Port 3000 ist öffentlich."
      break
    fi
    sleep 3
  done
fi

if [ -n "$CODESPACE_NAME" ]; then
  echo ""
  echo "=============================================="
  echo " Spass-Casino laeuft!"
  echo " Link fuer dich und deine Freunde:"
  echo " https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  echo "=============================================="
fi
