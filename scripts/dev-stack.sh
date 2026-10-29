#!/usr/bin/env bash
# Starts (or restarts) the whole stack locally WITHOUT Docker, against a Postgres you already run.
# Used for development and for running the Playwright tests by hand.
#
#   scripts/dev-stack.sh          # build + start core-api :8080, insights :4000, web preview :4173
#   scripts/dev-stack.sh stop     # stop all three
#
# Needs: Java 21 + Maven, Node 22, Postgres with a database named "trackly".
# Override the database with DATABASE_URL=postgres://user:pass@host:5432/trackly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="${LOGS:-$ROOT/.dev-logs}"
export DATABASE_URL="${DATABASE_URL:-postgres://postgres:postgres@localhost:5432/trackly}"

stop() {
  for port in 8080 4000 4173; do fuser -k "$port/tcp" >/dev/null 2>&1 || true; done
}

wait_for() { # url, seconds
  for _ in $(seq 1 "$2"); do curl -sf "$1" >/dev/null && return 0; sleep 1; done
  echo "Timed out waiting for $1 (see $LOGS)" >&2
  return 1
}

if [[ "${1:-}" == "stop" ]]; then stop; echo "stopped"; exit 0; fi

stop
mkdir -p "$LOGS"

echo "Building core-api..."
(cd "$ROOT/services/core-api" && mvn -B -ntp -q -DskipTests package)
echo "Building insights..."
(cd "$ROOT/services/insights" && npm ci --no-audit --no-fund --silent && npm run build --silent)
echo "Building web..."
(cd "$ROOT/apps/web" && npm ci --no-audit --no-fund --silent && npm run build --silent)

INSIGHTS_URL=http://localhost:4000 nohup java -XX:TieredStopAtLevel=1 \
  -jar "$ROOT/services/core-api/target/core-api.jar" > "$LOGS/core-api.log" 2>&1 &
wait_for http://localhost:8080/actuator/health 120

(cd "$ROOT/services/insights" && PORT=4000 nohup node dist/index.js > "$LOGS/insights.log" 2>&1 &)
wait_for http://localhost:4000/health 60

(cd "$ROOT/apps/web" && nohup npx vite preview --host 127.0.0.1 --port 4173 --strictPort > "$LOGS/web.log" 2>&1 &)
wait_for http://127.0.0.1:4173 60

echo "Ready: web http://127.0.0.1:4173  core http://localhost:8080/swagger-ui.html  insights http://localhost:4000/health"
