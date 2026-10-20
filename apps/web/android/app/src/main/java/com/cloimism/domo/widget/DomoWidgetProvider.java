package com.cloimism.domo.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;
import com.cloimism.domo.MainActivity;
import com.cloimism.domo.R;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class DomoWidgetProvider extends AppWidgetProvider {
    public static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences("domo_widget", Context.MODE_PRIVATE);
    }
    public static PendingIntent addIntent(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setData(Uri.parse("domo://records/new"));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 42, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, DomoWidgetProvider.class));
        for (int id : ids) {
            SharedPreferences data = prefs(context);
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.domo_widget);
            String month = data.getString("month", "");
            views.setTextViewText(R.id.widget_title, month.isEmpty() ? "도모" : month + " 월 잔액");
            views.setTextViewText(R.id.widget_balance, month.isEmpty() ? "앱에서 로그인해 주세요" : NumberFormat.getIntegerInstance(Locale.KOREA).format(data.getLong("balance", 0)) + "원");
            long updated = data.getLong("updatedAt", 0);
            views.setTextViewText(R.id.widget_updated, updated == 0 ? "함께 쓰는 가족 가계부" : new SimpleDateFormat("MM.dd HH:mm", Locale.KOREA).format(new Date(updated)) + " 기준 | 수입 − 실지출");
            views.setOnClickPendingIntent(R.id.widget_add, addIntent(context));
            Intent open = new Intent(context, MainActivity.class);
            views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context, 43, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            manager.updateAppWidget(id, views);
        }
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { refresh(context); }
}
