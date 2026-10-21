package com.cloimism.domo.widget;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class WidgetSnapshotTest {
    @Test public void acceptsEpochMillisecondsAndLargeBalancesFromJson() throws Exception {
        WidgetSnapshot snapshot = new WidgetSnapshot(new JSONObject("{\"month\":\"2026-10\",\"balance\":3000000000,\"updatedAt\":1792537200000}"));
        assertEquals(3000000000L, snapshot.balance);
        assertEquals(1792537200000L, snapshot.updatedAt);
    }
    @Test public void acceptsZeroAndNegativeBalances() throws Exception {
        assertEquals(0, new WidgetSnapshot(new JSONObject("{\"month\":\"2026-10\",\"balance\":0,\"updatedAt\":1792537200000}")).balance);
        assertEquals(-12345, new WidgetSnapshot(new JSONObject("{\"month\":\"2026-10\",\"balance\":-12345,\"updatedAt\":1792537200000}")).balance);
    }
    @Test public void rejectsInvalidSnapshot() throws Exception {
        for (String json : new String[] {
            "{\"month\":\"2026-13\",\"balance\":0,\"updatedAt\":1792537200000}",
            "{\"month\":\"2026-10\",\"balance\":\"0\",\"updatedAt\":1792537200000}",
            "{\"month\":\"2026-10\",\"balance\":0,\"updatedAt\":0}",
            "{\"month\":\"2026-10\",\"balance\":0}"
        }) {
            assertThrows(IllegalArgumentException.class, () -> new WidgetSnapshot(new JSONObject(json)));
        }
    }
}
