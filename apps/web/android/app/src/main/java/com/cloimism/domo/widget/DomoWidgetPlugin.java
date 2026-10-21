package com.cloimism.domo.widget;

import com.getcapacitor.Plugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DomoWidget")
public class DomoWidgetPlugin extends Plugin {
    @PluginMethod public void update(PluginCall call) {
        try {
            WidgetSnapshot snapshot = new WidgetSnapshot(call.getData());
            DomoWidgetProvider.prefs(getContext()).edit().putString("month", snapshot.month).putLong("balance", snapshot.balance).putLong("updatedAt", snapshot.updatedAt).apply();
            DomoWidgetProvider.refresh(getContext()); call.resolve();
        } catch (IllegalArgumentException error) {
            call.reject(error.getMessage());
        }
    }
    @PluginMethod public void clear(PluginCall call) {
        DomoWidgetProvider.prefs(getContext()).edit().remove("month").remove("balance").remove("updatedAt").apply();
        DomoWidgetProvider.refresh(getContext()); call.resolve();
    }
    @PluginMethod public void getAppearance(PluginCall call) {
        JSObject result = new JSObject();
        result.put("backgroundColor", DomoWidgetProvider.prefs(getContext()).getString("backgroundColor", "#fffdf8"));
        result.put("transparency", DomoWidgetProvider.prefs(getContext()).getInt("transparency", 0));
        call.resolve(result);
    }
    @PluginMethod public void setAppearance(PluginCall call) {
        String color = call.getString("backgroundColor", "");
        Integer transparency = call.getInt("transparency");
        if (!color.matches("#[0-9a-fA-F]{6}") || transparency == null || transparency < 0 || transparency > 100) {
            call.reject("배경 색상과 투명도를 확인해 주세요."); return;
        }
        DomoWidgetProvider.prefs(getContext()).edit().putString("backgroundColor", color).putInt("transparency", transparency).apply();
        DomoWidgetProvider.refresh(getContext()); call.resolve();
    }
}
