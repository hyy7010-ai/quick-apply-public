# Container image for Cloud Run (or any container host).
#
# Two-stage build. The first stage needs the VITE_* values as build arguments,
# not just environment variables at runtime: Vite inlines them into the browser
# bundle at build time, so a container built without them ships a frontend that
# cannot reach Supabase no matter what is set later.
#
# Build and deploy:
#   gcloud run deploy fastresume-preview \
#     --source . \
#     --region asia-southeast1 \
#     --allow-unauthenticated \
#     --build-env-vars-file build-env.yaml \
#     --set-env-vars "SUPABASE_URL=...,SUPABASE_SERVICE_ROLE_KEY=...,GEMINI_API_KEY=..."
#
# Keep the service name distinct from anything already serving fastresume.xyz
# so a preview never replaces production.

# ---- Stage 1: build ---------------------------------------------------------
FROM node:20-slim AS build

WORKDIR /app

# Build-time only, and public by design.
#
# Defaults are set here rather than left empty because Cloud Run's "deploy from
# a repository" flow gives no convenient way to pass --build-arg, and a build
# without these produces a frontend that cannot reach Supabase at all — the
# failure appears at runtime, long after the build reported success.
#
# An anon key is public by design — it ships in the browser bundle on every
# page load, and access is controlled by row level security rather than by
# hiding it. So these could be committed. They are not, for one reason: this
# project has already shipped an RLS hole once, where a legacy permissive
# policy left 83 shared portfolios readable by anyone holding the anon key,
# 23 of them carrying names, contact details and referees' contact details.
#
# While the key stays out of the repository, the repository's visibility and
# the correctness of RLS are two separate decisions. Baking a default here
# quietly ties them together, and makes going public a one-click mistake
# instead of a deliberate check.
#
# Pass both at build time:
#   docker build --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .
#
# Everything genuinely secret (service role key, Gemini key, Stripe keys) is
# injected at deploy time into the runtime stage and never enters the image.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" -a -n "$VITE_SUPABASE_ANON_KEY" \
  || (echo "Build args VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required" && exit 1)
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Copy manifests first so `npm ci` is cached when only source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:20-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# The build output is a single bundled CJS file plus the static assets, so the
# runtime image needs no node_modules at all.
COPY --from=build /app/dist ./dist
COPY package.json ./

# Cloud Run injects PORT; server.ts already reads it and binds 0.0.0.0.
EXPOSE 8080
ENV PORT=8080

# Secrets (SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, STRIPE_*) are supplied at
# deploy time via --set-env-vars or Secret Manager. None are baked into the
# image.
CMD ["node", "dist/server.cjs"]
