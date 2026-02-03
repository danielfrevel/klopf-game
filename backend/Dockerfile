FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY backend/package.json ./backend/
RUN bun install
COPY backend/ ./backend/

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/backend ./backend
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "backend/src/index.ts"]
