package com.cloimism.domo.notify;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.cloimism.domo.MainActivity;
import com.cloimism.domo.R;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * 대상 앱의 알림을 기기에 기록하고, 템플릿과 맞으면 도모 등록 알림을 띄운다.
 * 앱 화면이 꺼져 있어도 시스템이 이 서비스에 알림을 전달한다.
 */
public class DomoNotificationListener extends NotificationListenerService {
    static final String CHANNEL_ID = "domo_register";
    static final String EXTRA_PREFILL = "domo_prefill";

    /** 시스템과 연결된 상태. 상단바 상태 표시에 쓴다. */
    static volatile boolean connected = false;

    @Override
    public void onListenerConnected() {
        connected = true;
    }

    @Override
    public void onListenerDisconnected() {
        connected = false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (getPackageName().equals(sbn.getPackageName())) return;
        Notification n = sbn.getNotification();
        // 묶음 요약 알림은 개별 알림과 내용이 겹친다.
        if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        NotifyStore store = new NotifyStore(this);
        JSONObject target = store.target(sbn.getPackageName());
        if (target == null || !target.optBoolean("enabled", true)) return;

        Bundle extras = n.extras;
        String title = text(extras.getCharSequence(Notification.EXTRA_TITLE));
        if (title.length() > 500) title = title.substring(0, 500);
        String rawText = text(extras.getCharSequence(Notification.EXTRA_TEXT));
        String bigText = text(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        String body = bigText.isEmpty() ? rawText : bigText;
        if (!NotifyEvent.shouldCapture(body)) return;

        long postedAt = sbn.getPostTime();
        long messageAt = 0;
        String message = rawText;
        NotificationCompat.MessagingStyle style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n);
        if (style != null) {
            java.util.List<NotificationCompat.MessagingStyle.Message> messages = style.getMessages();
            if (!messages.isEmpty()) {
                NotificationCompat.MessagingStyle.Message last = messages.get(messages.size() - 1);
                messageAt = last.getTimestamp();
                message = text(last.getText());
            }
        }
        long eventAt = messageAt > 0 ? messageAt : n.when > 0 ? n.when : postedAt;
        String eventKey = NotifyEvent.key(sbn.getPackageName(), sbn.getKey(), eventAt, messageAt, title, message);
        String postedLocal = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.ROOT).format(new Date(postedAt));

        String matchedId = null;
        JSONObject matchedTemplate = null;
        NotifyMatcher.Match matched = null;
        JSONArray templates = store.templates();
        for (int i = 0; i < templates.length(); i++) {
            JSONObject t = templates.optJSONObject(i);
            if (t == null || !t.optBoolean("enabled", true) || !sbn.getPackageName().equals(t.optString("packageName"))) continue;
            NotifyMatcher.Match match = NotifyMatcher.apply(t.optString("pattern"), t.optString("kind", "expense"), t.optString("matchField", "title_body"), title, body, rawText, bigText, postedLocal);
            if (match == null) continue;
            matchedId = t.optString("id");
            matchedTemplate = t;
            matched = match;
            break;
        }
        boolean changed = store.insertNotification(sbn.getPackageName(), title, body, rawText, bigText, sbn.getKey(), eventKey, eventAt, postedAt, matchedId);
        if (changed && matched != null && store.markIfNew(eventKey, postedAt)) {
            postRegistration(matchedTemplate, matched, sbn.getPackageName());
            if (target.optBoolean("removeOriginal", false)) cancelNotification(sbn.getKey());
        }
        // PC에서도 볼 수 있게 바로 서버에 올린다. 실패분은 다음 알림 때 함께 보낸다.
        NotifySync.kick(this);
    }

    private static String text(CharSequence value) {
        String result = value == null ? "" : value.toString().trim();
        return result.length() > 4000 ? result.substring(0, 4000) : result;
    }

    private void postRegistration(JSONObject template, NotifyMatcher.Match match, String sourcePackage) {
        ensureChannel(this);
        JSONObject prefill = new JSONObject();
        try {
            prefill.put("kind", match.kind);
            prefill.put("amount", match.amount);
            prefill.put("counterparty", match.counterparty == null ? JSONObject.NULL : match.counterparty);
            prefill.put("memo", match.memo == null ? JSONObject.NULL : match.memo);
            prefill.put("occurredAt", match.occurredAt);
            prefill.put("paymentMethodId", template.isNull("paymentMethodId") ? JSONObject.NULL : template.optString("paymentMethodId"));
            prefill.put("categoryId", template.isNull("categoryId") ? JSONObject.NULL : template.optString("categoryId"));
            prefill.put("templateId", template.optString("id"));
            prefill.put("sourcePackage", sourcePackage);
        } catch (JSONException e) {
            return;
        }

        int requestCode = (int) (System.currentTimeMillis() & 0x7fffffff);
        Intent intent = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_PREFILL, prefill.toString());
        PendingIntent pending = PendingIntent.getActivity(this, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String kindLabel = "income".equals(match.kind) ? "수입" : "지출";
        String amount = NumberFormat.getNumberInstance(Locale.KOREA).format(match.amount) + "원";
        String detail = kindLabel + " " + amount + (match.counterparty == null ? "" : " · " + match.counterparty);
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_domo)
            .setContentTitle("도모에 기록할까요?")
            .setContentText(detail)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(detail + "\n눌러서 확인하고 저장하세요."))
            .setContentIntent(pending)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .build();
        try {
            NotificationManagerCompat.from(this).notify(requestCode, notification);
        } catch (SecurityException e) {
            // 알림 표시 권한이 없으면 띄우지 못한다. 상태 화면에서 권한을 안내한다.
        }
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "기록 등록 알림", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("다른 앱의 결제, 입금 알림을 보고 도모에 기록하도록 안내합니다.");
        manager.createNotificationChannel(channel);
    }
}
