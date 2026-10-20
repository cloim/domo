package com.cloimism.domo.notify;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * 알림 템플릿 적용 규칙. packages/core/src/notifyTemplate.ts 와 같은 규칙이며
 * packages/core/fixtures/notify-cases.json 사례로 양쪽을 함께 검사한다.
 */
public final class NotifyMatcher {
    private NotifyMatcher() {}

    public static final class Match {
        public final String kind;
        public final long amount;
        public final String counterparty;
        public final String memo;
        /** yyyy-MM-ddTHH:mm */
        public final String occurredAt;

        Match(String kind, long amount, String counterparty, String memo, String occurredAt) {
            this.kind = kind;
            this.amount = amount;
            this.counterparty = counterparty;
            this.memo = memo;
            this.occurredAt = occurredAt;
        }
    }

    public static String body(String title, String text) {
        return (title == null ? "" : title) + "\n" + (text == null ? "" : text);
    }

    /** 정의되지 않은 그룹은 예외 대신 null 로 돌려준다. */
    private static String group(Matcher m, String name) {
        try {
            return m.group(name);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static Integer number(String value) {
        if (value == null || value.trim().isEmpty()) return null;
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static String clean(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** postedAt 은 yyyy-MM-ddTHH:mm. 맞지 않거나 금액이 없으면 null */
    public static Match apply(String pattern, String kind, String title, String text, String postedAt) {
        Matcher m;
        try {
            m = Pattern.compile(pattern).matcher(body(title, text));
        } catch (PatternSyntaxException e) {
            return null;
        }
        if (!m.find()) return null;
        String rawAmount = group(m, "amount");
        if (rawAmount == null) return null;
        String digits = rawAmount.replaceAll("[^\\d]", "");
        if (digits.isEmpty()) return null;
        long amount = Long.parseLong(digits);
        if (amount <= 0) return null;

        String date = postedAt.substring(0, 10);
        Integer month = number(group(m, "month"));
        Integer day = number(group(m, "day"));
        if (month != null && day != null && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            int year = Integer.parseInt(postedAt.substring(0, 4));
            String candidate = String.format(Locale.ROOT, "%04d-%02d-%02d", year, month, day);
            // 그 날짜가 알림 시각보다 미래면 작년 알림으로 본다(연말 사용, 새해 알림).
            date = candidate.compareTo(date) > 0 ? String.format(Locale.ROOT, "%04d-%02d-%02d", year - 1, month, day) : candidate;
        }
        Integer hour = number(group(m, "hour"));
        Integer minute = number(group(m, "minute"));
        String time = postedAt.substring(11, 16);
        if (hour != null && hour >= 0 && hour <= 23) {
            int min = minute != null && minute >= 0 && minute <= 59 ? minute : 0;
            time = String.format(Locale.ROOT, "%02d:%02d", hour, min);
        }
        return new Match(kind, amount, clean(group(m, "counterparty")), clean(group(m, "memo")), date + "T" + time);
    }
}
