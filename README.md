# 도모 (Domo)

가족이 함께 쓰는 가계부입니다. 웹앱과 안드로이드 앱(Capacitor 하이브리드)으로 제공합니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `packages/core` | 도메인 로직(할부 회차, 일자별 묶음, 통계 집계, 권한, 검증) |
| `apps/server` | Fastify API 서버, Drizzle ORM, PostgreSQL |
| `apps/web` | React 웹앱, Capacitor 안드로이드 앱(`apps/web/android`) |

## 개발

```bash
pnpm install
cp .env.example .env        # 값 채우기
pnpm db:up                  # PostgreSQL (localhost:5434)
pnpm dev:server             # http://localhost:4300
pnpm dev:web                # http://localhost:5173
pnpm test
```

## 안드로이드 릴리스

루트 `package.json`의 `version`을 올린 뒤 실행합니다. 서명 키는 저장소 밖 속성 파일(`DOMO_SIGNING_PROPERTIES`)에서 읽습니다.

```bash
pnpm release:android -- --notes "변경 내용"
```

앱은 시작할 때와 설정 화면에서 이 저장소의 최신 Release를 확인하여 업데이트를 안내합니다.
