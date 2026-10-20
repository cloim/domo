package com.cloimism.domo.notify;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 알림 연동 설정과 기록을 기기에 저장한다.
 * 대상 앱과 템플릿은 SharedPreferences(JSON), 알림 기록은 SQLite 에 둔다.
 * 서버에는 기기별 사본(configVersion)과 알림 이력이 있어 PC에서 보고 고칠 수 있다(NotifySync).
 */
public final class NotifyStore {
    private static final String PREFS = "domo_notify";
    private static final String KEY_TARGETS = "targets";
    private static final String KEY_TEMPLATES = "templates";
    private static final String KEY_RECENT = "recent_matches";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_API_BASE = "sync_api_base";
    private static final String KEY_TOKEN = "sync_token";
    private static final String KEY_CONFIG_VERSION = "config_version";

    /** 앱마다 보관하는 최근 알림 수와 기간 */
    static final int KEEP_PER_APP = 200;
    static final long KEEP_MS = 30L * 24 * 60 * 60 * 1000;
    /** 같은 이벤트를 다시 등록 알림으로 띄우지 않는 기간 */
    static final long DEDUPE_MS = 24L * 60 * 60 * 1000;

    private final SharedPreferences prefs;
    private final Db db;

    public NotifyStore(Context context) {
        Context app = context.getApplicationContext();
        prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        db = new Db(app);
    }

    // ───── 대상 앱과 템플릿 (JSON 문자열을 그대로 보관) ─────

    public JSONArray targets() {
        return readArray(KEY_TARGETS);
    }

    public void setTargets(JSONArray value) {
        prefs.edit().putString(KEY_TARGETS, value.toString()).apply();
    }

    public JSONObject target(String packageName) {
        JSONArray all = targets();
        for (int i = 0; i < all.length(); i++) {
            JSONObject t = all.optJSONObject(i);
            if (t != null && packageName.equals(t.optString("packageName"))) return t;
        }
        return null;
    }

    public JSONArray templates() {
        return readArray(KEY_TEMPLATES);
    }

    public void setTemplates(JSONArray value) {
        prefs.edit().putString(KEY_TEMPLATES, value.toString()).apply();
    }

