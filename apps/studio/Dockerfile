# Two-stage build for the static tscaps web app.
#
# Build context: the workspace root (the repo where this app sits as a
# pnpm workspace member alongside `packages/engine`). Invoke with
#   docker build -f apps/studio/Dockerfile -t tscaps-web .
# from the repo root.

# Keep glibc available for native build dependencies.
FROM node:22-slim AS build

RUN corepack enable

WORKDIR /workspace

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/engine/package.json ./packages/engine/package.json
COPY apps/studio/package.json ./apps/studio/package.json

# Template compilation needs source files, so run that root lifecycle step
# explicitly below. Dependency lifecycle scripts still run normally.
RUN node -e "const fs = require('fs'); const p = require('./package.json'); delete p.scripts.postinstall; fs.writeFileSync('package.json', JSON.stringify(p));"
RUN pnpm install --frozen-lockfile

COPY package.json ./
COPY packages/engine ./packages/engine
COPY templates ./templates
COPY apps/studio ./apps/studio
# Studio typechecks the shared billing contract from its regression tests.
COPY supabase/functions/_shared ./supabase/functions/_shared

RUN pnpm templates:build
RUN pnpm --filter ./apps/studio build

FROM nginx:1.27-alpine AS runtime

COPY --from=build /workspace/apps/studio/dist /usr/share/nginx/html
COPY apps/studio/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/studio/docker/40-reelstudio-config.sh /docker-entrypoint.d/40-reelstudio-config.sh
RUN chmod +x /docker-entrypoint.d/40-reelstudio-config.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
