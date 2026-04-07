#!/bin/bash
set -e

COMMAND="${1:-up}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

case "$COMMAND" in
  build)
    echo "Building Docker image..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" build
    ;;
  up)
    echo "Starting backend (docker compose up)..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up --build
    ;;
  up-d)
    echo "Starting backend (detached)..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" up --build -d
    ;;
  down)
    echo "Stopping backend..."
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" down
    ;;
  logs)
    docker compose -f "$PROJECT_ROOT/docker-compose.yml" logs -f backend
    ;;
  *)
    echo "Usage: ./build.sh [build|up|up-d|down|logs]"
    echo ""
    echo "  build   Build the Docker image only"
    echo "  up      Build & start (foreground, default)"
    echo "  up-d    Build & start (detached)"
    echo "  down    Stop containers"
    echo "  logs    Tail backend logs"
    exit 1
    ;;
esac