    private JSONArray readArray(String key) {
        try {
            return new JSONArray(prefs.getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    // ───── 서버 동기화 정보 ─────

    /** 이 기기의 고유 ID. 처음 부를 때 만든다. */
    public synchronized String deviceId() {
        String id = prefs.getString(KEY_DEVICE_ID, null);
        if (id == null) {
            id = java.util.UUID.randomUUID().toString();
            prefs.edit().putString(KEY_DEVICE_ID, id).apply();
        }
        return id;
    }

    /** 웹 화면이 로그인 세션과 서버 주소를 넘겨준다. 알림 감시 서비스가 앱 화면 없이 업로드할 때 쓴다. */
    public void setSync(String apiBase, String token) {
        prefs.edit().putString(KEY_API_BASE, apiBase).putString(KEY_TOKEN, token).apply();
    }

    public void clearSync() {
        prefs.edit().remove(KEY_API_BASE).remove(KEY_TOKEN).apply();
    }

    public String apiBase() {
        return prefs.getString(KEY_API_BASE, null);
    }

    public String token() {
        return prefs.getString(KEY_TOKEN, null);
    }

    public int configVersion() {
        return prefs.getInt(KEY_CONFIG_VERSION, 0);
    }

    /** 서버 사본과 같은 내용을 기기에 적용하고 버전을 기록한다. */
    public void applyConfig(JSONArray targets, JSONArray templates, int version) {
        prefs.edit()
            .putString(KEY_TARGETS, targets.toString())
            .putString(KEY_TEMPLATES, templates.toString())
            .putInt(KEY_CONFIG_VERSION, version)
            .apply();
    }

    public void setConfigVersion(int version) {
        prefs.edit().putInt(KEY_CONFIG_VERSION, version).apply();
    }

    // ───── 중복 방지 ─────

    /** 처음 보는 이벤트이면 기록하고 true. 같은 이벤트의 재통지는 false */
    public synchronized boolean markIfNew(String fingerprint, long now) {
        JSONObject recent;
        try {
            recent = new JSONObject(prefs.getString(KEY_RECENT, "{}"));
        } catch (JSONException e) {
            recent = new JSONObject();
        }
        Iterator<String> keys = recent.keys();
        JSONObject kept = new JSONObject();
        while (keys.hasNext()) {
            String k = keys.next();
            long at = recent.optLong(k);
            if (now - at < DEDUPE_MS) {
                try {
                    kept.put(k, at);
                } catch (JSONException ignored) {
                    // 숫자 값이라 실패하지 않는다.
                }
            }
        }
        boolean fresh = !kept.has(fingerprint);
        if (fresh) {
            try {
                kept.put(fingerprint, now);
            } catch (JSONException ignored) {
                // 숫자 값이라 실패하지 않는다.
            }
        }
        prefs.edit().putString(KEY_RECENT, kept.toString()).apply();
        return fresh;
    }

    // ───── 알림 기록 ─────

    public boolean insertNotification(String packageName, String title, String text, String rawText, String bigText, String notificationKey, String eventKey, long eventAt, long postedAt, String matchedTemplateId) {
        SQLiteDatabase w = db.getWritableDatabase();
        boolean changed = true;
        w.beginTransaction();
        try {
        long existingId = -1;
        int revision = 0;
        try (Cursor c = w.query("notifications", null, "event_key = ?", new String[] { eventKey }, null, null, null)) {
            if (c.moveToFirst()) {
                existingId = c.getLong(c.getColumnIndexOrThrow("id"));
                revision = c.getInt(c.getColumnIndexOrThrow("revision"));
                changed = !java.util.Objects.equals(title, c.getString(c.getColumnIndexOrThrow("title")))
                    || !java.util.Objects.equals(text, c.getString(c.getColumnIndexOrThrow("body")))
                    || !java.util.Objects.equals(rawText, c.getString(c.getColumnIndexOrThrow("raw_text")))
                    || !java.util.Objects.equals(bigText, c.getString(c.getColumnIndexOrThrow("big_text")))
                    || !java.util.Objects.equals(matchedTemplateId, c.getString(c.getColumnIndexOrThrow("template_id")));
            }
        }
        if (changed) {
        ContentValues v = new ContentValues();
        v.put("pkg", packageName);
        v.put("title", title);
        v.put("body", text);
        if (existingId < 0) v.put("posted_at", postedAt);
        v.put("template_id", matchedTemplateId);
        v.put("raw_text", rawText);
        v.put("big_text", bigText);
        v.put("notification_key", notificationKey);
        v.put("event_key", eventKey);
        v.put("event_at", eventAt);
        v.put("revision", revision + 1);
        v.put("synced", 0);
        if (existingId < 0) w.insertOrThrow("notifications", null, v);
        else w.update("notifications", v, "id = ?", new String[] { String.valueOf(existingId) });
        }
        w.delete("notifications", "posted_at < ?", new String[] { String.valueOf(postedAt - KEEP_MS) });
        w.execSQL(
            "DELETE FROM notifications WHERE pkg = ? AND id NOT IN (SELECT id FROM notifications WHERE pkg = ? ORDER BY posted_at DESC LIMIT " + KEEP_PER_APP + ")",
            new Object[] { packageName, packageName }
        );
        w.setTransactionSuccessful();
        } finally { w.endTransaction(); }
        return changed;
    }

    /** 아직 서버에 올리지 못한 알림. 오래된 것부터 */
    public JSONArray pendingUploads(int limit) {
        JSONArray out = new JSONArray();
        try (Cursor c = db.getReadableDatabase().query("notifications", null, "synced = 0", null, null, null, "id ASC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("localId", c.getLong(c.getColumnIndexOrThrow("id")));
                o.put("packageName", c.getString(c.getColumnIndexOrThrow("pkg")));
                o.put("title", nonNull(c.getString(c.getColumnIndexOrThrow("title"))));
                o.put("text", nonNull(c.getString(c.getColumnIndexOrThrow("body"))));
                o.put("postedAt", c.getLong(c.getColumnIndexOrThrow("posted_at")));
                putFields(o, c);
                String template = c.getString(c.getColumnIndexOrThrow("template_id"));
                o.put("matchedTemplateId", template == null ? JSONObject.NULL : template);
                out.put(o);
            }
        } catch (JSONException e) {
            // 문자열과 숫자만 넣으므로 일어나지 않는다.
        }
        return out;
    }

    public void markSynced(JSONArray items) {
        SQLiteDatabase w = db.getWritableDatabase();
        ContentValues v = new ContentValues();
        v.put("synced", 1);
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o != null) w.update("notifications", v, "id = ? AND revision = ?", new String[] { String.valueOf(o.optLong("localId")), String.valueOf(o.optInt("revision")) });
        }
    }

    private static String nonNull(String value) {
        return value == null ? "" : value;
    }

    private static void putFields(JSONObject o, Cursor c) throws JSONException {
        for (String[] pair : new String[][] { {"rawText", "raw_text"}, {"bigText", "big_text"}, {"notificationKey", "notification_key"}, {"eventKey", "event_key"} }) {
            String value = c.getString(c.getColumnIndexOrThrow(pair[1]));
            o.put(pair[0], value == null ? JSONObject.NULL : value);
        }
        int at = c.getColumnIndexOrThrow("event_at");
        o.put("eventAt", c.isNull(at) ? JSONObject.NULL : c.getLong(at));
        o.put("revision", c.getInt(c.getColumnIndexOrThrow("revision")));
    }

    public JSONArray notifications(String packageName, int limit) {
        JSONArray out = new JSONArray();
        String where = packageName == null ? null : "pkg = ?";
        String[] args = packageName == null ? null : new String[] { packageName };
        try (Cursor c = db.getReadableDatabase().query("notifications", null, where, args, null, null, "posted_at DESC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                JSONObject o = new JSONObject();
                o.put("id", c.getLong(c.getColumnIndexOrThrow("id")));
                o.put("packageName", c.getString(c.getColumnIndexOrThrow("pkg")));
                o.put("title", c.getString(c.getColumnIndexOrThrow("title")));
                o.put("text", c.getString(c.getColumnIndexOrThrow("body")));
                o.put("postedAt", c.getLong(c.getColumnIndexOrThrow("posted_at")));
                putFields(o, c);
                String template = c.getString(c.getColumnIndexOrThrow("template_id"));
                o.put("matchedTemplateId", template == null ? JSONObject.NULL : template);
                out.put(o);
            }
        } catch (JSONException e) {
            // 문자열과 숫자만 넣으므로 일어나지 않는다.
        }
        return out;
    }

    public void deleteNotifications(String packageName) {
        db.getWritableDatabase().delete("notifications", "pkg = ?", new String[] { packageName });
    }

    private static final class Db extends SQLiteOpenHelper {
        Db(Context context) {
            // 2: 서버 업로드 여부(synced)
            super(context, "domo_notify.db", null, 3);
        }

        @Override
        public void onCreate(SQLiteDatabase d) {
            d.execSQL(
                "CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, pkg TEXT NOT NULL, title TEXT, body TEXT, posted_at INTEGER NOT NULL, template_id TEXT, synced INTEGER NOT NULL DEFAULT 0, raw_text TEXT, big_text TEXT, notification_key TEXT, event_key TEXT, event_at INTEGER, revision INTEGER NOT NULL DEFAULT 0)"
            );
            d.execSQL("CREATE INDEX notifications_pkg_posted ON notifications (pkg, posted_at)");
            d.execSQL("CREATE UNIQUE INDEX notifications_event_uq ON notifications (event_key)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase d, int oldVersion, int newVersion) {
            // 이전에 받은 알림도 올리도록 0(미전송)으로 둔다.
            if (oldVersion < 2) d.execSQL("ALTER TABLE notifications ADD COLUMN synced INTEGER NOT NULL DEFAULT 0");
            if (oldVersion < 3) {
                for (String column : new String[] { "raw_text TEXT", "big_text TEXT", "notification_key TEXT", "event_key TEXT", "event_at INTEGER", "revision INTEGER NOT NULL DEFAULT 0" }) d.execSQL("ALTER TABLE notifications ADD COLUMN " + column);
                d.execSQL("CREATE UNIQUE INDEX notifications_event_uq ON notifications (event_key)");
            }
        }
    }
}
