package in.marwar.rasoi;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * 🔑 ऐप बंद हो तब भी Firestore से बात — लॉगिन वाले की चाबी (refresh token) से id token, फिर REST।
 * चाबी सिर्फ़ ऐप की निजी जगह "se_auth" में (लॉग-आउट पर मिटती है)। घंटी (OrderRingService) और लोकेशन (TrackService) दोनों यही इस्तेमाल करते हैं।
 */
public final class Fs {
    static final String PREF = "se_auth";
    private static String idTok = "";
    private static long idExp = 0;
    private static String uid = "";

    private Fs() { }

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREF, Context.MODE_PRIVATE); }

    static void set(Context c, String rt, String key, String pid, String name) {
        SharedPreferences.Editor e = prefs(c).edit();
        if (rt != null && rt.length() > 0) e.putString("rt", rt);
        if (key != null && key.length() > 0) e.putString("key", key);
        if (pid != null && pid.length() > 0) e.putString("pid", pid);
        if (name != null) e.putString("name", name);
        e.apply();
        synchronized (Fs.class) { idTok = ""; idExp = 0; }
    }

    static void clear(Context c) {
        prefs(c).edit().clear().apply();
        synchronized (Fs.class) { idTok = ""; idExp = 0; uid = ""; }
    }

    static boolean ready(Context c) { SharedPreferences p = prefs(c); return p.getString("rt", "").length() > 0 && p.getString("pid", "").length() > 0; }
    static String pid(Context c) { return prefs(c).getString("pid", ""); }
    static String name(Context c) { return prefs(c).getString("name", ""); }

    static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int r;
        while ((r = in.read(buf)) > 0) bo.write(buf, 0, r);
        in.close();
        return bo.toString("UTF-8");
    }

    static String post(String url, String body, String type, String auth) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        c.setRequestProperty("Content-Type", type);
        if (auth != null) c.setRequestProperty("Authorization", "Bearer " + auth);
        OutputStream os = c.getOutputStream();
        os.write(body.getBytes("UTF-8"));
        os.close();
        int code = c.getResponseCode();
        String s = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream());
        if (code >= 400) throw new Exception("HTTP " + code + (code == 403 ? " (इजाज़त नहीं)" : code == 400 || code == 401 ? " (फिर लॉगिन)" : ""));
        return s;
    }

    /** id token (1 घंटा) — खत्म होने से 2 मिनट पहले नया */
    static synchronized String token(Context c) throws Exception {
        if (idTok.length() > 0 && System.currentTimeMillis() < idExp - 120000) return idTok;
        SharedPreferences p = prefs(c);
        String rt = p.getString("rt", ""), key = p.getString("key", "");
        if (rt.length() == 0 || key.length() == 0) throw new Exception("लॉगिन की चाबी नहीं — ऐप एक बार खोलें");
        String s = post("https://securetoken.googleapis.com/v1/token?key=" + URLEncoder.encode(key, "UTF-8"),
                "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(rt, "UTF-8"),
                "application/x-www-form-urlencoded", null);
        JSONObject j = new JSONObject(s);
        idTok = j.getString("id_token");
        idExp = System.currentTimeMillis() + j.optLong("expires_in", 3600) * 1000L;
        uid = j.optString("user_id", uid);
        String nrt = j.optString("refresh_token", "");
        if (nrt.length() > 0 && !nrt.equals(rt)) p.edit().putString("rt", nrt).apply();
        return idTok;
    }

    static synchronized void forget() { idTok = ""; idExp = 0; }

    static String uid(Context c) throws Exception { if (uid.length() == 0) token(c); return uid; }

    static String docPath(Context c, String rel) { return "projects/" + pid(c) + "/databases/(default)/documents/" + rel; }

    static JSONObject str(String v) throws Exception { return new JSONObject().put("stringValue", v); }
    static JSONObject num(double v) throws Exception { return new JSONObject().put("doubleValue", v); }
    static JSONObject intv(long v) throws Exception { return new JSONObject().put("integerValue", String.valueOf(v)); }
    static JSONObject bool(boolean v) throws Exception { return new JSONObject().put("booleanValue", v); }

    /** कई लिखाइयाँ एक साथ (documents:commit) */
    static void commit(Context c, JSONArray writes) throws Exception {
        String t = token(c);
        try {
            post("https://firestore.googleapis.com/v1/projects/" + pid(c) + "/databases/(default)/documents:commit",
                    new JSONObject().put("writes", writes).toString(), "application/json", t);
        } catch (Exception e) {
            if (String.valueOf(e.getMessage()).contains("401")) forget();
            throw e;
        }
    }

    static String runQuery(Context c, String q) throws Exception {
        String t = token(c);
        try {
            return post("https://firestore.googleapis.com/v1/projects/" + pid(c) + "/databases/(default)/documents:runQuery", q, "application/json", t);
        } catch (Exception e) {
            if (String.valueOf(e.getMessage()).contains("401")) forget();
            throw e;
        }
    }
}
