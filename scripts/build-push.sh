#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# scripts/build-push.sh
#
# Build the NameFindQ production Docker image and push it to
# Alibaba Container Registry (ACR) for deployment on Function Compute 3.0.
#
# Usage:
#   chmod +x scripts/build-push.sh
#   ./scripts/build-push.sh
#
# Required environment variables (set these before running, or export them):
#   ACR_REGISTRY   — e.g. registry.cn-hangzhou.aliyuncs.com
#   ACR_NAMESPACE  — your ACR namespace
#   ACR_REPO       — repository name, e.g. namefindq
#   ACR_TAG        — image tag, e.g. latest or v1.0.0
#   ACR_USERNAME   — Alibaba Cloud RAM username for docker login
#   ACR_PASSWORD   — Alibaba Cloud RAM password / ACR personal access token
#
#   NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL (baked into client bundle)
#   NEXT_PUBLIC_SUPABASE_ANON_KEY — Supabase anon key (baked into client bundle)
#
# Server-only secrets (SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, QWEN_API_KEY)
# are NOT needed at build time — inject them in FC 3.0 Environment Variables.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Validate required variables ───────────────────────────────────────────────
REQUIRED_VARS=(
  ACR_REGISTRY ACR_NAMESPACE ACR_REPO ACR_TAG
  ACR_USERNAME ACR_PASSWORD
  NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
)
for var in "${REQUIRED_VARS[@]}"; do
  [[ -z "${!var:-}" ]] && error "Required variable '$var' is not set."
done

FULL_IMAGE="${ACR_REGISTRY}/${ACR_NAMESPACE}/${ACR_REPO}:${ACR_TAG}"
LATEST_IMAGE="${ACR_REGISTRY}/${ACR_NAMESPACE}/${ACR_REPO}:latest"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NameFindQ — ACR Build & Push"
echo "  Image : ${FULL_IMAGE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: Log in to ACR ────────────────────────────────────────────────────
info "Logging in to ${ACR_REGISTRY} ..."
echo "${ACR_PASSWORD}" | docker login "${ACR_REGISTRY}" \
  --username "${ACR_USERNAME}" \
  --password-stdin
success "Logged in to ACR."

# ── Step 2: Build the image ───────────────────────────────────────────────────
info "Building Docker image ..."
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  --tag "${FULL_IMAGE}" \
  --tag "${LATEST_IMAGE}" \
  --file Dockerfile \
  .
success "Image built: ${FULL_IMAGE}"

# ── Step 3: Push both tags to ACR ────────────────────────────────────────────
info "Pushing ${FULL_IMAGE} ..."
docker push "${FULL_IMAGE}"

if [[ "${ACR_TAG}" != "latest" ]]; then
  info "Pushing ${LATEST_IMAGE} ..."
  docker push "${LATEST_IMAGE}"
fi

success "Push complete."

# ── Step 4: Print FC 3.0 deployment reminder ─────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Next step: Update your FC 3.0 function"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Image URI: ${FULL_IMAGE}"
echo ""
echo "  Set these in FC 3.0 → Function Configuration → Environment Variables:"
echo "    NEXT_PUBLIC_SUPABASE_URL"
echo "    NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "    SUPABASE_SERVICE_ROLE_KEY        (secret)"
echo "    DATABASE_URL                     (secret)"
echo "    QWEN_API_KEY                     (secret)"
echo "    QWEN_BASE_URL                    (optional)"
echo ""
warn "Never put secrets into the Dockerfile or this script."
echo ""
