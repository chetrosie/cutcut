FROM oven/bun:1 AS base
WORKDIR /app

COPY package.json bun.lock* ./
COPY services/media-worker/package.json ./services/media-worker/package.json
RUN bun install --no-cache

COPY . .

WORKDIR /app/services/media-worker
CMD ["bun", "run", "src/worker.ts"]
