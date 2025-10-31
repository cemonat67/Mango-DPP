#!/usr/bin/env bash
# smoke_e2e.sh — Zero@Design end-to-end smoke test
# Usage: set -x; ./smoke_e2e.sh | tee smoke_e2e.out

set -Eeuo pipefail
set +H  # Disable history expansion to avoid issues with '!'

# -----------------------------
# Helpers
# -----------------------------
log_info()  { echo "[INFO] $*"; }
log_warn()  { echo "[WARN] $*"; }
log_pass()  { echo "[PASS] $*"; }
log_fail()  { echo "[FAIL] $*"; }
log_skip()  { echo "[SKIP] $*"; }

DB_DNS="SKIP"
DB_CONNECT="SKIP"
DB_SCHEMA="SKIP"
DB_FUNC_CHECK="SKIP"
API_WHATIF="SKIP"
API_QUERY="SKIP"

API_PID=""

print_summary() {
  echo ""; echo "===== SMOKE SUMMARY ====="
  echo "DB_DNS:        $DB_DNS"
  echo "DB_CONNECT:    $DB_CONNECT"
  echo "DB_SCHEMA:     $DB_SCHEMA"
  echo "DB_FUNC_CHECK: $DB_FUNC_CHECK"
  echo "API_WHATIF:    $API_WHATIF"
  echo "API_QUERY:     $API_QUERY"
  echo "========================="
}

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    log_info "Stopping uvicorn PID=$API_PID"
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
}

trap 'cleanup; print_summary' EXIT

# -----------------------------
# Env vars check
# -----------------------------
REQUIRED_VARS=(DB_URL SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY OPENAI_API_KEY)
for v in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    log_warn "Env var $v is not set."
  fi
done

# -----------------------------
# Tool availability
# -----------------------------
for tool in dig nslookup psql curl python3; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    log_warn "Tool not found: $tool"
  fi
done

# Extract host from DB_URL for DNS checks (best-effort)
DB_HOST=""
if [[ -n "${DB_URL:-}" ]]; then
  DB_HOST=$(echo "$DB_URL" | sed -E 's#^[a-zA-Z0-9+.-]+://([^@]+@)?([^:/]+).*#\2#') || true
fi

# -----------------------------
# DNS / connectivity pre-checks
# -----------------------------
if [[ -n "$DB_HOST" ]]; then
  log_info "DNS check for host: $DB_HOST"
  if command -v dig >/dev/null 2>&1; then
    DIG_OUT=$(dig +short "$DB_HOST" || true)
    if [[ -n "$DIG_OUT" ]]; then
      log_pass "dig resolved $DB_HOST -> $DIG_OUT"
      DB_DNS="PASS"
    else
      log_warn "dig could not resolve $DB_HOST; trying Cloudflare (1.1.1.1)"
      DIG_CF=$(dig +short "$DB_HOST" @1.1.1.1 || true)
      if [[ -n "$DIG_CF" ]]; then
        log_pass "dig@1.1.1.1 resolved $DB_HOST -> $DIG_CF"
        DB_DNS="PASS"
      else
        log_fail "DNS resolution failed for $DB_HOST (both local and 1.1.1.1)."
        DB_DNS="FAIL"
      fi
    fi
  elif command -v nslookup >/dev/null 2>&1; then
    NS_OUT=$(nslookup "$DB_HOST" 2>/dev/null || true)
    if echo "$NS_OUT" | grep -qiE 'Address|Non-authoritative'; then
      log_pass "nslookup returned records for $DB_HOST"
      DB_DNS="PASS"
    else
      log_fail "nslookup failed to resolve $DB_HOST"
      DB_DNS="FAIL"
    fi
  else
    log_skip "Neither dig nor nslookup available; skipping DNS check"
    DB_DNS="SKIP"
  fi
else
  log_skip "DB_URL not set; skipping DNS check"
fi

