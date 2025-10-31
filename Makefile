VENV ?= .venv
PY    := $(VENV)/bin/python
PIP   := $(VENV)/bin/pip
UVICORN := $(VENV)/bin/uvicorn

APP=main:app
PORT?=5000
HOST?=0.0.0.0

.PHONY: setup dev health report stop

setup:
	@if [ ! -x "$(VENV)/bin/activate" ]; then python3 -m venv $(VENV); fi
	$(PY) -m pip install --upgrade pip
	$(PIP) install -r requirements.txt

dev: setup
	-kill -9 $$(lsof -ti :$(PORT)) 2>/dev/null || true
	$(UVICORN) $(APP) --host $(HOST) --port $(PORT) --reload

health:
	curl -sS http://127.0.0.1:$(PORT)/health | jq

report:
	@if [ -z "$(PRODUCT_ID)" ]; then \
		echo "⛔ Kullanım: make report PRODUCT_ID=ZAD-123"; exit 1; \
	fi
	curl -sS -X POST http://127.0.0.1:$(PORT)/ai/product-report \
	  -H "Content-Type: application/json" \
	  -d '{"product_id":"$(PRODUCT_ID)"}' | jq

stop:
	-kill -9 $$(lsof -ti :$(PORT)) 2>/dev/null || true
