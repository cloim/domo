package com.cloimism.domo.widget;

import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

public class DomoRecordTile extends TileService {
    @Override public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) { tile.setState(Tile.STATE_INACTIVE); tile.setLabel("도모 기록"); tile.updateTile(); }
    }
    @Override public void onClick() {
        super.onClick();
        Runnable open = () -> {
            if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(DomoWidgetProvider.addIntent(this));
            else {
                android.content.Intent intent = new android.content.Intent(this, com.cloimism.domo.MainActivity.class);
                intent.setData(android.net.Uri.parse("domo://records/new"));
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivityAndCollapse(intent);
            }
        };
        if (isLocked()) unlockAndRun(open); else open.run();
    }
}
