SHELL := /bin/bash

.PHONY: help docker-build docker-up docker-down docker-restart docker-logs docker-shell docker-sync-codex-home docker-clean docker-ps docker-dev-check

help:
	@echo "Targets:"
	@echo "  docker-build      Build the Docker dev image"
	@echo "  docker-up         Start Docker dev environment (foreground)"
	@echo "  docker-down       Stop Docker dev environment"
	@echo "  docker-restart    Restart Docker dev environment in background"
	@echo "  docker-logs       Follow Docker dev logs"
	@echo "  docker-shell      Open shell in running Docker dev container"
	@echo "  docker-sync-codex-home  Copy host CODEX_HOME into running dev container"
	@echo "  docker-clean      Stop environment and remove named volumes"
	@echo "  docker-ps         Show compose service status"
	@echo "  docker-dev-check  Run fmt/lint/typecheck in the container"

docker-build:
	./scripts/dev-in-docker.sh build

docker-up:
	./scripts/dev-in-docker.sh up

docker-down:
	./scripts/dev-in-docker.sh down

docker-restart:
	./scripts/dev-in-docker.sh restart

docker-logs:
	./scripts/dev-in-docker.sh logs

docker-shell:
	./scripts/dev-in-docker.sh shell

docker-sync-codex-home:
	./scripts/dev-in-docker.sh sync-codex-home

docker-clean:
	./scripts/dev-in-docker.sh clean

docker-ps:
	docker compose ps

docker-dev-check:
	docker compose run --rm t3-dev bash -lc "bun fmt && bun lint && bun typecheck"
