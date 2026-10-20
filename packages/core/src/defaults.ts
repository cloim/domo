import type { TransactionKind } from "./schemas.ts";

/** 가계를 만들 때 넣는 기본 분류. 대분류: 소분류 목록 */
export const DEFAULT_CATEGORIES: Record<TransactionKind, [string, string[]][]> = {
  expense: [
    ["식비", ["장보기", "외식", "배달", "카페, 간식"]],
    ["주거, 통신", ["관리비", "공과금", "통신비", "인터넷"]],
    ["생활", ["생활용품", "가구, 가전", "의류, 미용"]],
    ["교통", ["대중교통", "주유", "주차, 통행료", "택시"]],
    ["건강", ["병원", "약국", "운동"]],
    ["교육, 육아", ["학원", "교재", "육아용품"]],
    ["문화, 여가", ["여행", "취미", "구독"]],
    ["경조사", ["경조사비", "선물"]],
    ["금융", ["보험", "대출이자", "세금", "카드대금"]],
    ["기타", ["기타"]],
  ],
  income: [
    ["근로소득", ["급여", "상여"]],
    ["사업소득", ["매출"]],
    ["금융소득", ["이자", "배당"]],
    ["기타소득", ["용돈", "환급", "중고판매", "기타"]],
  ],
};

export const DEFAULT_PAYMENT_METHODS = [{ type: "cash" as const, name: "현금" }];

/** 구성원 표시색. 합류 순서대로 배정한다. */
export const MEMBER_COLORS = ["#c2512f", "#2f6f73", "#b8892c", "#5b5f97", "#7a8c3a", "#9a4f7b"];

export const CARD_ISSUERS = ["신한카드", "삼성카드", "현대카드", "KB국민카드", "롯데카드", "우리카드", "하나카드", "BC카드", "NH농협카드", "IBK기업은행", "카카오뱅크", "토스뱅크", "씨티카드"];

/** 새 카드 기본 집계 기간과 결제일: 전월 1일 ~ 전월 말일, 매월 14일 결제 */
export const DEFAULT_CARD_BILLING = { cycleStartOffset: -1, cycleStartDay: 1, cycleEndOffset: -1, cycleEndDay: 31, paymentDay: 14 };
