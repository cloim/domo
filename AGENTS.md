# Domo 작업 지침

가족이 함께 쓰는 가계부 프로젝트(Domo)의 개발 및 협업 지침입니다.

## 기본 개발 환경

- 구성: `packages/core`(도메인 로직), `apps/server`(Fastify, Drizzle ORM, PostgreSQL), `apps/web`(React 웹앱, Capacitor 안드로이드 앱)
- 운영 환경: 포트 4300, DB `domo`, 설정 `.env` (StackPad `cloimism` 패드셋의 `Domo` 패드에서 관리)
- 개발 환경: 화면 포트 5173(Vite), API 포트 4310, DB `domo_dev`(포트 5434), 설정 `.env.development` (StackPad `개발` 패드셋의 `Domo Dev` 패드에서 관리)
- 코드 검증 빌드: 운영 웹 출력 보호를 위해 `pnpm build:check`를 사용합니다.

## 단축 명령 처리

- `cmt`: 주제별 커밋 수행 (사전 확인 없이 자율 커밋)
- `pus`: 현재 브랜치 푸시
- `mrg`: master/main으로 병합
- `+{지시내용}`: 전역 지침 및 현재 프로젝트 지침 동시 영구 반영
- `${지시내용}`: 전역 스킬 및 현재 프로젝트 동시 영구 반영
