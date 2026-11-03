# syntax=docker/dockerfile:1
#
# The site builder as one image: the server, with the built renderer and
# admin beside it. State lives in /data (a volume) and backups in /backups
# (a separate mount). See docs/install-docker.md.
#
#   docker compose up -d --build

# Node 24.7 or later: the passwords use its built-in argon2 (.nvmrc, engines).
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack install -g pnpm@12.16.1
WORKDIR /app
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN --mount=type=cache,id=turbo,target=/app/.turbo/cache pnpm build
# The server with only its production dependencies, workspace packages
# copied in by their `files`: what the image runs.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @fiscal-sb/server deploy --prod --legacy /prod

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    DATA_DIR=/data \
    BACKUP_DIR=/backups \
    ADMIN_DIST=/app/admin
WORKDIR /app
COPY --from=build /prod ./
COPY --from=build /app/apps/admin/dist admin
# `site-builder <command>`, the package's own bin, for `docker compose exec`.
RUN chmod +x dist/cli.js \
 && ln -s /app/dist/cli.js /usr/local/bin/site-builder \
 && mkdir -p /data /backups \
 && chown node:node /data /backups \
 && chmod 0700 /data /backups
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/index.js"]
