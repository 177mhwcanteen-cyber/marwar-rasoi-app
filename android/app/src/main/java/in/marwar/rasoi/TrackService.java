package in.marwar.rasoi;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Looper;

import java.io.File;
import java.io.FileWriter;

/**
 * मारवाड़ रसोई — ऐप चालू रहने की सेवा (स्क्रीन बंद होने पर भी हर मिनट जगह फोन में दर्ज)।
 * हर लाइन: ts,lat,lng,acc  या  ts,OFF / ts,ON (कर्मचारी ने लोकेशन बंद/चालू की)
 * ऐप खुलने पर JS यह फाइल पढ़कर सर्वर पर भेज देता है (BtPrinter.trackDrain)।
 */
public class TrackService extends Service implements LocationListener {
    static final String CH = "se_track";
    static final int NID = 4601;
    static volatile boolean running = false;
    static volatile long lastFix = 0;
    private LocationManager lm;
    private long lastSaved = 0;
    private Location best = null; // 45 सेकंड में मिली सबसे सटीक जगह

    static File file(Context c) { return new File(c.getFilesDir(), "trk.txt"); }
    static File upFile(Context c) { return new File(c.getFilesDir(), "trkup.txt"); }
    static volatile long lastUp = 0;
    static volatile String upErr = "";
    private android.os.HandlerThread upTh;
    private android.os.Handler upH;
    private Location lastLoc = null;
    private boolean gpsOff = false;

    static synchronized void appendUp(Context c, String line) {
        try {
            FileWriter w = new FileWriter(upFile(c), true);
            w.write(line);
            w.write("\n");
            w.close();
        } catch (Exception ignore) { }
    }

    static synchronized String takeUp(Context c) {
        try {
            File f = upFile(c);
            if (!f.exists()) return "";
            byte[] b = java.nio.file.Files.readAllBytes(f.toPath());
            f.delete();
            return new String(b, "UTF-8");
        } catch (Exception e) { return ""; }
    }

    static synchronized void append(Context c, String line) {
        appendUp(c, line);
        try {
            FileWriter w = new FileWriter(file(c), true);
            w.write(line);
            w.write("\n");
            w.close();
        } catch (Exception ignore) { }
    }

