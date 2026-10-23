package com.cloimism.domo.notify;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 받은 알림을 서버로 올리고, 서버 사본이 더 새로우면(PC에서 고친 경우) 대상 앱과 템플릿을 받아 적용한다.
 * 네트워크는 메인 스레드에서 쓸 수 없어 한 줄짜리 실행기로 순서대로 처리한다.
 */
final class NotifySync {
    private static final ExecutorService EXECUTOR = Executors.newSingleThreadExecutor();
    private static final int BATCH = 50;

    private NotifySync() {}

    static void kick(Context context) {
        kick(context, () -> {});
    }

    static void kick(Context context, Runnable done) {
        Context app = context.getApplicationContext();
        EXECUTOR.execute(() -> {
            try { run(new NotifyStore(app)); }
            finally { done.run(); }
        });
    }

    private static void run(NotifyStore store) {
        String base = store.apiBase();
        String token = store.token();
        if (base == null || base.isEmpty() || token == null || token.isEmpty()) return;
        String devicePath = base + "/api/notify/devices/" + store.deviceId();
        try {
            String after = "";
            while (true) {
                JSONArray items = store.registrations(after, BATCH);
                if (items.length() == 0) break;
                JSONObject response = request("POST", devicePath + "/registrations", token, new JSONObject().put("items", items).toString());
                if (response == null) return;
                JSONArray states = response.getJSONArray("states");
                for (int i = 0; i < states.length(); i++) {
                    JSONObject state = states.getJSONObject(i);
                    String key = state.getString("eventKey");
                    String status = state.getString("status");
                    store.resolveRegistration(key, status);
                }
                after = items.getJSONObject(items.length() - 1).getString("eventKey");
            }
            int serverVersion = -1;
            while (true) {
                JSONArray items = store.pendingUploads(BATCH);
                if (items.length() == 0) break;
                JSONObject res = request("POST", devicePath + "/notifications", token, new JSONObject().put("items", items).toString());
                if (res == null) return; // 실패: 남겨 두었다가 다음에 다시 보낸다.
                store.markSynced(items);
                serverVersion = res.optInt("configVersion", -1);
                if (items.length() < BATCH) break;
            }
            if (serverVersion > store.configVersion()) {
                JSONObject config = request("GET", devicePath + "/config", token, null);
                if (config != null) store.applyConfig(config.optJSONArray("targets"), config.optJSONArray("templates"), config.optInt("version"));
            }
        } catch (Exception ignored) {
            // 네트워크 문제는 다음 알림 때 다시 시도한다.
        }
    }

    /** 성공하면 JSON 응답, 실패하면 null */
    private static JSONObject request(String method, String url, String token, String body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        try {
            conn.setRequestMethod(method);
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(30_000);
            conn.setRequestProperty("authorization", "Bearer " + token);
            if (body != null) {
                conn.setDoOutput(true);
                conn.setRequestProperty("content-type", "application/json; charset=utf-8");
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            if (conn.getResponseCode() / 100 != 2) return null;
            try (InputStream in = conn.getInputStream(); ByteArrayOutputStream buf = new ByteArrayOutputStream()) {
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
                return new JSONObject(buf.toString("UTF-8"));
            }
        } finally {
            conn.disconnect();
        }
    }
}
