package com.cloimism.domo.notify;

import android.Manifest;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Build;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.util.Base64;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** 웹 화면과 알림 연동 기능을 잇는 플러그인 */
@CapacitorPlugin(
    name = "DomoNotify",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class DomoNotifyPlugin extends Plugin {
    private NotifyStore store;

    @Override
    public void load() {
        store = new NotifyStore(getContext());
        DomoNotificationListener.ensureChannel(getContext());
        // 앱이 꺼진 상태에서 등록 알림을 눌러 시작된 경우
        emitPrefill(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        emitPrefill(intent);
    }

    private void emitPrefill(Intent intent) {
        if (intent == null || !intent.hasExtra(DomoNotificationListener.EXTRA_PREFILL)) return;
        String raw = intent.getStringExtra(DomoNotificationListener.EXTRA_PREFILL);
        intent.removeExtra(DomoNotificationListener.EXTRA_PREFILL);
        try {
            // 웹 화면이 아직 리스너를 달지 않았어도 전달되도록 보관한다.
            notifyListeners("prefill", JSObject.fromJSONObject(new JSONObject(raw)), true);
        } catch (JSONException ignored) {
            // 우리가 만든 JSON 이라 일어나지 않는다.
        }
    }

    private boolean listenerEnabled() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean enabled = listenerEnabled();
        if (enabled && !DomoNotificationListener.connected && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // 앱 업데이트 뒤 등 연결이 끊긴 경우 다시 붙인다.
            NotificationListenerService.requestRebind(new ComponentName(getContext(), DomoNotificationListener.class));
        }
        JSObject r = new JSObject();
        r.put("listenerEnabled", enabled);
        r.put("connected", DomoNotificationListener.connected);
        r.put("postAllowed", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        r.put("targetCount", store.targets().length());
        r.put("templateCount", store.templates().length());
        call.resolve(r);
    }

    @PluginMethod
    public void openListenerSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void requestPostPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolvePost(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "postPermissionResult");
    }

    @PermissionCallback
    private void postPermissionResult(PluginCall call) {
        resolvePost(call);
    }

    private void resolvePost(PluginCall call) {
        JSObject r = new JSObject();
        r.put("postAllowed", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        call.resolve(r);
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        List<ApplicationInfo> apps = pm.getInstalledApplications(0);
        JSArray list = new JSArray();
        for (ApplicationInfo info : apps) {
            if (info.packageName.equals(getContext().getPackageName())) continue;
            JSObject o = new JSObject();
            o.put("packageName", info.packageName);
            o.put("label", pm.getApplicationLabel(info).toString());
            o.put("system", (info.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (info.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0);
            o.put("launchable", pm.getLaunchIntentForPackage(info.packageName) != null);
            list.put(o);
        }
        JSObject r = new JSObject();
        r.put("apps", list);
        call.resolve(r);
    }

    /** 요청한 앱들의 아이콘을 작은 PNG data URL 로 돌려준다. */
    @PluginMethod
    public void getAppIcons(PluginCall call) {
        JSArray packages = call.getArray("packages", new JSArray());
        PackageManager pm = getContext().getPackageManager();
        JSObject icons = new JSObject();
        int size = 72;
        for (int i = 0; i < packages.length(); i++) {
            String pkg = packages.optString(i);
            try {
                Drawable d = pm.getApplicationIcon(pkg);
                Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                d.setBounds(0, 0, size, size);
                d.draw(canvas);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bitmap.compress(Bitmap.CompressFormat.PNG, 100, out);
                icons.put(pkg, "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            } catch (PackageManager.NameNotFoundException ignored) {
                // 지워진 앱은 아이콘 없이 둔다.
            }
        }
        JSObject r = new JSObject();
        r.put("icons", icons);
        call.resolve(r);
    }

    @PluginMethod
    public void getTargets(PluginCall call) {
        JSObject r = new JSObject();
        r.put("targets", toJs(store.targets()));
        call.resolve(r);
    }

    @PluginMethod
    public void setTargets(PluginCall call) {
        store.setTargets(call.getArray("targets", new JSArray()));
        call.resolve();
    }

    @PluginMethod
    public void getTemplates(PluginCall call) {
        JSObject r = new JSObject();
        r.put("templates", toJs(store.templates()));
        call.resolve(r);
    }

    @PluginMethod
    public void setTemplates(PluginCall call) {
        store.setTemplates(call.getArray("templates", new JSArray()));
        call.resolve();
    }

    @PluginMethod
    public void getNotifications(PluginCall call) {
        JSObject r = new JSObject();
        r.put("notifications", toJs(store.notifications(call.getString("packageName"), call.getInt("limit", 100))));
        call.resolve(r);
    }

    @PluginMethod
    public void clearNotifications(PluginCall call) {
        store.deleteNotifications(call.getString("packageName", ""));
        call.resolve();
    }

    /** 로그인 세션과 서버 주소를 넘겨 알림 감시 서비스가 앱 화면 없이 업로드하게 한다. */
    @PluginMethod
    public void configureSync(PluginCall call) {
        store.setSync(call.getString("apiBase", ""), call.getString("token", ""));
        JSObject r = new JSObject();
        r.put("deviceId", store.deviceId());
        r.put("deviceName", (Build.MANUFACTURER + " " + Build.MODEL).trim());
        r.put("configVersion", store.configVersion());
        call.resolve(r);
    }

    @PluginMethod
    public void clearSync(PluginCall call) {
        store.clearSync();
        call.resolve();
    }

    /** 서버 사본(대상 앱, 템플릿)을 기기에 적용한다. */
    @PluginMethod
    public void applyConfig(PluginCall call) {
        store.applyConfig(call.getArray("targets", new JSArray()), call.getArray("templates", new JSArray()), call.getInt("version", 0));
        call.resolve();
    }

    @PluginMethod
    public void setConfigVersion(PluginCall call) {
        store.setConfigVersion(call.getInt("version", 0));
        call.resolve();
    }

    /** 밀린 알림을 지금 올린다. */
    @PluginMethod
    public void syncNow(PluginCall call) {
        NotifySync.kick(getContext());
        call.resolve();
    }

    private static JSArray toJs(JSONArray array) {
        try {
            return new JSArray(array.toString());
        } catch (JSONException e) {
            return new JSArray();
        }
    }
}
