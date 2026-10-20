package com.cloimism.domo.notify;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** 같은 메시지의 재게시와 서로 다른 시각의 동일 문구를 구분한다. */
public final class NotifyEvent {
    private NotifyEvent() {}

    public static String key(String pkg, String notificationKey, long eventAt, long messageAt, String title, String message) {
        String identity = messageAt > 0
            ? "message\n" + pkg + "\n" + title + "\n" + messageAt + "\n" + message
            : "notification\n" + pkg + "\n" + notificationKey + "\n" + eventAt + "\n" + title + "\n" + message;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte b : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
