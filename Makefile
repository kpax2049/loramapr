SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: help up down logs ps reset demo keys prod-up prod-down prod-logs wait-ready check backup restore

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
