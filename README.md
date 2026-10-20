# 도모 (Domo)

가족이 함께 쓰는 가계부입니다. 웹앱과 안드로이드 앱(Capacitor 하이브리드)으로 제공합니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `packages/core` | 도메인 로직(할부 회차, 일자별 묶음, 통계 집계, 권한, 검증) |
| `apps/server` | Fastify API 서버, Drizzle ORM, PostgreSQL |
| `apps/web` | React 웹앱, Capacitor 안드로이드 앱(`apps/web/android`) |

## 개발

운영과 개발은 포트, DB, 설정 파일을 따로 쓴다.

| 구분 | 화면 | API | DB | 설정 |
| --- | --- | --- | --- | --- |
| 운영 | 4300 (서버가 웹 빌드도 제공) | 4300 | `domo` | `.env` |
| 개발 | 5173 (Vite) | 4310 | `domo_dev` | `.env.development` |

```bash
pnpm install
cp .env.example .env.development   # 개발 값 채우기(PORT=4310, domo_dev, DEV_LOGIN=true)
pnpm db:up                         # PostgreSQL (localhost:5434)
pnpm dev:server                    # 개발 API http://localhost:4310
pnpm dev:web                       # 개발 화면 http://localhost:5173 (/api 는 4310으로)
pnpm test                          # 테스트는 domo_test DB
pnpm build:check                   # 검증 빌드는 release/web-check, 운영 웹 출력과 분리
```

## 가족 가계부 개선

입출기록 상단의 검색에서 전체 기간의 거래처, 메모, 금액과 구성원으로 기록을 찾습니다. 거래처 추천은 전체 기간을 사용하고, 추천을 선택하면 분류, 지출수단과 빈 금액을 채웁니다.

생활비 계획에서는 월별 대분류 예산과 출금 달력을 확인합니다. 예상 잔액은 월 수입에서 기록된 실지출과 미반영 고정지출, 카드대금을 뺀 값이며 계좌 잔고와 다릅니다. 예산 80% 도달 알림은 가족 소식에 한 번씩 공유됩니다. 가족 소식에서는 최근 기록에 댓글과 반응을 남길 수 있습니다.

통계의 지출 농도 달력에서 날짜를 선택하면 그날 기록으로 이동합니다. 기기에 보관한 조회는 오프라인에서도 볼 수 있고 로그아웃하면 삭제됩니다. 오프라인 저장은 연결 후 다시 시도합니다.

안드로이드 홈 화면의 위젯 목록에서 도모 월 잔액을 추가하고, 빠른 설정 편집에서 도모 기록 타일을 추가합니다. 위젯은 앱에서 마지막으로 불러온 월 잔액과 기준 시각을 표시합니다.

운영 서버가 `apps/web/dist`를 제공하므로 코드 검증에는 `pnpm build:check`를 사용합니다. `pnpm build`는 운영 웹 출력도 갱신하므로 서버와 DB 적용을 함께 준비한 배포에서 사용합니다.

## 안드로이드 릴리스

루트 `package.json`의 `version`을 올린 뒤 실행합니다. 서명 키는 저장소 밖 속성 파일(`DOMO_SIGNING_PROPERTIES`)에서 읽습니다.

```bash
pnpm release:android -- --notes "변경 내용"
```

앱은 시작할 때와 설정 화면에서 이 저장소의 최신 Release를 확인하여 업데이트를 안내합니다.
