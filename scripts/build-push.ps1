# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# scripts/build-push.ps1
#
# PowerShell equivalent of build-push.sh — for running directly on Windows.
#
# Usage (from repo root):
#   .\scripts\build-push.ps1
#
# Set the variables in the CONFIG block below before running,
# OR pre-export them as environment variables in your shell session.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
$ErrorActionPreference = "Stop"

# ── CONFIG — fill these in (or set as $env: variables before running) ─────────
$ACR_REGISTRY  = $env:ACR_REGISTRY  ?? "registry.cn-hangzhou.aliyuncs.com"
$ACR_NAMESPACE = $env:ACR_NAMESPACE ?? "your-namespace"
$ACR_REPO      = $env:ACR_REPO      ?? "namefindq"
$ACR_TAG       = $env:ACR_TAG       ?? "latest"
$ACR_USERNAME  = $env:ACR_USERNAME  ?? ""
$ACR_PASSWORD  = $env:ACR_PASSWORD  ?? ""

# Supabase public values — embedded in the Next.js client bundle at build time
$SUPABASE_URL      = $env:NEXT_PUBLIC_SUPABASE_URL      ?? ""
$SUPABASE_ANON_KEY = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

# ── Helpers ───────────────────────────────────────────────────────────────────
function Info($msg)    { Write-Host "[INFO]  $msg" -ForegroundColor Cyan    }
function Ok($msg)      { Write-Host "[OK]    $msg" -ForegroundColor Green   }
function Warn($msg)    { Write-Host "[WARN]  $msg" -ForegroundColor Yellow  }
function Fail($msg)    { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# ── Validate required variables ───────────────────────────────────────────────
$required = @{
    ACR_REGISTRY  = $ACR_REGISTRY
    ACR_NAMESPACE = $ACR_NAMESPACE
    ACR_REPO      = $ACR_REPO
    ACR_TAG       = $ACR_TAG
    ACR_USERNAME  = $ACR_USERNAME
    ACR_PASSWORD  = $ACR_PASSWORD
    NEXT_PUBLIC_SUPABASE_URL       = $SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY  = $SUPABASE_ANON_KEY
}
foreach ($key in $required.Keys) {
    if ([string]::IsNullOrWhiteSpace($required[$key])) {
        Fail "Required variable '$key' is not set. Edit the CONFIG block or set as `$env:$key."
    }
}

$FULL_IMAGE   = "${ACR_REGISTRY}/${ACR_NAMESPACE}/${ACR_REPO}:${ACR_TAG}"
$LATEST_IMAGE = "${ACR_REGISTRY}/${ACR_NAMESPACE}/${ACR_REPO}:latest"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host "  NameFindQ — ACR Build & Push (PowerShell)"            -ForegroundColor White
Write-Host "  Image : $FULL_IMAGE"                                   -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host ""

# ── Step 1: Log in to ACR ────────────────────────────────────────────────────
Info "Logging in to $ACR_REGISTRY ..."
$ACR_PASSWORD | docker login $ACR_REGISTRY --username $ACR_USERNAME --password-stdin
if ($LASTEXITCODE -ne 0) { Fail "docker login failed." }
Ok "Logged in to ACR."

# ── Step 2: Build the image ───────────────────────────────────────────────────
Info "Building Docker image ..."
docker build `
    --build-arg "NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL" `
    --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY" `
    --tag $FULL_IMAGE `
    --tag $LATEST_IMAGE `
    --file Dockerfile `
    .
if ($LASTEXITCODE -ne 0) { Fail "docker build failed." }
Ok "Image built: $FULL_IMAGE"

# ── Step 3: Push to ACR ──────────────────────────────────────────────────────
Info "Pushing $FULL_IMAGE ..."
docker push $FULL_IMAGE
if ($LASTEXITCODE -ne 0) { Fail "docker push failed for versioned tag." }

if ($ACR_TAG -ne "latest") {
    Info "Pushing $LATEST_IMAGE ..."
    docker push $LATEST_IMAGE
    if ($LASTEXITCODE -ne 0) { Fail "docker push failed for latest tag." }
}

Ok "Push complete."

# ── Step 4: FC 3.0 deployment reminder ───────────────────────────────────────
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host "  Next step: Update your FC 3.0 function"               -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host ""
Write-Host "  Image URI : $FULL_IMAGE"
Write-Host ""
Write-Host "  Set these in FC 3.0 -> Function Configuration -> Environment Variables:" -ForegroundColor Cyan
Write-Host "    NEXT_PUBLIC_SUPABASE_URL"
Write-Host "    NEXT_PUBLIC_SUPABASE_ANON_KEY"
Write-Host "    SUPABASE_SERVICE_ROLE_KEY        (secret)"
Write-Host "    DATABASE_URL                     (secret)"
Write-Host "    QWEN_API_KEY                     (secret)"
Write-Host "    QWEN_BASE_URL                    (optional)"
Write-Host ""
Warn "Never put secrets into the Dockerfile or this script."
Write-Host ""
