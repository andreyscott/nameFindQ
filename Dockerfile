# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NameFindQ — Production Dockerfile
# Target: Alibaba Cloud Function Compute 3.0 (Custom Container)
#
# Multi-stage build:
#   Stage 1 (deps)    — install production node_modules only
#   Stage 2 (builder) — run `next build` to produce .next/standalone
#   Stage 3 (runner)  — minimal runtime image, no source code, no dev deps
#
# Secrets are NEVER baked into this image.
# All process.env values are injected at FC runtime via Environment Variables.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ── Stage 1: dependency installation ─────────────────────────────────────────
FROM node:18-alpine AS deps

# libc6-compat is required for certain native Node.js bindings on Alpine
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy only the package manifests first to maximise layer-cache efficiency.
# node_modules will be rebuilt only when package.json or lock file changes.
COPY package.json package-lock.json ./

# Install production dependencies only — skips all devDependencies
RUN npm ci --omit=dev

# ── Stage 2: Next.js build ────────────────────────────────────────────────────
FROM node:18-alpine AS builder

WORKDIR /app

# Bring in the production node_modules from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application source (respects .dockerignore — excludes .next, .env*, etc.)
COPY . .

# NEXT_PUBLIC_* variables are embedded into the client-side JS bundle at build
# time. Provide them here as build arguments so the bundle is correctly formed
# without storing secrets in the image layer.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Disable Next.js telemetry inside CI/container builds
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Produce the standalone output in .next/standalone
RUN npm run build

# ── Stage 3: production runner ───────────────────────────────────────────────
FROM node:18-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# ── Runtime: host and port ────────────────────────────────────────────────────
# FC 3.0 custom containers must listen on 0.0.0.0.
# FC forwards traffic to the port configured in the function's "Container Port"
# setting — set that to 3000 to match this value.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Run as a non-root user for container security best practice
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# ── Copy only the standalone server artefacts ─────────────────────────────────
#
# .next/standalone  → the self-contained server (server.js + minimal node_modules)
# .next/static      → hashed client-side JS/CSS bundles (served by Next.js)
# public/           → static assets (images, fonts, manifest, etc.)
#
# Anything not listed here (source code, dev deps, scripts) is NOT included.

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Start the standalone Next.js server
CMD ["node", "server.js"]
