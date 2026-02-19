SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.PHONY: help up down logs ps reset demo keys prod-up prod-down prod-logs

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
	@./bin/loramapr keys

prod-up:
	@./bin/loramapr prod-up

prod-down:
	@./bin/loramapr prod-down

prod-logs:
	@./bin/loramapr prod-logs
