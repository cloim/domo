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
 * 알림 연동 설정과 기록을 기기에만 저장한다.
 * 대상 앱과 템플릿은 SharedPreferences(JSON), 알림 기록은 SQLite 에 둔다.
 * AI 설정과 키는 계정별로 서버에 있다.
 */
public final class NotifyStore {
    private static final String PREFS = "domo_notify";
    private static final String KEY_TARGETS = "targets";
    private static final String KEY_TEMPLATES = "templates";
    private static final String KEY_RECENT = "recent_matches";

    /** 앱마다 보관하는 최근 알림 수와 기간 */
    static final int KEEP_PER_APP = 200;
    static final long KEEP_MS = 30L * 24 * 60 * 60 * 1000;
    /** 같은 내용의 알림을 다시 등록 알림으로 띄우지 않는 기간 */
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

    // ───── 중복 방지 ─────

    /** 처음 보는 내용이면 기록하고 true. 하루 안에 같은 내용이 다시 오면 false */
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

    public void insertNotification(String packageName, String title, String text, long postedAt, String matchedTemplateId) {
        SQLiteDatabase w = db.getWritableDatabase();
        ContentValues v = new ContentValues();
        v.put("pkg", packageName);
        v.put("title", title);
        v.put("body", text);
        v.put("posted_at", postedAt);
        v.put("template_id", matchedTemplateId);
        w.insert("notifications", null, v);
        w.delete("notifications", "posted_at < ?", new String[] { String.valueOf(postedAt - KEEP_MS) });
        w.execSQL(
            "DELETE FROM notifications WHERE pkg = ? AND id NOT IN (SELECT id FROM notifications WHERE pkg = ? ORDER BY posted_at DESC LIMIT " + KEEP_PER_APP + ")",
            new Object[] { packageName, packageName }
        );
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
            super(context, "domo_notify.db", null, 1);
        }

        @Override
        public void onCreate(SQLiteDatabase d) {
            d.execSQL(
                "CREATE TABLE notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, pkg TEXT NOT NULL, title TEXT, body TEXT, posted_at INTEGER NOT NULL, template_id TEXT)"
            );
            d.execSQL("CREATE INDEX notifications_pkg_posted ON notifications (pkg, posted_at)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase d, int oldVersion, int newVersion) {
            // 첫 버전이다.
        }
    }
}
