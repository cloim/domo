package com.cloimism.domo.widget;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DomoWidget")
public class DomoWidgetPlugin extends Plugin {
    @PluginMethod public void update(PluginCall call) {
        String month = call.getString("month", "");
        Double balance = call.getDouble("balance");
        Double updatedAt = call.getDouble("updatedAt");
        if (!month.matches("20\\d{2}-(0[1-9]|1[0-2])") || balance == null || updatedAt == null) {
            call.reject("월 잔액 정보가 올바르지 않습니다."); return;
        }
        DomoWidgetProvider.prefs(getContext()).edit().putString("month", month).putLong("balance", balance.longValue()).putLong("updatedAt", updatedAt.longValue()).apply();
        DomoWidgetProvider.refresh(getContext()); call.resolve();
    }
    @PluginMethod public void clear(PluginCall call) {
        DomoWidgetProvider.prefs(getContext()).edit().clear().apply();
        DomoWidgetProvider.refresh(getContext()); call.resolve();
    }
}
