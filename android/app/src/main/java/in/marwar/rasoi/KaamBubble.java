package in.marwar.rasoi;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/**
 * 🫧 योजना-9 (17-11-2026, विक्रम जी: "जैसे मेरे फ़ोन पर बबल रहता है, वैसे ही साथियों के फ़ोन पर भी — उसमें उनके काम"):
 * हर ऐप के ऊपर छोटा गोला (खुले काम की गिनती; 🚨 हो तो लाल), खिसका सकते हैं; दबाओ = काम की सूची, सूची का काम दबाओ = ऐप खुले।
 * अनुमति: "दूसरे ऐप के ऊपर दिखाएँ" (Settings.canDrawOverlays)। साथी ☰ और से बंद कर सकता है (prefs "bub")।
 */
final class KaamBubble {
    private static WindowManager wm;
    private static LinearLayout root;
    private static TextView dot;
    private static LinearLayout list;
    private static ScrollView sv;
    private static WindowManager.LayoutParams lp;
    private static boolean open = false;
    private static final Handler M = new Handler(Looper.getMainLooper());

    static boolean can(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }
    static boolean on(Context c) { return OrderRingService.prefs(c).getBoolean("bub", true) && OrderRingService.prefs(c).getString("em", "").length() > 0; }

    private static int dp(Context c, float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()); }

    /** सेवा से (हर जाँच पर): n खुले काम, ऊपर के काम (🚨 पहले) */
    static void update(final Context ctx, final int n, final boolean urgent, final List<String> tops) {
        final Context c = ctx.getApplicationContext();
        final List<String> t = new ArrayList<>(tops);
        M.post(new Runnable() { public void run() {
            try {
                if (!on(c) || !can(c)) { hide(); return; }
                show(c);
                dot.setText(n > 0 ? String.valueOf(n) : "✓");
                GradientDrawable g = (GradientDrawable) dot.getBackground();
                g.setColor(urgent ? 0xFFDC2626 : n > 0 ? 0xFF4C1D95 : 0xFF15803D);
                list.removeAllViews();
                TextView h = new TextView(c);
                h.setText(n > 0 ? "📋 मेरे " + n + " काम बाकी" : "✓ अभी कोई काम बाकी नहीं");
                h.setTextColor(0xFFFDE68A); h.setTextSize(15); h.setPadding(dp(c, 10), dp(c, 8), dp(c, 10), dp(c, 6));
                h.setTypeface(null, android.graphics.Typeface.BOLD);
                list.addView(h);
                for (int i = 0; i < Math.min(12, t.size()); i++) {
                    TextView r = new TextView(c);
                    r.setText((i + 1) + ". " + t.get(i));
                    r.setTextColor(0xFFFFFFFF); r.setTextSize(14); r.setMaxLines(2);
                    r.setPadding(dp(c, 10), dp(c, 6), dp(c, 10), dp(c, 6));
                    r.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openApp(c); } });
                    list.addView(r);
                }
                TextView b = new TextView(c);
                b.setText("📲 ऐप खोलें — हो गया / गया / नहीं बताएँ");
                b.setTextColor(0xFF1E1B4B); b.setTextSize(14); b.setGravity(Gravity.CENTER);
                b.setTypeface(null, android.graphics.Typeface.BOLD);
                GradientDrawable bg = new GradientDrawable(); bg.setColor(0xFFFBBF24); bg.setCornerRadius(dp(c, 12)); b.setBackground(bg);
                b.setPadding(dp(c, 8), dp(c, 10), dp(c, 8), dp(c, 10));
                LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(-1, -2); bl.setMargins(dp(c, 8), dp(c, 6), dp(c, 8), dp(c, 8));
                b.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openApp(c); } });
                list.addView(b, bl);
            } catch (Exception ignore) { }
        } });
    }

    static void hideNow() { M.post(new Runnable() { public void run() { hide(); } }); }

    private static void openApp(Context c) {
        try {
            Intent it = new Intent(c, MainActivity.class);
            it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            c.startActivity(it);
        } catch (Exception ignore) { }
        setOpen(false);
    }

    private static void setOpen(boolean o) {
        open = o;
        if (sv != null) sv.setVisibility(o ? View.VISIBLE : View.GONE);
        try {
            if (lp != null && root != null) {
                lp.flags = o ? (WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH)
                        : (WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL);
                lp.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                wm.updateViewLayout(root, lp);
            }
        } catch (Exception ignore) { }
    }

    private static void hide() {
        try { if (root != null && wm != null) wm.removeView(root); } catch (Exception ignore) { }
        root = null; dot = null; list = null; sv = null; open = false;
    }

    private static void show(final Context c) {
        if (root != null) return;
        wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
        root = new LinearLayout(c);
        root.setOrientation(LinearLayout.VERTICAL);
        dot = new TextView(c);
        dot.setGravity(Gravity.CENTER); dot.setTextColor(0xFFFFFFFF); dot.setTextSize(18);
        dot.setTypeface(null, android.graphics.Typeface.BOLD);
        GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(0xFF4C1D95); g.setStroke(dp(c, 3), 0xFFFBBF24);
        dot.setBackground(g);
        root.addView(dot, new LinearLayout.LayoutParams(dp(c, 54), dp(c, 54)));
        sv = new ScrollView(c);
        list = new LinearLayout(c); list.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable pb = new GradientDrawable(); pb.setColor(0xF01E1B4B); pb.setCornerRadius(dp(c, 16)); pb.setStroke(dp(c, 2), 0xFFFBBF24);
        sv.setBackground(pb);
        sv.addView(list);
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(dp(c, 280), -2); sl.topMargin = dp(c, 6);
        root.addView(sv, sl);
        sv.setVisibility(View.GONE);
        sv.getLayoutParams().height = -2;
        list.setMinimumHeight(dp(c, 60));
        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(-2, -2, type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = OrderRingService.prefs(c).getInt("bx", dp(c, 4));
        lp.y = OrderRingService.prefs(c).getInt("by", dp(c, 220));
        root.setOnTouchListener(new View.OnTouchListener() { public boolean onTouch(View v, MotionEvent e) {
            if (e.getAction() == MotionEvent.ACTION_OUTSIDE && open) setOpen(false);
            return false; } });
        dot.setOnTouchListener(new View.OnTouchListener() {
            float sx, sy; int ox, oy; boolean moved;
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getAction()) {
                    case MotionEvent.ACTION_DOWN: sx = e.getRawX(); sy = e.getRawY(); ox = lp.x; oy = lp.y; moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (e.getRawX() - sx), dy = (int) (e.getRawY() - sy);
                        if (Math.abs(dx) + Math.abs(dy) > dp(c, 8)) moved = true;
                        if (moved) { lp.x = ox + dx; lp.y = Math.max(0, oy + dy); try { wm.updateViewLayout(root, lp); } catch (Exception ignore) { } }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (moved) OrderRingService.prefs(c).edit().putInt("bx", lp.x).putInt("by", lp.y).apply();
                        else setOpen(!open);
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(root, lp); } catch (Exception e) { root = null; }
    }
}
