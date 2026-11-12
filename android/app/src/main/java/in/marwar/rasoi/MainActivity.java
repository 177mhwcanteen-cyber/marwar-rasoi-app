package in.marwar.rasoi;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BtPrinterPlugin.class);
        super.onCreate(savedInstanceState);
        ringIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        ringIntent(intent);
    }

    /** 🔔 ऑर्डर की घंटी से खुला — लॉक-स्क्रीन के ऊपर, स्क्रीन जगाकर */
    private void ringIntent(Intent it) {
        if (it == null || !it.getBooleanExtra("seRing", false)) return;
        OrderRingService.opened = true;
        try {
            if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
            else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        } catch (Exception ignore) { }
    }
}
