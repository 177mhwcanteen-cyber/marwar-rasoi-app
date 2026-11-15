package in.marwar.rasoi;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.List;
import java.util.Set;

/**
 * 🔔 मारवाड़ रसोई — ऑर्डर की घंटी (Blinkit के राइडर जैसी)।
 * ऐप बंद हो, स्क्रीन बंद हो, तब भी: हर 20 सेकंड Firestore से "orders where status == new" पूछती है (लॉगिन वाले की चाबी से),
 * नया ऑर्डर मिले तो अलार्म की आवाज़ (पूरी आवाज़, लूप) + कंपन + लॉक-स्क्रीन पर पूरी स्क्रीन की सूचना।
 * घंटी तब तक (60 सेकंड बजे, 45 सेकंड रुके, फिर बजे) जब तक कोई साथी ऑर्डर स्वीकार न करे या "🔕 चुप" न दबाए।
 * चाबी (refresh token) सिर्फ़ ऐप की अपनी निजी जगह (SharedPreferences) में।
 */
public class OrderRingService extends Service {
    static final String PREF = "se_ring";
    static final String CH_WATCH = "se_ring_watch";
    static final String CH_ALARM = "se_order_alarm_v1";
    static final int NID_WATCH = 4611;
    static final int NID_ALARM = 4612;
    static final String A_SILENCE = "in.marwar.rasoi.RING_SILENCE";
    static final String A_TEST = "in.marwar.rasoi.RING_TEST";
    static final String A_RDONE = "in.marwar.rasoi.REM_DONE";
    static final String A_RSNZ = "in.marwar.rasoi.REM_SNOOZE";
    static final String CH_REM = "mr_remind_v1";
    static final int NID_REM = 4620;

    static volatile boolean running = false;
    static volatile boolean ringing = false;
    static volatile long lastOk = 0;
    static volatile String lastErr = "";
    static volatile int pending = 0;
    static volatile long checks = 0;
    static volatile boolean opened = false; // सूचना से ऐप खुला — JS ऑर्डर दिखाए

