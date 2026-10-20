package com.cloimism.domo.notify;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** 웹(core)과 같은 사례 파일로 안드로이드 매처를 검사한다. */
public class NotifyMatcherTest {
    @Test
    public void matchesSharedCases() throws Exception {
        // 단위 테스트 작업 폴더는 app 모듈이다.
        String json = new String(Files.readAllBytes(Paths.get("../../../../packages/core/fixtures/notify-cases.json")), StandardCharsets.UTF_8);
        JSONArray cases = new JSONObject(json).getJSONArray("cases");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            String name = c.getString("name");
            NotifyMatcher.Match m = NotifyMatcher.apply(c.getString("pattern"), c.getString("kind"), c.optString("matchField", "title_body"), c.getString("title"), c.getString("text"), c.has("rawText") ? c.getString("rawText") : null, c.has("bigText") ? c.getString("bigText") : null, c.getString("postedAt"));
            if (c.isNull("expected")) {
                assertNull(name, m);
                continue;
            }
            JSONObject e = c.getJSONObject("expected");
            assertNotNull(name, m);
            assertEquals(name, e.getString("kind"), m.kind);
            assertEquals(name, e.getLong("amount"), m.amount);
            assertEquals(name, e.isNull("counterparty") ? null : e.getString("counterparty"), m.counterparty);
            assertEquals(name, e.isNull("memo") ? null : e.getString("memo"), m.memo);
            assertEquals(name, e.getString("occurredAt"), m.occurredAt);
        }
    }
}
