# 1단계: 의존성 설치 및 웹앱 빌드
FROM node:22-alpine AS builder

RUN apk add --no-cache tzdata
ENV TZ=Asia/Seoul

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

# 모노레포 설정 및 패키지 정의 복사
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

# 의존성 설치
RUN pnpm install --frozen-lockfile

# 소스 복사
COPY packages/core ./packages/core
COPY apps/web ./apps/web
COPY apps/server ./apps/server

# 프로덕션 웹 번들 빌드
RUN pnpm --filter @domo/web build

# 2단계: 프로덕션 런타임
FROM node:22-alpine AS runner

RUN apk add --no-cache tzdata curl
ENV TZ=Asia/Seoul
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app

COPY --from=builder /app ./

EXPOSE 4300

HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://127.0.0.1:4300/api/health || exit 1

CMD ["pnpm", "--filter", "@domo/server", "start:prod"]
