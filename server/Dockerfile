FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile || bun install --production
COPY index.ts ./
ENV PORT=8787 NET_DB=/data/shtx-net.sqlite
VOLUME ["/data"]
EXPOSE 8787 8443
CMD ["bun", "index.ts"]
