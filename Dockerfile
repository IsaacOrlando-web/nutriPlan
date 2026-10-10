# NutriPlan AI production image (Next.js standalone output). Build: docker build -t nutriplan .
# Run:   docker run -p 3000:3000 -v "$PWD/.data:/app/.data" --env-file .env.local nutriplan
# Local Supabase is NOT part of this image; see docker-compose.yml comments.

# ---------- deps: install exactly the lockfile ----------
FROM node:20-alpine AS deps
WORKDIR /app
# libc6-compat helps native/wasm loaders on Alpine (sharp, highs).
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
# --ignore-scripts: skips the supabase CLI binary download and Playwright browser hooks; none are needed to build.
RUN npm ci --ignore-scripts

# ---------- builder: next build with standalone output ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone
# Public env baked into the client bundle at build time. Override with --build-arg if you need mocks in the image.
ARG NEXT_PUBLIC_USE_MOCKS=false
ENV NEXT_PUBLIC_USE_MOCKS=$NEXT_PUBLIC_USE_MOCKS
RUN npm run build

# ---------- runner: minimal image ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Safe runtime defaults; override with --env-file / compose.
ENV DATA_BACKEND=memory
ENV MEMORY_STORE_FILE=.data/store.json
ENV AUTH_MODE=local
ENV AGENTS_FALLBACK=true

RUN apk add --no-cache libc6-compat \
  && mkdir -p /app/.data \
  && chown -R node:node /app

# Standalone server (server.js + traced node_modules, including the highs wasm since it is a serverExternalPackage).
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Runtime data read from disk by the app (not traced by Next because it is loaded dynamically).
COPY --from=builder --chown=node:node /app/agents ./agents
COPY --from=builder --chown=node:node /app/scripts/data ./scripts/data
COPY --from=builder --chown=node:node /app/mocks ./mocks

USER node
EXPOSE 3000
VOLUME ["/app/.data"]
CMD ["node", "server.js"]
