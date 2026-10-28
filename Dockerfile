# Container image for the Fax for Agents MCP server (stdio transport).
# Provenance: livetennisapi-oss/livetennisapi-mcp/Dockerfile (2026-10-28).
#
# Exists so automated indexers (Glama and friends) can start the server and run an introspection
# handshake without credentials. With FAXFORAGENTS_API_KEY unset the server still completes initialize,
# tools/list, resources/list and prompts/list, and every tool returns a message naming the variable
# rather than an error. See test/protocol.mjs.
#
# Build:  docker build -t faxforagents-mcp .
# Run:    docker run --rm -i -e FAXFORAGENTS_API_KEY=ffa_test_... faxforagents-mcp
#
# stdio means the container needs -i. There is no port to publish.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
ENTRYPOINT ["node", "dist/index.js"]
