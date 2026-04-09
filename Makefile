SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

PYTHON_TOOLS_VENV := .venv-pytools
PYTHON_TOOLS_PY := $(PYTHON_TOOLS_VENV)/bin/python

.PHONY: help up down logs ps reset demo keys prod-up prod-down prod-logs wait-ready check backup restore py-tools-install py-lint-ruff py-lint-ruff-fix py-deadcode-vulture py-deadcode

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  up      Start docker compose stack"
	@echo "  down    Stop docker compose stack"
	@echo "  logs    Tail docker compose logs"
	@echo "  ps      Show docker compose services"
	@echo "  reset   Stop stack and remove volumes (destructive)"
	@echo "  demo    Seed demo data if available"
	@echo "  keys    Generate QUERY/INGEST secrets in .env if missing"
	@echo "  prod-up    Start production compose stack"
	@echo "  prod-down  Stop production compose stack"
	@echo "  prod-logs  Tail production compose logs"
	@echo "  wait-ready Wait until API readiness is healthy"
	@echo "  check      Fast non-destructive stack health check"
	@echo "  backup     Run DB backup (optional: OUTPUT=backups/name.sql.gz)"
	@echo "  restore    Run DB restore (requires BACKUP_FILE=...)"
	@echo "  py-tools-install   Install Python lint/dead-code tools"
	@echo "  py-lint-ruff       Run Ruff (unused imports/variables and F-series lint)"
	@echo "  py-lint-ruff-fix   Run Ruff autofix for safe fixes"
	@echo "  py-deadcode-vulture Run Vulture dead-code scan"
	@echo "  py-deadcode        Run Ruff then Vulture"
	@echo ""
	@echo "Examples:"
	@echo "  make backup OUTPUT=backups/test.sql.gz"
	@echo "  COMPOSE_FILE=docker-compose.prod.yml make backup"
	@echo "  COMPOSE_FILE=docker-compose.prod.yml make restore BACKUP_FILE=backups/file.sql.gz DROP_FIRST=1"

up:
	@./bin/loramapr up

down:
	@./bin/loramapr down

logs:
	@./bin/loramapr logs

ps:
	@./bin/loramapr ps

reset:
	@./bin/loramapr reset

demo:
	@./bin/loramapr demo

keys:
	@./scripts/setup/generate-secrets.sh

prod-up:
	@./bin/loramapr prod-up

prod-down:
	@./bin/loramapr prod-down

prod-logs:
	@./bin/loramapr prod-logs

wait-ready:
	@./bin/loramapr wait-ready

check:
	@./bin/loramapr check

backup:
	@./bin/loramapr backup $(if $(OUTPUT),$(OUTPUT),)

restore:
	@./bin/loramapr restore $(if $(DROP_FIRST),--drop-first,) $(if $(NO_STOP_API),--no-stop-api,) $(BACKUP_FILE)

py-tools-install:
	@test -x $(PYTHON_TOOLS_PY) || python3 -m venv $(PYTHON_TOOLS_VENV)
	@$(PYTHON_TOOLS_PY) -m pip install -r requirements-python-tools.txt

py-lint-ruff:
	@test -x $(PYTHON_TOOLS_PY) || (echo "Missing $(PYTHON_TOOLS_VENV). Run: make py-tools-install" && exit 1)
	@$(PYTHON_TOOLS_PY) -m ruff check .

py-lint-ruff-fix:
	@test -x $(PYTHON_TOOLS_PY) || (echo "Missing $(PYTHON_TOOLS_VENV). Run: make py-tools-install" && exit 1)
	@$(PYTHON_TOOLS_PY) -m ruff check . --fix

py-deadcode-vulture:
	@test -x $(PYTHON_TOOLS_PY) || (echo "Missing $(PYTHON_TOOLS_VENV). Run: make py-tools-install" && exit 1)
	@$(PYTHON_TOOLS_PY) -m vulture

py-deadcode:
	@$(MAKE) py-lint-ruff
	@$(MAKE) py-deadcode-vulture
