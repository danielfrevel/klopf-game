FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy monorepo config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY backend/package.json ./backend/

# Install dependencies
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy backend source
COPY backend/ ./backend/

# Build shared package
RUN pnpm --filter @klopf/shared run build

# Production stage with Bun
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/backend ./backend
RUN ln -s /app/node_modules /app/backend/node_modules
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "backend/src/index.ts"]
