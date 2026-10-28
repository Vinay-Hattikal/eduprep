# One image for the web app, the background worker and database migrations (D-047).
#   web:     npm run start            (next start, port 3000)
#   worker:  npm run worker
#   migrate: npx prisma migrate deploy
# Build: docker build -t eduprep .   (Docker is optional; local development doesn't need it.)

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --ignore-scripts

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Builds never need a real database or secrets; they are read at run time.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build AUTH_SECRET=build-time-placeholder-secret-0123456789 \
    npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fs http://localhost:3000/api/health || exit 1
CMD ["npm", "run", "start"]
