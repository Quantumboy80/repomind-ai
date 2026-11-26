FROM node:22-alpine
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY package.json pnpm-workspace.yaml ./
COPY frontend/package.json frontend/package.json
RUN pnpm install --filter repomind-frontend... --no-frozen-lockfile
COPY frontend frontend
ENV FASTAPI_INTERNAL_URL=http://api:8000
RUN pnpm --dir frontend build
ENV PORT=3000 NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--dir", "frontend", "start"]
