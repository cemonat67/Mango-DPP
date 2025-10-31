#!/usr/bin/env bash
set -euo pipefail
H=db.xkuglfawnyymkcrgbeks.supabase.co
OUT=dns_pg_check.out
: > "$OUT"

{
  echo "== Host: $H"
  echo "== date: $(date)"
  echo "---- dig (default)"
  dig +noall +answer "$H" || true
  echo "---- dig @8.8.8.8"
  dig +noall +answer "$H" @8.8.8.8 || true
  echo "---- dig @1.1.1.1"
  dig +noall +answer "$H" @1.1.1.1 || true

  echo "---- Python getaddrinfo(5432)"
  python3 - <<PY || true
import socket
print(socket.getaddrinfo("$H", 5432))
PY

  echo "---- openssl s_client (TLS handshake to 5432)"
  # Postgres TLS el sıkışması sertifikayı gösterir; çıkışı kısaltıyoruz
  echo | openssl s_client -connect "$H:5432" -servername "$H" 2>/dev/null | \
    awk 'NR<=40 || /BEGIN CERTIFICATE/ || /END CERTIFICATE/'

  echo "---- psql select version() (DB_URL gerek)"
  if [ -n "${DB_URL:-}" ]; then
    psql "$DB_URL" -c "select version();" 2>&1 | sed -n '1,12p' || true
  else
    echo "DB_URL not set"
  fi
} >> "$OUT"

echo "Wrote: $OUT"