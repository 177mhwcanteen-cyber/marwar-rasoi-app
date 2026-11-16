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
        try { // 🔔 छोटी "टिक" (iPhone जैसी) — नया काम/संदेश/विज़िट; ऊपर से उतरने वाली सूचना
            NotificationChannel tc = new NotificationChannel(CH_TICK, "टीम: नया काम / संदेश (टिक)", NotificationManager.IMPORTANCE_HIGH);
            tc.setSound(Uri.parse("android.resource://" + getPackageName() + "/raw/tick"), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            tc.enableVibration(true); tc.setVibrationPattern(new long[]{0, 40, 60, 40}); tc.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(tc);
        } catch (Exception ignore) { }
        try { // 🎵 v2: चैनल चुप — धुन हम खुद (साथी की चुनी) "धीमा करो" फ़ोकस से बजाते हैं; चमक (LED) + कंपन
            NotificationChannel t2 = new NotificationChannel(CH_TICK2, "टीम: नया काम / याद", NotificationManager.IMPORTANCE_HIGH);
            t2.setSound(null, null); t2.enableVibration(true); t2.setVibrationPattern(new long[]{0, 60, 80, 60}); t2.enableLights(true); t2.setLightColor(0xFFE0B03C);
            t2.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(t2);
            nm.deleteNotificationChannel(CH_TICK);
        } catch (Exception ignore) { }
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
            h.postDelayed(tloop, 5000);
        } else if (intent != null && intent.getBooleanExtra("now", false)) {
            h.removeCallbacks(loop);
            h.post(loop);
        }
        return START_STICKY;
    }

    /* 🎙️ योजना-5: वॉकी-टॉकी की अपनी घड़ी — ड्यूटी (7–22) में हर 15 से., बाकी समय हर 60 से. (ऑर्डर वाली 2 मिनट की घड़ी से अलग) */
    private final Runnable tloop = new Runnable() {
        public void run() {
            if (!running) return;
            try { talk(); } catch (Exception ignore) { }
            int hr = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
            h.postDelayed(this, (hr >= 7 && hr < 22) ? 15000L : 60000L);
        }
    };

    private final Runnable loop = new Runnable() {
        public void run() {
            if (!running) return;
            try { if (prefs(OrderRingService.this).getBoolean("orders", true)) poll(); } catch (Exception e) { lastErr = String.valueOf(e.getMessage()); }
            try { remind(); } catch (Exception ignore) { }
            try { kaam(); } catch (Exception ignore) { }
            try { trkWatch(); } catch (Exception ignore) { }
            try { health(); } catch (Exception ignore) { }
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
            // 🔔 16-11 (विक्रम जी): ऑनलाइन/नए ऑर्डर सिर्फ़ मैनेजर (rk=all); वेटर (rk=call) = सिर्फ़ टेबल की पुकार 💧🙋🧾
            String rk = p.getString("rk", "all");
            if ("none".equals(rk)) continue;
            if ("call".equals(rk)) { String cl = sv(f, "call"); if (!"call".equals(sv(f, "kind")) || !("water".equals(cl) || "waiter".equals(cl) || "bill".equals(cl))) continue; }
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

    /* ───────── 📲 फोन का हाल → dev/{uid} (हर 10 मिनट) — डायरेक्टर देखे किसके फोन में क्या बंद है / कब से नेट नहीं ───────── */
    static com.getcapacitor.JSObject perms(Context c) {
        com.getcapacitor.JSObject o = new com.getcapacitor.JSObject();
        boolean g = true;
        try { if (Build.VERSION.SDK_INT >= 33) g = c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED; } catch (Exception ignore) { }
        try { NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE); if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) g = false; } catch (Exception ignore) { }
        o.put("notif", g);
        boolean loc = false, mic = false, cam = false;
        try { loc = c.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) == android.content.pm.PackageManager.PERMISSION_GRANTED; } catch (Exception ignore) { }
        try { mic = c.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == android.content.pm.PackageManager.PERMISSION_GRANTED; } catch (Exception ignore) { }
        try { cam = c.checkSelfPermission(android.Manifest.permission.CAMERA) == android.content.pm.PackageManager.PERMISSION_GRANTED; } catch (Exception ignore) { }
        o.put("loc", loc); o.put("mic", mic); o.put("cam", cam);
        boolean gps = true;
        try { if (Build.VERSION.SDK_INT >= 28) gps = ((LocationManager) c.getSystemService(Context.LOCATION_SERVICE)).isLocationEnabled(); } catch (Exception ignore) { }
        o.put("gps", gps);
        boolean bat = true;
        try { bat = ((PowerManager) c.getSystemService(Context.POWER_SERVICE)).isIgnoringBatteryOptimizations(c.getPackageName()); } catch (Exception ignore) { }
        o.put("batt", bat);
        boolean fsi = true;
        try { if (Build.VERSION.SDK_INT >= 34) fsi = ((NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE)).canUseFullScreenIntent(); } catch (Exception ignore) { }
        o.put("fsi", fsi);
        int lvl = -1;
        try { lvl = ((android.os.BatteryManager) c.getSystemService(Context.BATTERY_SERVICE)).getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY); } catch (Exception ignore) { }
        o.put("bl", lvl);
        return o;
    }

    private long hLast = 0;
    private void health() throws Exception {
        long now = System.currentTimeMillis();
        if (now - hLast < 10 * 60000L || !Fs.ready(this)) return;
        hLast = now;
        com.getcapacitor.JSObject o = perms(this);
        JSONObject f = new JSONObject().put("name", Fs.str(Fs.name(this))).put("role", Fs.str(prefs(this).getString("role", ""))).put("ts", Fs.intv(now))
                .put("track", Fs.bool(TrackService.lastUp > 0 && now - TrackService.lastUp < 30 * 60000L)).put("model", Fs.str(Build.MANUFACTURER + " " + Build.MODEL));
        for (String k : new String[]{"notif", "loc", "mic", "cam", "gps", "batt", "fsi"}) f.put(k, Fs.bool(o.optBoolean(k, false)));
        f.put("bl", Fs.intv(o.optInt("bl", -1)));
        JSONArray w = new JSONArray().put(new JSONObject().put("update", new JSONObject().put("name", Fs.docPath(this, "dev/" + Fs.uid(this))).put("fields", f)));
        Fs.commit(this, w);
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
            String to = sv(f, "to"); // "" = सबको · "u:<uid>" = सिर्फ़ उसको · "r:<पद>" = उस पद वालों को
            if (to.length() > 0 && !to.equals("u:" + me) && !to.equals("r:" + prefs(this).getString("role", ""))) continue;
            String a = sv(f, "a");
            /* फ़ोन बंद/बिना नेट था तो भी: 6 घंटे तक का संदेश चालू होते ही बजे (Zello जैसा "रखा रहे, फिर बजे") */
            if (a.length() < 100 || System.currentTimeMillis() - ts > 6 * 3600000L) continue;
            playTalk(a, sv(f, "mt"), sv(f, "by"));
            String nm = d.optString("name", ""); heard(nm.substring(nm.lastIndexOf('/') + 1), sv(f, "by"));
            return; // एक बार में एक; अगला अगले चक्कर में
        }
    }

    /** "सुना ✓" की रसीद tkh/{संदेश}_{uid} — भेजने वाला (डायरेक्टर) देखे; स्क्रीन 10 से. जगे */
    private void heard(String mid, String by) {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (!pm.isInteractive()) { @SuppressWarnings("deprecation") PowerManager.WakeLock w = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP, "rasoi:talk"); w.acquire(10000); }
        } catch (Exception ignore) { }
        try {
            String uid = Fs.uid(this);
            JSONObject f = new JSONObject().put("m", Fs.str(mid)).put("uid", Fs.str(uid)).put("by", Fs.str(Fs.name(this))).put("at", Fs.intv(System.currentTimeMillis()));
            JSONArray w = new JSONArray().put(new JSONObject().put("update", new JSONObject().put("name", Fs.docPath(this, "tkh/" + mid + "_" + uid)).put("fields", f)));
            Fs.commit(this, w);
        } catch (Exception ignore) { }
    }

    private void playTalk(String b64, String mt, String by) {
        try {
            byte[] raw = android.util.Base64.decode(b64, android.util.Base64.DEFAULT);
            java.io.File fl = new java.io.File(getCacheDir(), "talk." + (mt.contains("mp4") ? "m4a" : mt.contains("ogg") ? "ogg" : "webm"));
            java.io.FileOutputStream os = new java.io.FileOutputStream(fl);
            os.write(raw);
            os.close();
            Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_REM) : new Notification.Builder(this);
            b.setContentTitle("🎙️ " + (by.length() > 0 ? by : "टीम") + " का संदेश").setContentText("वॉकी-टॉकी — जवाब: ऐप खोलें → 🎙️ वॉकी-टॉकी · दोबारा सुन सकते हैं")
                    .setSmallIcon(R.mipmap.ic_launcher).setAutoCancel(true).setContentIntent(openApp(8, false)).setPriority(Notification.PRIORITY_HIGH);
            try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_REM + 1, b.build()); } catch (Exception ignore) { }
            tmp = new MediaPlayer();
            tmp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tmp.setDataSource(fl.getAbsolutePath());
            tmp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() { public void onCompletion(MediaPlayer m) { try { m.release(); } catch (Exception ignore) { } tmp = null; focusOff(talkFocus); talkFocus = null; } });
            tmp.prepare();
            talkFocus = focusOn(false);
            tmp.start();
            h.postDelayed(new Runnable() { public void run() { try { if (tmp != null) { tmp.release(); tmp = null; } } catch (Exception ignore) { } focusOff(talkFocus); talkFocus = null; } }, 30000);
        } catch (Exception e) { try { if (tmp != null) tmp.release(); } catch (Exception ignore) { } tmp = null; focusOff(talkFocus); talkFocus = null; }
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

    /** 📋 हमारी टीम के काम (16-11-2026, योजना-3 चरण C): हर 60 सेकंड इस फोन वाले के tkaam (खुले) + tmsg (विक्रम जी के) + tvisit;
     *  नया = छोटी "टिक" + कंपन + ऊपर से उतरने वाली सूचना (6 से.); 🚨 ज़रूरी काम पर ही पूरी स्क्रीन + लंबी घंटी।
     *  रात 9 – सुबह 7 चुप (सुबह पहली जाँच पर बजेगा)। पहली बार सिर्फ़ याद, आवाज़ नहीं। नेट न हो तो अगली बार — कुछ छूटता नहीं। */
    /** 📍 पहरेदार: जगह वाली सेवा 10 मिनट से चुप (फ़ोन ने बंद कर दी) = फिर चालू — साथी को कुछ नहीं करना */
    private long trkW = 0;
    private void trkWatch() {
        long now = System.currentTimeMillis();
        if (now - trkW < 300000L) return;
        trkW = now;
        if (!getSharedPreferences("mr_trk", Context.MODE_PRIVATE).getBoolean("on", false)) return;
        if (TrackService.running && now - TrackService.beat < 600000L) return;
        try { androidx.core.content.ContextCompat.startForegroundService(this, new Intent(this, TrackService.class)); } catch (Exception ignore) { }
    }
    static final String CH_TICK = "mr_tick_v1";
    static final String CH_TICK2 = "mr_tick_v2";
    private long kFetch = 0;
    private JSONArray kq(String col, String em) throws Exception {
        String q = "{\"structuredQuery\":{\"from\":[{\"collectionId\":\"" + col + "\"}],\"where\":{\"fieldFilter\":{\"field\":{\"fieldPath\":\"em\"},\"op\":\"EQUAL\",\"value\":{\"stringValue\":" + JSONObject.quote(em) + "}}},\"limit\":200}}";
        return new JSONArray(Fs.runQuery(this, q));
    }
    private void kaam() throws Exception {
        String em = prefs(this).getString("em", "");
        if (em.length() == 0 || !Fs.ready(this)) return;
        long now = System.currentTimeMillis();
        if (now - kFetch < 60000L) return;
        kFetch = now;
        int hr = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        boolean night = hr >= 21 || hr < 7;
        SharedPreferences kp = getSharedPreferences("mr_tk", Context.MODE_PRIVATE);
        boolean first = !kp.getBoolean("init2", false);
        if (night && !first) return;
        String seen = kp.getString("seen", ",");
        StringBuilder ns = new StringBuilder(",");
        String newT = null; int cnt = 0; boolean urgent = false; int openN = 0; java.util.ArrayList<String> tops = new java.util.ArrayList<>();
        String ktone = prefs(this).getString("ktone", "tick");
        java.util.HashSet<String> vdays = new java.util.HashSet<>();
        String[] cols = {"tkaam", "tmsg", "tvisit"};
        for (String col : cols) {
            JSONArray arr;
            try { arr = kq(col, em); } catch (Exception e) { if (col.equals("tkaam")) throw e; continue; }
            for (int i = 0; i < arr.length(); i++) {
                JSONObject d = arr.getJSONObject(i).optJSONObject("document");
                if (d == null) continue;
                JSONObject f = d.optJSONObject("fields");
                if (f == null) continue;
                String nm = d.optString("name", ""), id = nm.substring(nm.lastIndexOf('/') + 1), key, txt;
                boolean ur = false;
                if (col.equals("tkaam")) {
                    Object st = dec(f.optJSONObject("st"));
                    if (st != null && !"open".equals(st) && !"".equals(st)) continue;
                    Object rj = dec(f.optJSONObject("rej")), t = dec(f.optJSONObject("t"));
                    boolean rej = Boolean.TRUE.equals(rj) || (rj instanceof Double && (Double) rj > 0);
                    ur = Boolean.TRUE.equals(dec(f.optJSONObject("urgent")));
                    key = "k" + id + (rej ? "~r" : "");
                    openN++; String tt = (ur ? "🚨 " : "") + (t == null ? "" : String.valueOf(t)); if (ur) tops.add(0, tt); else tops.add(tt);
                    txt = (ur ? "🚨 " : "") + (rej ? "↺ फिर देखें: " : "📋 ") + (t == null ? "नया काम" : String.valueOf(t));
                } else if (col.equals("tmsg")) {
                    if (!"d".equals(sv(f, "fr"))) continue;
                    key = "m" + id; txt = "💬 विक्रम जी: " + sv(f, "t");
                } else {
                    vdays.add(sv(f, "day"));
                    key = "v" + id + sv(f, "mt"); txt = "🗺️ " + ("".equals(sv(f, "day")) ? "" : sv(f, "day") + " की ") + "विज़िट आ गई";
                }
                ns.append(key).append(",");
                if (!seen.contains("," + key + ",")) { cnt++; if (newT == null || ur) newT = txt; if (ur) urgent = true; }
            }
        }
        kp.edit().putString("seen", ns.toString()).putBoolean("init2", true).apply();
        /* 🗺️ योजना-6 (योजना-3 E6): विज़िट की तय याद — रात 8 बजे "कल की", सुबह 8:30 "आज की" (हर एक दिन में एक बार) */
        try {
            Calendar c = Calendar.getInstance(); int vh = c.get(Calendar.HOUR_OF_DAY), mn = c.get(Calendar.MINUTE);
            java.text.SimpleDateFormat df = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            String td = df.format(c.getTime()); c.add(Calendar.DATE, 1); String tm = df.format(c.getTime());
            String vk = null, vt = null;
            if (vh == 20 && vdays.contains(tm)) { vk = tm + "pm"; vt = "🌙 कल की विज़िट तैयार है — रास्ता देख लीजिए"; }
            else if ((vh == 8 && mn >= 30 || vh == 9) && vdays.contains(td)) { vk = td + "am"; vt = "🗺️ आज की विज़िट — शुभ दिन! पहली यूनिट से शुरू करें"; }
            if (vk != null && !vk.equals(kp.getString("vrem", ""))) {
                kp.edit().putString("vrem", vk).apply();
                Notification.Builder vb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_TICK2) : new Notification.Builder(this);
                vb.setContentTitle(vt).setContentText("ऐप खोलें → मेरा दिन में सबसे ऊपर · समय पर सेवा, हमारी पहचान 🙏").setSmallIcon(R.mipmap.ic_launcher)
                        .setPriority(Notification.PRIORITY_HIGH).setVisibility(Notification.VISIBILITY_PUBLIC).setAutoCancel(true).setContentIntent(openApp(8, false))
                        .setCategory(Notification.CATEGORY_REMINDER).setLights(0xFFE0B03C, 600, 900);
                ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_REM + 3, vb.build());
                kplay(ktone, 1);
            }
        } catch (Exception ignore) { }
        /* 🔁 हर N मिनट याद (साथी चुने: 15/30/60/बंद; डिफ़ॉल्ट 30) — खुले काम हों तो ऊपर उतरती सूचना + चमक + धुन एक बार; रात 9–सुबह 7 नहीं */
        int kb = prefs(this).getInt("kblink", 30);
        long lb = kp.getLong("lblink", 0);
        if (!first && cnt == 0 && kb > 0 && !night && openN > 0 && now - lb >= kb * 60000L) {
            kp.edit().putLong("lblink", now).apply();
            if (lb > 0) {
                StringBuilder bt = new StringBuilder();
                for (int i = 0; i < Math.min(3, tops.size()); i++) bt.append("• ").append(tops.get(i)).append("\n");
                Notification.Builder rb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH_TICK2) : new Notification.Builder(this);
                rb.setContentTitle("📋 याद: आपके " + openN + " काम बाकी").setContentText(tops.isEmpty() ? "हमारी टीम के काम" : tops.get(0))
                        .setStyle(new Notification.BigTextStyle().bigText(bt.toString() + (openN > 3 ? "+ " + (openN - 3) + " और\n" : "") + "\nकाम होते ही \"✅ हो गया\" दबाएँ — विक्रम जी तक तुरंत पहुँचता है"))
                        .setSmallIcon(R.mipmap.ic_launcher).setPriority(Notification.PRIORITY_HIGH).setVisibility(Notification.VISIBILITY_PUBLIC)
                        .setAutoCancel(true).setOnlyAlertOnce(false).setContentIntent(openApp(7, false)).setCategory(Notification.CATEGORY_REMINDER)
                        .setLights(0xFFE0B03C, 600, 900);
                if (Build.VERSION.SDK_INT >= 26) rb.setTimeoutAfter(kb * 60000L);
                try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_REM + 2, rb.build()); } catch (Exception ignore) { }
                kplay(ktone, 1);
            }
        } else if (lb == 0 || cnt > 0) kp.edit().putLong("lblink", now).apply();
        if (first || cnt == 0) return;
        String body = newT + (cnt > 1 ? "\n+ " + (cnt - 1) + " और" : "");
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, urgent ? CH_REM : CH_TICK2) : new Notification.Builder(this);
        b.setContentTitle(urgent ? "🚨 ज़रूरी काम — हमारी टीम" : "हमारी टीम" + (cnt > 1 ? " · " + cnt + " नए" : ""))
                .setContentText(newT)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(urgent ? Notification.PRIORITY_MAX : Notification.PRIORITY_HIGH)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(openApp(7, false));
        if (urgent) b.setCategory(Notification.CATEGORY_ALARM).setFullScreenIntent(openApp(8, false), true);
        else b.setCategory(Notification.CATEGORY_MESSAGE).setTimeoutAfter(6 * 3600000L);
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NID_REM + 1, b.build()); } catch (Exception ignore) { }
        kplay(ktone, urgent ? 3 : 2); /* पहले: ज़रूरी पर 40 से. की लूप घंटी — अब साथी की धुन 3 बार, रील रुके नहीं */
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
            remFocus = focusOn(false);
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
        rmp = null; focusOff(remFocus); remFocus = null;
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

    /* 🎧 योजना-4 (16-11, विक्रम जी: "साथी YouTube रील देखते हैं तो आवाज़ बंद हो जाती है"): हर आवाज़ से पहले फ़ोकस माँगो,
       बजते ही लौटाओ — छोटी धुन = "धीमा करो" (रील धीमी होकर फिर चले), अलार्म = "थोड़ी देर रुको" (फिर अपने-आप चले)। */
    private final AudioManager.OnAudioFocusChangeListener afl = new AudioManager.OnAudioFocusChangeListener() { public void onAudioFocusChange(int c) { } };
    private Object focusOn(boolean duck) {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            int g = duck ? AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK : AudioManager.AUDIOFOCUS_GAIN_TRANSIENT;
            if (Build.VERSION.SDK_INT >= 26) {
                android.media.AudioFocusRequest r = new android.media.AudioFocusRequest.Builder(g)
                        .setAudioAttributes(new AudioAttributes.Builder().setUsage(duck ? AudioAttributes.USAGE_NOTIFICATION : AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                        .setOnAudioFocusChangeListener(afl).build();
                am.requestAudioFocus(r);
                return r;
            }
            am.requestAudioFocus(afl, duck ? AudioManager.STREAM_NOTIFICATION : AudioManager.STREAM_ALARM, g);
            return afl;
        } catch (Exception e) { return null; }
    }
    private void focusOff(Object r) {
        if (r == null) return;
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (Build.VERSION.SDK_INT >= 26 && r instanceof android.media.AudioFocusRequest) am.abandonAudioFocusRequest((android.media.AudioFocusRequest) r);
            else am.abandonAudioFocus(afl);
        } catch (Exception ignore) { }
    }
    private Object ringFocus, remFocus, talkFocus, kFocus;

    /** 🎵 काम की धुन (साथी ने चुनी: tick या t1..t20) — times बार, सूचना की आवाज़ में (फ़ोन साइलेंट = चुप), 20 से. से ज़्यादा नहीं */
    private MediaPlayer kmp;
    private synchronized void kplay(String t, final int times) {
        try { if (kmp != null) { kmp.release(); kmp = null; } } catch (Exception ignore) { }
        focusOff(kFocus); kFocus = null;
        try {
            int id = 0;
            if (t != null && t.matches("t\\d{1,2}")) id = getResources().getIdentifier("order_" + t, "raw", getPackageName());
            if (id == 0) id = getResources().getIdentifier("tick", "raw", getPackageName());
            if (id == 0) return;
            kFocus = focusOn(true);
            kmp = new MediaPlayer();
            kmp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            kmp.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + id));
            kmp.prepare();
            final int[] left = {Math.max(1, times)};
            kmp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() { public void onCompletion(MediaPlayer m) {
                if (--left[0] > 0) { try { m.seekTo(0); m.start(); return; } catch (Exception ignore) { } }
                kstop(); } });
            kmp.start();
            h.postDelayed(new Runnable() { public void run() { kstop(); } }, 20000);
        } catch (Exception e) { kstop(); }
    }
    private synchronized void kstop() {
        try { if (kmp != null) { kmp.release(); } } catch (Exception ignore) { }
        kmp = null; focusOff(kFocus); kFocus = null;
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
            ringFocus = focusOn(false);
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
        mp = null; focusOff(ringFocus); ringFocus = null;
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
                // 📍 16-11: फ़ोन दोबारा चालू हो तो जगह वाली सेवा भी अपने-आप (साथी को कुछ नहीं करना)
                if (c.getSharedPreferences("mr_trk", Context.MODE_PRIVATE).getBoolean("on", false))
                    try { androidx.core.content.ContextCompat.startForegroundService(c, new Intent(c, TrackService.class)); } catch (Exception ignore) { }
                if (!prefs(c).getBoolean("on", false)) return;
                androidx.core.content.ContextCompat.startForegroundService(c, new Intent(c, OrderRingService.class));
            } catch (Exception ignore) { }
        }
    }
}
