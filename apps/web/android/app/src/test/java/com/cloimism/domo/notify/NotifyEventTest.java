package com.cloimism.domo.notify;

import static org.junit.Assert.*;
import org.junit.Test;

public class NotifyEventTest {
    @Test public void ignoresEmptyOrTextOnlyBodies() {
        assertFalse(NotifyEvent.shouldCapture(""));
        assertFalse(NotifyEvent.shouldCapture("새로운 메시지가 도착했어요"));
        assertFalse(NotifyEvent.shouldCapture("결제가 승인되었습니다\n자세한 내용을 확인해 주세요"));
    }
    @Test public void capturesBodiesWithAnyDigit() {
        assertTrue(NotifyEvent.shouldCapture("결제 1,000원"));
        assertTrue(NotifyEvent.shouldCapture("잔액 0원"));
        assertTrue(NotifyEvent.shouldCapture("안내\n10월 이용 내역"));
        assertTrue(NotifyEvent.shouldCapture("결제 １０００원"));
        assertTrue(NotifyEvent.shouldCapture("숫자 𝟙"));
    }

    @Test public void sameMessageRepostedWithAnotherNotificationKeyIsOneEvent() {
        assertEquals(NotifyEvent.key("kakao", "first", 1000, 1000, "방", "안녕"), NotifyEvent.key("kakao", "second", 1000, 1000, "방", "안녕"));
    }
    @Test public void identicalMessagesAtDifferentTimesStaySeparate() {
        assertNotEquals(NotifyEvent.key("kakao", "same", 1000, 1000, "방", "안녕"), NotifyEvent.key("kakao", "same", 2000, 2000, "방", "안녕"));
    }
    @Test public void notificationUpdateRetainsIdentityButAnotherPaymentDoesNot() {
        String first = NotifyEvent.key("bank", "same", 1000, 0, "제목", "짧은 본문");
        assertEquals(first, NotifyEvent.key("bank", "same", 1000, 0, "제목", "짧은 본문"));
        assertNotEquals(first, NotifyEvent.key("bank", "same", 1000, 0, "제목", "다른 결제"));
        assertNotEquals(first, NotifyEvent.key("bank", "same", 2000, 0, "제목", "짧은 본문"));
        assertNotEquals(first, NotifyEvent.key("other", "same", 1000, 0, "제목", "짧은 본문"));
        assertEquals(64, first.length());
    }
}
