SHELL := /bin/bash
ROOT := $(CURDIR)
PYTHON := $(ROOT)/.venv/bin/python
PIP := $(ROOT)/.venv/bin/pip

.PHONY: help setup setup-rmbg weights palettes dev-backend dev-frontend test test-backend test-frontend build docker-up docker-down docker-logs clean

help:
	@echo "Targets:"
	@echo "  setup          Create .venv, install backend + frontend dependencies"
	@echo "  setup-rmbg     Install optional RMBG-2.0 dependencies into .venv"
	@echo "  weights        Download Pixelization weights (~178 MB)"
	@echo "  palettes       Regenerate the frontend palette bundle"
	@echo "  dev-backend    Run FastAPI on http://127.0.0.1:8000"
	@echo "  dev-frontend   Run Vite on http://localhost:5173"
	@echo "  test           Backend tests, frontend tests and typecheck"
	@echo "  build          Production frontend build"
	@echo "  docker-up      Build and start backend + frontend (port 8080)"
	@echo "  docker-down    Stop the Compose stack"

setup:
	test -d .venv || python3 -m venv .venv
	$(PIP) install --upgrade pip
	$(PIP) install -r backend/requirements-dev.txt
	cd frontend && npm ci --no-audit --no-fund

setup-rmbg:
	$(PIP) install -r backend/requirements-rmbg.txt

weights:
	bash scripts/download-weights.sh

palettes:
	node scripts/build-palettes.mjs

dev-backend:
	cd backend && $(PYTHON) -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend:
	cd frontend && npm run dev

test-backend:
	cd backend && $(PYTHON) -m pytest -q

test-frontend:
	cd frontend && npm test && npm run typecheck

test: test-backend test-frontend

build:
	cd frontend && npm run build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=100

clean:
	rm -rf frontend/dist frontend/node_modules/.vite
	find backend -type d -name __pycache__ -prune -exec rm -rf {} +