    static synchronized String drain(Context c) {
        try {
            File f = file(c);
            if (!f.exists()) return "";
            byte[] b = java.nio.file.Files.readAllBytes(f.toPath());
            f.delete();
            return new String(b, "UTF-8");
        } catch (Exception e) { return ""; }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @SuppressLint("MissingPermission")
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String who = intent != null && intent.getStringExtra("name") != null ? intent.getStringExtra("name") : "";
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel ch = new NotificationChannel(CH, "Marwar Rasoi", NotificationManager.IMPORTANCE_MIN);
            nm.createNotificationChannel(ch);
        }
        Intent open = new Intent(this, MainActivity.class);
        int pf = Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0;
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, pf);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new Notification.Builder(this, CH) : new Notification.Builder(this);
        Notification n = b.setContentTitle("🍛 Marwar Rasoi चालू है")
            .setContentText("ऐप चालू है" + (who.isEmpty() ? "" : " · " + who))
            .setSmallIcon(getApplicationInfo().icon)
            .setContentIntent(pi)
            .setOngoing(true)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NID, n);
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (upTh == null) {
            upTh = new android.os.HandlerThread("se-trk-up");
            upTh.start();
            upH = new android.os.Handler(upTh.getLooper());
            upH.postDelayed(upLoop, 20000);
        }
        if (!running) {
            lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            try {
                if (lm.getAllProviders().contains(LocationManager.GPS_PROVIDER))
                    lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000L, 0f, this, Looper.getMainLooper());
                if (lm.getAllProviders().contains(LocationManager.NETWORK_PROVIDER))
                    lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 60000L, 0f, this, Looper.getMainLooper());
                running = true;
                append(this, System.currentTimeMillis() + ",START");
            } catch (Exception e) {
                append(this, System.currentTimeMillis() + ",NOPERM");
            }
        }
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location l) {
        long now = System.currentTimeMillis();
        boolean gps = LocationManager.GPS_PROVIDER.equals(l.getProvider());
        // नेटवर्क (टावर) वाली जगह सिर्फ़ तब, जब 3 मिनट से GPS न मिला हो — और ±150 मी. से खराब हो तो बिल्कुल नहीं
        if (!gps && (now - lastFix < 180000L || !l.hasAccuracy() || l.getAccuracy() > 150f)) return;
        if (gps) lastFix = now;
        // 45 सेकंड की खिड़की में सबसे सटीक रीडिंग ही दर्ज (दाएँ-बाएँ उछाल कम)
        if (best == null || (l.hasAccuracy() && l.getAccuracy() < best.getAccuracy())) best = l;
        if (now - lastSaved < 45000L) return;
        lastSaved = now;
        Location b = best; best = null;
        lastLoc = b;
        append(this, now + "," + String.format(java.util.Locale.US, "%.6f,%.6f,%d", b.getLatitude(), b.getLongitude(), Math.round(b.getAccuracy())));
    }

    @Override
    public void onProviderDisabled(String p) {
        if (LocationManager.GPS_PROVIDER.equals(p)) { gpsOff = true; append(this, System.currentTimeMillis() + ",OFF"); }
    }

    @Override
    public void onProviderEnabled(String p) {
        if (LocationManager.GPS_PROVIDER.equals(p)) { gpsOff = false; append(this, System.currentTimeMillis() + ",ON"); }
    }

    @Override
    public void onStatusChanged(String p, int s, Bundle e) { }

    /* ☁️ ऐप बंद हो तब भी हर 2 मिनट जगह सीधे Firestore में (trk/<दिन_uid_घंटा> + live/<uid>) — मालिक को अभी की जगह दिखे */
    private final Runnable upLoop = new Runnable() {
        public void run() {
            try { upload(); } catch (Exception ignore) { }
            if (upH != null) upH.postDelayed(this, 120000);
        }
    };

    private void upload() {
        if (!Fs.ready(this)) return;
        String raw = takeUp(this);
        java.util.List<String> lines = new java.util.ArrayList<>();
        for (String l : raw.split("\n")) { l = l.trim(); if (l.length() > 0) lines.add(l); }
        try {
            String uid = Fs.uid(this), name = Fs.name(this);
            org.json.JSONArray W = new org.json.JSONArray();
            java.util.Map<String, java.util.List<String>> G = new java.util.LinkedHashMap<>();
            java.text.SimpleDateFormat df = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
            java.util.Calendar cal = java.util.Calendar.getInstance();
            for (String l : lines) {
                long ts;
                try { ts = Long.parseLong(l.split(",")[0]); } catch (Exception e) { continue; }
                cal.setTimeInMillis(ts);
                String k = df.format(cal.getTime()) + "|" + cal.get(java.util.Calendar.HOUR_OF_DAY);
                java.util.List<String> g = G.get(k);
                if (g == null) { g = new java.util.ArrayList<>(); G.put(k, g); }
                g.add(l);
            }
            for (java.util.Map.Entry<String, java.util.List<String>> e : G.entrySet()) {
                String date = e.getKey().split("\\|")[0];
                int hr = Integer.parseInt(e.getKey().split("\\|")[1]);
                String id = date + "_" + uid + "_" + (hr < 10 ? "0" : "") + hr;
                org.json.JSONObject f = new org.json.JSONObject().put("uid", Fs.str(uid)).put("name", Fs.str(name)).put("date", Fs.str(date)).put("hr", Fs.intv(hr));
                org.json.JSONArray vals = new org.json.JSONArray();
                for (String l : e.getValue()) vals.put(Fs.str(l));
                W.put(new org.json.JSONObject()
                        .put("update", new org.json.JSONObject().put("name", Fs.docPath(this, "trk/" + id)).put("fields", f))
                        .put("updateMask", new org.json.JSONObject().put("fieldPaths", new org.json.JSONArray().put("uid").put("name").put("date").put("hr")))
                        .put("updateTransforms", new org.json.JSONArray().put(new org.json.JSONObject().put("fieldPath", "pts")
                                .put("appendMissingElements", new org.json.JSONObject().put("values", vals)))));
            }
            long now = System.currentTimeMillis();
            org.json.JSONObject lf = new org.json.JSONObject().put("name", Fs.str(name)).put("seen", Fs.intv(now)).put("running", Fs.bool(true)).put("bg", Fs.intv(now)).put("gps", Fs.bool(!gpsOff));
            org.json.JSONArray mask = new org.json.JSONArray().put("name").put("seen").put("running").put("bg").put("gps");
            Location l = lastLoc;
            if (l != null) {
                lf.put("lat", Fs.num(Math.round(l.getLatitude() * 1e6) / 1e6)).put("lng", Fs.num(Math.round(l.getLongitude() * 1e6) / 1e6))
                        .put("acc", Fs.intv(Math.round(l.getAccuracy()))).put("ts", Fs.intv(l.getTime() > 0 ? Math.min(l.getTime(), now) : now));
                mask.put("lat").put("lng").put("acc").put("ts");
            }
            W.put(new org.json.JSONObject().put("update", new org.json.JSONObject().put("name", Fs.docPath(this, "live/" + uid)).put("fields", lf))
                    .put("updateMask", new org.json.JSONObject().put("fieldPaths", mask)));
            Fs.commit(this, W);
            lastUp = now;
            upErr = "";
        } catch (Exception e) {
            upErr = String.valueOf(e.getMessage());
            for (String l : lines) appendUp(this, l); // अगली बार फिर
        }
    }

    @Override
    public void onDestroy() {
        try { if (upH != null) upH.removeCallbacksAndMessages(null); if (upTh != null) upTh.quitSafely(); } catch (Exception ignore) { }
        running = false;
        try { if (lm != null) lm.removeUpdates(this); } catch (Exception ignore) { }
        append(this, System.currentTimeMillis() + ",STOP");
        super.onDestroy();
    }
}