    private HandlerThread th;
    private Handler h;
    private PowerManager.WakeLock wl;
    private MediaPlayer mp;
    private Vibrator vib;
    private int oldVol = -1;
    private long ringStart = 0, ringEnd = 0;
    private final Set<String> silenced = new HashSet<>();
    private List<String[]> cur = new ArrayList<>();
    // ⏰ रिमाइंडर (15-11-2026, विक्रम जी): conf/remind से — किसके लिए (पद), किस समय, कौन-सी घंटी, "रसोई पर हो तभी"
    private JSONArray rList = null;
    private double rLat = 0, rLng = 0;
    private long rFetch = 0;
    private MediaPlayer rmp;
    private String testTone = null;
    private final Map<String, Long> rOpen = new HashMap<>(); // बजे पर जवाब नहीं — 15 मिनट बाद "छूटा"
    private final Map<String, String[]> rInfo = new HashMap<>();

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        th = new HandlerThread("se-ring");
        th.start();
        h = new Handler(th.getLooper());
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rasoi:orderRing");
            wl.setReferenceCounted(false);
            wl.acquire();
        } catch (Exception ignore) { }
        try { vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE); } catch (Exception ignore) { }
        try {
            String s = prefs(this).getString("sil", "");
            for (String x : s.split(",")) if (x.length() > 0) silenced.add(x);
        } catch (Exception ignore) { }
    }

    private void channels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel w = new NotificationChannel(CH_WATCH, "ऑर्डर की घंटी चालू", NotificationManager.IMPORTANCE_MIN);
        w.setShowBadge(false);
        nm.createNotificationChannel(w);
        NotificationChannel r = new NotificationChannel(CH_REM, "⏰ रिमाइंडर (अलार्म)", NotificationManager.IMPORTANCE_HIGH);
        r.setSound(null, null);
        r.enableVibration(false);
        r.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        r.setBypassDnd(true);
        nm.createNotificationChannel(r);
        NotificationChannel a = new NotificationChannel(CH_ALARM, "🔔 नया ऑर्डर (अलार्म)", NotificationManager.IMPORTANCE_HIGH);
        a.setSound(null, null); // आवाज़ हम खुद अलार्म की तरह बजाते हैं
        a.enableVibration(false);
        a.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        a.setBypassDnd(true);
        nm.createNotificationChannel(a);
    }

    private PendingIntent openApp(int req, boolean ring) {
        Intent it = new Intent(this, MainActivity.class);
        it.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (ring) it.putExtra("seRing", true);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, req, it, fl);
    }

    private Notification watchNote() {
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_WATCH) : new Notification.Builder(this);
        String sub = lastErr.length() > 0 ? "⚠ " + lastErr : "ऐप बंद हो तब भी नया ऑर्डर आते ही घंटी बजेगी";
        return b.setContentTitle("🔔 ऑर्डर की घंटी चालू")
                .setContentText(sub)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setContentIntent(openApp(1, false))
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        channels();
        Notification n = watchNote();
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NID_WATCH, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NID_WATCH, n);
        } catch (Exception e) {
            lastErr = "शुरू नहीं हुई: " + e.getMessage();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!prefs(this).getBoolean("on", false)) { stopSelf(); return START_NOT_STICKY; }
        String a = intent != null ? intent.getAction() : null;
        if (A_SILENCE.equals(a)) {
            h.post(new Runnable() { public void run() { silenceAll(); } });
        } else if (A_TEST.equals(a)) {
            testTone = intent.getStringExtra("tone");
            h.post(new Runnable() { public void run() { test(); } });
        } else if (A_RDONE.equals(a) || A_RSNZ.equals(a)) {
            final String key = intent.getStringExtra("key");
            final boolean done = A_RDONE.equals(a);
            h.post(new Runnable() { public void run() { remAct(key, done ? "done" : "snooze"); } });
        }
        if (!running) {
            running = true;
            h.post(loop);
        } else if (intent != null && intent.getBooleanExtra("now", false)) {
            h.removeCallbacks(loop);
            h.post(loop);
        }
        return START_STICKY;
    }

    private final Runnable loop = new Runnable() {
        public void run() {
            if (!running) return;
            try { if (prefs(OrderRingService.this).getBoolean("orders", true)) poll(); } catch (Exception e) { lastErr = String.valueOf(e.getMessage()); }
            try { remind(); } catch (Exception ignore) { }
            try { talk(); } catch (Exception ignore) { }
            h.postDelayed(this, every() * 1000L);
        }
    };

    /** दुकान खुली हो तो 20 सेकंड, बंद समय में 2 मिनट (Firestore की मुफ़्त सीमा बचाने को) */
    private int every() {
        SharedPreferences p = prefs(this);
        int ev = Math.max(10, p.getInt("every", 20));
        int o = p.getInt("open", -1), c = p.getInt("close", -1);
        if (o < 0 || c < 0 || o == c) return ev;
        Calendar k = Calendar.getInstance();
        int m = k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE);
        boolean open = o < c ? (m >= o - 30 && m <= c + 30) : (m >= o - 30 || m <= c + 30);
        return open ? ev : Math.max(ev, 120);
    }

    private static String sv(JSONObject f, String k) {
        JSONObject o = f.optJSONObject(k);
        if (o == null) return "";
        if (o.has("stringValue")) return o.optString("stringValue", "");
        if (o.has("integerValue")) return o.optString("integerValue", "");
        if (o.has("doubleValue")) return o.optString("doubleValue", "");
        return "";
    }

    private void poll() throws Exception {
        SharedPreferences p = prefs(this);
        String pid = p.getString("pid", "");
        if (pid.length() == 0) pid = Fs.pid(this);
        if (pid.length() == 0) throw new Exception("प्रोजेक्ट नहीं");
        String q = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"orders\"}],\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"status\"},\"op\":\"EQUAL\",\"value\":{\"stringValue\":\"new\"}}},\"limit\":30}}";
        if (!Fs.ready(this)) { // पुरानी APK से आई चाबी (se_ring) हो तो उसे साझा जगह में ले जाओ
            Fs.set(this, p.getString("rt", ""), p.getString("key", ""), pid, null);
        }
        String s = Fs.runQuery(this, q);
        JSONArray arr = new JSONArray(s);
        List<String[]> now = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject d = arr.getJSONObject(i).optJSONObject("document");
            if (d == null) continue;
            JSONObject f = d.optJSONObject("fields");
            if (f == null) f = new JSONObject();
            if ("signup".equals(sv(f, "src"))) continue; // नया खाता — ऑर्डर नहीं
            // ⏱ मालिक का फोन: "wait" सेकंड तक मैनेजर को मौका — उसके बाद भी ऑर्डर "new" रहे तभी यहाँ घंटी (मारवाड़ रसोई, 13-11-2026)
            int wait = p.getInt("wait", 0);
            if (wait > 0) {
                long ts = 0;
                try { JSONObject tv = f.optJSONObject("ts"); if (tv != null) ts = (long) Double.parseDouble(tv.optString("integerValue", tv.optString("doubleValue", "0"))); } catch (Exception ignore) { }
                if (ts > 0 && System.currentTimeMillis() - ts < wait * 1000L) continue;
            }
            String name = d.optString("name", "");
            String id = name.substring(name.lastIndexOf('/') + 1);
            int items = 0;
            JSONObject it = f.optJSONObject("items");
            if (it != null && it.optJSONObject("arrayValue") != null) {
                JSONArray v = it.optJSONObject("arrayValue").optJSONArray("values");
                if (v != null) items = v.length();
            }
            now.add(new String[]{id, sv(f, "name"), String.valueOf(items), sv(f, "addr")});
        }
        cur = now;
        checks++;
        lastOk = System.currentTimeMillis();
        boolean hadErr = lastErr.length() > 0;
        lastErr = "";
        if (hadErr) refreshWatch();
        // जो ऑर्डर अब "new" नहीं रहे, उनकी चुप्पी भी भूल जाओ
        Set<String> ids = new HashSet<>();
        for (String[] o : now) ids.add(o[0]);
        if (silenced.retainAll(ids)) saveSil();
        List<String[]> loud = new ArrayList<>();
        for (String[] o : now) if (!silenced.contains(o[0])) loud.add(o);
        pending = loud.size();
        long t = System.currentTimeMillis();
        if (loud.isEmpty()) {
            if (ringing) stopSound();
            cancelAlarm();
            return;
        }
        alarmNote(loud);
        if (ringing && t - ringStart > 60000) { stopSound(); ringEnd = t; }
        else if (!ringing && (ringEnd == 0 || t - ringEnd > 45000)) startSound();
    }

    private void saveSil() {
        StringBuilder b = new StringBuilder();
        for (String x : silenced) { if (b.length() > 0) b.append(','); b.append(x); }
        prefs(this).edit().putString("sil", b.toString()).apply();
    }

    private void refreshWatch() {
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_WATCH, watchNote()); } catch (Exception ignore) { }
    }

    private void alarmNote(List<String[]> loud) {
        String title = loud.size() == 1 ? "🛵 नया ऑर्डर — " + (loud.get(0)[1].length() > 0 ? loud.get(0)[1] : "ग्राहक") : "🛵 " + loud.size() + " नए ऑर्डर";
        StringBuilder t = new StringBuilder();
        for (String[] o : loud) {
            if (t.length() > 0) t.append(" · ");
            t.append(o[1].length() > 0 ? o[1] : "ग्राहक").append(" (").append(o[2]).append(" सामान)");
        }
        t.append(" — खोलकर स्वीकार करें");
        Intent si = new Intent(this, OrderRingService.class).setAction(A_SILENCE);
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent sp = PendingIntent.getService(this, 7, si, fl);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_ALARM) : new Notification.Builder(this);
        b.setContentTitle(title)
                .setContentText(t.toString())
                .setStyle(new Notification.BigTextStyle().bigText(t.toString()))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openApp(2, true))
                .setFullScreenIntent(openApp(3, true), true)
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "🔕 चुप", sp).build())
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "📥 खोलें", openApp(4, true)).build());
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_ALARM, b.build()); } catch (Exception ignore) { }
    }

    private void cancelAlarm() {
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NID_ALARM); } catch (Exception ignore) { }
    }

    /* ───────── 🎙️ वॉकी-टॉकी: नए talk/* (अपने नहीं) — बिना छुए बजे, स्क्रीन बंद हो तब भी ───────── */
    private MediaPlayer tmp;
    private void talk() throws Exception {
        if (!Fs.ready(this)) return;
        SharedPreferences p = prefs(this);
        long last = p.getLong("tklast", 0);
        if (last == 0) { last = System.currentTimeMillis(); p.edit().putLong("tklast", last).apply(); return; }
        if (tmp != null) return; // पिछला अभी बज रहा है
        String q = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"talk\"}],\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"ts\"},\"op\":\"GREATER_THAN\",\"value\":{\"integerValue\":\"" + last + "\"}}},\"orderBy\":[{\"field\":{\"fieldPath\":\"ts\"}}],\"limit\":3}}";
        JSONArray arr = new JSONArray(Fs.runQuery(this, q));
        String me = "";
        try { me = Fs.uid(this); } catch (Exception ignore) { }
        for (int i = 0; i < arr.length(); i++) {
            JSONObject d = arr.getJSONObject(i).optJSONObject("document");
            if (d == null) continue;
            JSONObject f = d.optJSONObject("fields");
            if (f == null) continue;
            long ts = 0;
            try { ts = Long.parseLong(sv(f, "ts").split("\\.")[0]); } catch (Exception ignore) { }
            if (ts > last) { last = ts; p.edit().putLong("tklast", ts).apply(); }
            if (me.length() > 0 && me.equals(sv(f, "uid"))) continue;
            String a = sv(f, "a");
            if (a.length() < 100 || System.currentTimeMillis() - ts > 10 * 60000L) continue;
            playTalk(a, sv(f, "mt"), sv(f, "by"));
            return; // एक बार में एक; अगला अगले चक्कर में
        }
    }

    private void playTalk(String b64, String mt, String by) {
        try {
            byte[] raw = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            java.io.File fl = new java.io.File(getCacheDir(), "talk." + (mt.contains("mp4") ? "m4a" : mt.contains("ogg") ? "ogg" : "webm"));
            java.io.FileOutputStream os = new java.io.FileOutputStream(fl);
            os.write(raw);
            os.close();
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_REM) : new Notification.Builder(this);
            b.setContentTitle("🎙️ " + (by.length() > 0 ? by : "टीम") + " का संदेश").setContentText("वॉकी-टॉकी — ऐप में दोबारा सुन सकते हैं")
                    .setSmallIcon(R.mipmap.ic_launcher).setAutoCancel(true).setContentIntent(openApp(8, false)).setPriority(Notification.PRIORITY_HIGH);
            try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_REM + 1, b.build()); } catch (Exception ignore) { }
            tmp = new MediaPlayer();
            tmp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tmp.setDataSource(fl.getAbsolutePath());
            tmp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() { public void onCompletion(MediaPlayer m) { try { m.release(); } catch (Exception ignore) { } tmp = null; } });
            tmp.prepare();
            tmp.start();
            h.postDelayed(new Runnable() { public void run() { try { if (tmp != null) { tmp.release(); tmp = null; } } catch (Exception ignore) { } } }, 30000);
        } catch (Exception e) { try { if (tmp != null) tmp.release(); } catch (Exception ignore) { } tmp = null; }
    }

    /* ───────── ⏰ रिमाइंडर ───────── */
    private static Object dec(JSONObject v) {
        if (v == null) return null;
        if (v.has("stringValue")) return v.optString("stringValue", "");
        if (v.has("integerValue")) return Double.parseDouble(v.optString("integerValue", "0"));
        if (v.has("doubleValue")) return v.optDouble("doubleValue", 0);
        if (v.has("booleanValue")) return v.optBoolean("booleanValue", false);
        if (v.has("arrayValue")) {
            JSONArray out = new JSONArray(), a = v.optJSONObject("arrayValue").optJSONArray("values");
            if (a != null) for (int i = 0; i < a.length(); i++) out.put(dec(a.optJSONObject(i)));
            return out;
        }
        if (v.has("mapValue")) {
            JSONObject out = new JSONObject(), f = v.optJSONObject("mapValue").optJSONObject("fields");
            if (f != null) { JSONArray n = f.names(); if (n != null) for (int i = 0; i < n.length(); i++) { try { out.put(n.optString(i), dec(f.optJSONObject(n.optString(i)))); } catch (Exception ignore) { } } }
            return out;
        }
        return null;
    }

    private void remFetch() throws Exception {
        String q = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"conf\"}],\"limit\":20}}";
        JSONArray arr = new JSONArray(Fs.runQuery(this, q));
        rFetch = System.currentTimeMillis();
        try { // पुराने दिनों की निशानियाँ साफ़
            Calendar k = Calendar.getInstance();
            String day = k.get(Calendar.YEAR) + "-" + (k.get(Calendar.MONTH) + 1) + "-" + k.get(Calendar.DAY_OF_MONTH) + "|";
            SharedPreferences.Editor ed = rp(this).edit();
            for (String key : rp(this).getAll().keySet()) if (!key.startsWith("z|") && !key.startsWith(day)) ed.remove(key);
            ed.apply();
        } catch (Exception ignore) { }
        for (int i = 0; i < arr.length(); i++) {
            JSONObject d = arr.getJSONObject(i).optJSONObject("document");
            if (d == null || !d.optString("name", "").endsWith("/remind")) continue;
            JSONObject f = d.optJSONObject("fields");
            if (f == null) continue;
            Object l = dec(f.optJSONObject("list"));
            rList = l instanceof JSONArray ? (JSONArray) l : new JSONArray();
            Object la = dec(f.optJSONObject("lat")), ln = dec(f.optJSONObject("lng"));
            rLat = la instanceof Double ? (Double) la : 0;
            rLng = ln instanceof Double ? (Double) ln : 0;
            return;
        }
        rList = new JSONArray();
    }

    /** रसोई के 200 मीटर के अंदर? (जगह तय न हो या लोकेशन न मिले तो हाँ) */
    private boolean near() {
        if (rLat == 0 && rLng == 0) return true;
        try {
            LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            Location best = null;
            for (String pr : lm.getProviders(true)) {
                Location l = lm.getLastKnownLocation(pr);
                if (l != null && (best == null || l.getTime() > best.getTime())) best = l;
            }
            if (best == null || System.currentTimeMillis() - best.getTime() > 30 * 60000L) return false;
            float[] d = new float[1];
            Location.distanceBetween(best.getLatitude(), best.getLongitude(), rLat, rLng, d);
            return d[0] < 200 + Math.min(150, best.getAccuracy());
        } catch (Exception e) { return true; }
    }

    private static SharedPreferences rp(Context c) { return c.getSharedPreferences("mr_rem", Context.MODE_PRIVATE); }

    private void remind() throws Exception {
        if (!Fs.ready(this)) return;
        long now = System.currentTimeMillis();
        if (rList == null || now - rFetch > 5 * 60000L) remFetch();
        String role = prefs(this).getString("role", "");
        Calendar k = Calendar.getInstance();
        int m = k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE);
        String day = k.get(Calendar.YEAR) + "-" + (k.get(Calendar.MONTH) + 1) + "-" + k.get(Calendar.DAY_OF_MONTH);
        SharedPreferences r = rp(this);
        // जवाब नहीं आया → 15 मिनट बाद "छूटा" (डायरेक्टर को दिखेगा)
        for (String key : new ArrayList<>(rOpen.keySet())) if (now - rOpen.get(key) > 15 * 60000L) remAct(key, "miss");
        // ⏰ 10 मिनट बाद वाले
        for (Map.Entry<String, ?> e : r.getAll().entrySet()) {
            if (!e.getKey().startsWith("z|")) continue;
            long t = 0; try { t = (Long) e.getValue(); } catch (Exception ignore) { }
            String key = e.getKey().substring(2);
            if (t > 0 && now >= t && rInfo.containsKey(key)) { r.edit().remove(e.getKey()).apply(); fire(key); return; }
            if (t > 0 && now - t > 6 * 3600000L) r.edit().remove(e.getKey()).apply();
        }
        if (!rOpen.isEmpty()) return; // एक बार में एक ही
        for (int i = 0; rList != null && i < rList.length(); i++) {
            JSONObject x = rList.optJSONObject(i);
            if (x == null || !x.optBoolean("on", true)) continue;
            String who = x.optString("who", "all");
            if (!who.equals("all") && !who.equals(role)) continue;
            JSONArray at = x.optJSONArray("at");
            boolean here = x.optBoolean("here", false);
            for (int j = 0; at != null && j < at.length(); j++) {
                String hm = at.optString(j, "");
                if (!hm.matches("\\d{1,2}:\\d{2}")) continue;
                int am = Integer.parseInt(hm.split(":")[0]) * 60 + Integer.parseInt(hm.split(":")[1]);
                String key = day + "|" + x.optString("id", "r" + i) + "|" + hm;
                if (r.contains(key)) continue;
                if (m < am || m > am + (here ? 240 : 20)) continue;
                if (here && !near()) continue;
                rInfo.put(key, new String[]{x.optString("id", ""), x.optString("t", "रिमाइंडर"), x.optString("tone", "t11"), hm});
                r.edit().putLong(key, now).apply();
                fire(key);
                return;
            }
        }
    }

    private void fire(String key) {
        String[] x = rInfo.get(key);
        if (x == null) return;
        rOpen.put(key, System.currentTimeMillis());
        int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent dn = PendingIntent.getService(this, 21, new Intent(this, OrderRingService.class).setAction(A_RDONE).putExtra("key", key), fl);
        PendingIntent sz = PendingIntent.getService(this, 22, new Intent(this, OrderRingService.class).setAction(A_RSNZ).putExtra("key", key), fl);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_REM) : new Notification.Builder(this);
        b.setContentTitle("⏰ " + x[1])
                .setContentText("मारवाड़ रसोई · " + x[3] + " — काम देखकर \"✅ हो गया\" दबाएँ")
                .setStyle(new Notification.BigTextStyle().bigText(x[1] + "\n\nमारवाड़ रसोई · " + x[3] + " — देखकर \"✅ हो गया\" दबाएँ (डायरेक्टर को दिखता है)"))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setCategory(Notification.CATEGORY_ALARM)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setContentIntent(openApp(5, false))
                .setFullScreenIntent(openApp(6, false), true)
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "✅ हो गया", dn).build())
                .addAction(new Notification.Action.Builder((android.graphics.drawable.Icon) null, "⏰ 10 मिनट बाद", sz).build());
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_REM, b.build()); } catch (Exception ignore) { }
        remSound(x[2]);
    }

    private synchronized void remSound(String t) {
        remStop();
        try {
            int id = getResources().getIdentifier("order_" + t, "raw", getPackageName());
            Uri u = id != 0 ? Uri.parse("android.resource://" + getPackageName() + "/" + id) : tone();
            rmp = new MediaPlayer();
            rmp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            rmp.setDataSource(this, u);
            rmp.setLooping(true);
            rmp.prepare();
            rmp.start();
            if (vib != null) {
                long[] pat = new long[]{0, 500, 300, 500, 1500};
                if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, -1)); else vib.vibrate(pat, -1);
            }
        } catch (Exception e) { rmp = null; }
        h.postDelayed(new Runnable() { public void run() { remStop(); } }, 40000);
    }

    private synchronized void remStop() {
        try { if (rmp != null) { rmp.stop(); rmp.release(); } } catch (Exception ignore) { }
        rmp = null;
    }

    /** ✅ हो गया / ⏰ बाद में / छूटा → rlog (डायरेक्टर देखे) */
    private void remAct(String key, String act) {
        if (key == null) return;
        String[] x = rInfo.get(key);
        rOpen.remove(key);
        remStop();
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NID_REM); } catch (Exception ignore) { }
        if ("snooze".equals(act)) rp(this).edit().putLong("z|" + key, System.currentTimeMillis() + 10 * 60000L).apply();
        if (x == null) return;
        try {
            JSONObject f = new JSONObject()
                    .put("rid", Fs.str(x[0])).put("t", Fs.str(x[1])).put("at", Fs.str(x[3])).put("act", Fs.str(act))
                    .put("by", Fs.str(Fs.name(this))).put("role", Fs.str(prefs(this).getString("role", "")))
                    .put("ts", Fs.intv(System.currentTimeMillis()));
            String id = "n" + Long.toString(System.currentTimeMillis(), 36) + Integer.toString((int) (Math.random() * 1e6), 36);
            JSONArray w = new JSONArray().put(new JSONObject().put("update", new JSONObject().put("name", Fs.docPath(this, "rlog/" + id)).put("fields", f)));
            Fs.commit(this, w);
        } catch (Exception ignore) { }
    }

    /** 🎵 चुनी हुई धुन: t1..t10 (APK में res/raw/order_tN) या "sys" = फोन का अलार्म */
    private Uri tone() {
        String t = testTone != null ? testTone : prefs(this).getString("tone", "t1");
        if (t != null && t.matches("t\\d{1,2}")) {
            int id = getResources().getIdentifier("order_" + t, "raw", getPackageName());
            if (id != 0) return Uri.parse("android.resource://" + getPackageName() + "/" + id);
        }
        Uri u = null;
        try { u = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM); } catch (Exception ignore) { }
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (u == null) u = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        return u;
    }

    private synchronized void startSound() {
        if (ringing) return;
        ringing = true;
        ringStart = System.currentTimeMillis();
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            int mx = am.getStreamMaxVolume(AudioManager.STREAM_ALARM), v = am.getStreamVolume(AudioManager.STREAM_ALARM);
            int want = (int) Math.ceil(mx * 0.85);
            if (prefs(this).getBoolean("loud", true) && v < want) { oldVol = v; am.setStreamVolume(AudioManager.STREAM_ALARM, want, 0); }
        } catch (Exception ignore) { }
        try {
            mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            mp.setDataSource(this, tone());
            mp.setLooping(true);
            mp.prepare();
            mp.start();
        } catch (Exception e) {
            try { if (mp != null) mp.release(); } catch (Exception ignore) { }
            mp = null;
        }
        try {
            if (vib != null) {
                long[] pat = new long[]{0, 700, 400, 700, 400, 1200, 800};
                if (Build.VERSION.SDK_INT >= 26) vib.vibrate(VibrationEffect.createWaveform(pat, 0), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
                else vib.vibrate(pat, 0);
            }
        } catch (Exception ignore) { }
    }

    private synchronized void stopSound() {
        ringing = false;
        try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception ignore) { }
        mp = null;
        try { if (vib != null) vib.cancel(); } catch (Exception ignore) { }
        try {
            if (oldVol >= 0) { ((AudioManager) getSystemService(Context.AUDIO_SERVICE)).setStreamVolume(AudioManager.STREAM_ALARM, oldVol, 0); oldVol = -1; }
        } catch (Exception ignore) { }
    }

    private void silenceAll() {
        for (String[] o : cur) silenced.add(o[0]);
        saveSil();
        pending = 0;
        stopSound();
        ringEnd = 0;
        cancelAlarm();
    }

    private void test() {
        List<String[]> l = new ArrayList<>();
        l.add(new String[]{"_test", "जाँच — घंटी ठीक है ✓", "0", ""});
        alarmNote(l);
        stopSound();
        startSound();
        h.postDelayed(new Runnable() { public void run() { testTone = null; if (pending == 0) { stopSound(); cancelAlarm(); } } }, 8000);
    }

    @Override
    public void onDestroy() {
        running = false;
        try { h.removeCallbacksAndMessages(null); } catch (Exception ignore) { }
        stopSound();
        remStop();
        cancelAlarm();
        try { th.quitSafely(); } catch (Exception ignore) { }
        try { if (wl != null && wl.isHeld()) wl.release(); } catch (Exception ignore) { }
        super.onDestroy();
    }

    /** फोन चालू होते ही / ऐप अपडेट के बाद — घंटी चालू थी तो फिर से */
    public static class Boot extends android.content.BroadcastReceiver {
        @Override
        public void onReceive(Context c, Intent i) {
            try {
                if (!prefs(c).getBoolean("on", false)) return;
                androidx.core.content.ContextCompat.startForegroundService(c, new Intent(c, OrderRingService.class));
            } catch (Exception ignore) { }
        }
    }
}