# -----------------------------
# DB connectivity and schema
# -----------------------------
PSQL_OPTS=(-X -v ON_ERROR_STOP=1)
if [[ -n "${DB_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  log_info "Checking DB connectivity with psql select version()"
  if psql "$DB_URL" "${PSQL_OPTS[@]}" -c "select version();" >/dev/null 2>&1; then
    log_pass "DB connection OK (select version())"
    DB_CONNECT="PASS"
  else
    log_fail "DB connection failed (psql select version())."
    DB_CONNECT="FAIL"
  fi
else
  log_skip "DB_URL not set or psql missing; skipping DB connectivity"
fi

# Apply schema if file exists; otherwise skip
if [[ -n "${DB_URL:-}" ]] && [[ "$DB_CONNECT" == "PASS" ]]; then
  SCHEMA_FILE="supabase_setup.sql"
  if [[ -f "$SCHEMA_FILE" ]]; then
    log_info "Applying schema from $SCHEMA_FILE"
    if psql "$DB_URL" "${PSQL_OPTS[@]}" -f "$SCHEMA_FILE" >/dev/null 2>&1; then
      log_pass "Schema applied from $SCHEMA_FILE"
      DB_SCHEMA="PASS"
    else
      log_fail "Schema application failed"
      DB_SCHEMA="FAIL"
    fi
  else
    log_skip "$SCHEMA_FILE not found; skipping schema application"
    DB_SCHEMA="SKIP"
  fi
fi

# Check estimate_fabric_co2 function existence (no-op if not present)
if [[ -n "${DB_URL:-}" ]] && [[ "$DB_CONNECT" == "PASS" ]]; then
  log_info "Checking if function estimate_fabric_co2 exists"
  if psql "$DB_URL" -t -A "${PSQL_OPTS[@]}" -c "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname='estimate_fabric_co2');" | grep -q '^t$'; then
    log_pass "estimate_fabric_co2 function exists"
    DB_FUNC_CHECK="PASS"
  else
    log_warn "estimate_fabric_co2 function not found"
    DB_FUNC_CHECK="FAIL"
  fi
else
  log_skip "Skipping function check due to DB connectivity not passing"
fi

# -----------------------------
# API smoke (optional)
# -----------------------------
UVICORN_APP=""
if [[ -f "app/main.py" ]]; then
  UVICORN_APP="app.main:app"
elif [[ -f "main.py" ]]; then
  UVICORN_APP="main:app"
fi

if [[ -n "$UVICORN_APP" ]]; then
  if python3 -c "import uvicorn" >/dev/null 2>&1; then
    log_info "Starting API with uvicorn ($UVICORN_APP)"
    uvicorn "$UVICORN_APP" --host 127.0.0.1 --port 8000 &
    API_PID=$!
    log_info "Uvicorn PID=$API_PID; waiting for server to be ready"

    READY=0
    for i in {1..20}; do
      if curl -sSf --max-time 1 "http://127.0.0.1:8000/docs" >/dev/null 2>&1; then
        READY=1
        break
      fi
      sleep 0.5
    done

    if [[ $READY -eq 1 ]]; then
      log_pass "API is up"
      # WHATIF endpoint
      if curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:8000/ai/whatif" | grep -qE "^(200|201)$"; then
        log_pass "GET /ai/whatif responded 200/201"
        API_WHATIF="PASS"
      else
        log_fail "GET /ai/whatif did not respond 200/201"
        API_WHATIF="FAIL"
      fi
      # QUERY endpoint
      if curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://127.0.0.1:8000/ai/query" | grep -qE "^(200|201)$"; then
        log_pass "GET /ai/query responded 200/201"
        API_QUERY="PASS"
      else
        log_fail "GET /ai/query did not respond 200/201"
        API_QUERY="FAIL"
      fi
    else
      log_fail "API did not become ready in time"
      API_WHATIF="FAIL"; API_QUERY="FAIL"
    fi
  else
    log_skip "uvicorn not installed; skipping API smoke"
  fi
else
  log_skip "app/main.py or main.py not found; skipping API smoke"
fi

# Summary and cleanup will run via trap