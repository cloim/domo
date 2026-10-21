package com.cloimism.domo.widget;

import org.json.JSONObject;

/** JS 숫자는 크기에 따라 Integer, Long, Double로 들어온다. */
final class WidgetSnapshot {
    final String month;
    final long balance;
    final long updatedAt;

    WidgetSnapshot(JSONObject data) {
        month = data.optString("month", "");
        Object amount = data.opt("balance");
        Object timestamp = data.opt("updatedAt");
        if (!month.matches("20\\d{2}-(0[1-9]|1[0-2])") || !(amount instanceof Number) || !(timestamp instanceof Number)) {
            throw new IllegalArgumentException("월 잔액 정보가 올바르지 않습니다.");
        }
        double value = ((Number) amount).doubleValue();
        double time = ((Number) timestamp).doubleValue();
        if (!Double.isFinite(value) || Math.abs(value) > 9_007_199_254_740_991d || !Double.isFinite(time) || time <= 0 || time > 9_007_199_254_740_991d) {
            throw new IllegalArgumentException("월 잔액 정보가 올바르지 않습니다.");
        }
        balance = ((Number) amount).longValue();
        updatedAt = ((Number) timestamp).longValue();
    }
}
