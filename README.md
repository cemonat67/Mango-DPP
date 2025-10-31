# Zero@Design API — v0.3.4

FastAPI tabanlı ürün raporu servisi. Bu sürümde:
- `main.py (v0.3.4)` güncellendi
- Makefile ile tek komutla çalıştırma (`make dev`, `make report PRODUCT_ID=...`)
- Supabase için **RLS + anon** okuma politikası örnekleri
- PDF çıktısını **Storage**’a yazıp **signed URL** döndürme akışı (opsiyonel)
- /ai/product-report hata mesajlarında “ürün yok / weight yok” ayrımı

## Kurulum

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env