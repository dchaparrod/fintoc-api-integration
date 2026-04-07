#!/bin/bash
set -e

IMAGE_NAME="fintoc-backend"
TAG="${1:-latest}"

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" .

echo ""
echo "Done. Run with:"
echo "  docker run -p 8000:8000 \\"
echo "    -e FINTOC_API_KEY=sk_test_... \\"
echo "    -v ~/.ssh/fintoc_private.pem:/app/private_key.pem:ro \\"
echo "    ${IMAGE_NAME}:${TAG}"
