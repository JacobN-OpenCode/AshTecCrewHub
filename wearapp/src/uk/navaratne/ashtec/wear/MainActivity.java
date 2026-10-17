package uk.navaratne.ashtec.wear;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * AshTec for Wear OS (feedback round 2, round 3).
 *
 * A tiny watch face for the crew hub: the next call, a live countdown, and the
 * next few after it. It reads /next-call.json with the same per-member token
 * the calendar feed uses, so there is no login on the watch. Sideload only -
 * no Play Store account needed.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "ashtec";
    private static final String KEY_URL = "feedURL";

    private TextView titleView, whenView, countdownView, upcomingView, statusView;
    private JSONObject next;
    private JSONArray upcoming;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd", Locale.UK);

    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            renderCountdown();
            handler.postDelayed(this, 1000);
        }
    };

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);

        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(18);
        root.setPadding(pad, pad, pad, pad);
        scroll.addView(root);

        TextView kicker = new TextView(this);
        kicker.setText("NEXT CALL");
        kicker.setTextColor(0xFFEC3750);
        kicker.setTextSize(12);
        kicker.setLetterSpacing(0.15f);
        kicker.setGravity(Gravity.CENTER);
        root.addView(kicker);

        titleView = new TextView(this);
        titleView.setText("Loading…");
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(22);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, dp(6), 0, dp(6));
        root.addView(titleView);

        whenView = new TextView(this);
        whenView.setTextColor(0xFFBBBBBB);
        whenView.setTextSize(15);
        whenView.setGravity(Gravity.CENTER);
        root.addView(whenView);

        countdownView = new TextView(this);
        countdownView.setTextColor(0xFFFFC857);
        countdownView.setTextSize(20);
        countdownView.setTypeface(Typeface.DEFAULT_BOLD);
        countdownView.setGravity(Gravity.CENTER);
        countdownView.setPadding(0, dp(10), 0, dp(14));
        root.addView(countdownView);

        upcomingView = new TextView(this);
        upcomingView.setTextColor(0xFFDDDDDD);
        upcomingView.setTextSize(13);
        upcomingView.setGravity(Gravity.CENTER);
        root.addView(upcomingView);

        statusView = new TextView(this);
        statusView.setTextColor(0xFF888888);
        statusView.setTextSize(11);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(0, dp(10), 0, dp(4));
        root.addView(statusView);

        Button refresh = new Button(this);
        refresh.setText("Refresh");
        refresh.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { fetch(); }
        });
        root.addView(refresh);

        Button setLink = new Button(this);
        setLink.setText("Set link");
        setLink.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { askForLink(); }
        });
        root.addView(setLink);

        setContentView(scroll);

        String url = prefs().getString(KEY_URL, "");
        if (url == null || url.isEmpty()) askForLink(); else fetch();
        handler.post(ticker);
    }

    @Override protected void onDestroy() {
        handler.removeCallbacks(ticker);
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private void askForLink() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://ashtec.dino.icu/next-call.json?token=…");
        input.setText(prefs().getString(KEY_URL, ""));
        LinearLayout box = new LinearLayout(this);
        box.setPadding(dp(16), dp(8), dp(16), dp(8));
        box.addView(input);
        new AlertDialog.Builder(this)
            .setTitle("Paste your next-call link")
            .setView(box)
            .setPositiveButton("Save", (d, w) -> {
                prefs().edit().putString(KEY_URL, input.getText().toString().trim()).apply();
                fetch();
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    private void fetch() {
        final String url = prefs().getString(KEY_URL, "");
        if (url == null || url.isEmpty()) { statusView.setText("No link set."); return; }
        statusView.setText("Refreshing…");
        new Thread(new Runnable() {
            @Override public void run() {
                String body = null;
                String err = null;
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(10000);
                    c.setReadTimeout(10000);
                    int code = c.getResponseCode();
                    if (code != 200) {
                        err = "Server said " + code;
                    } else {
                        StringBuilder sb = new StringBuilder();
                        BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream()));
                        String line;
                        while ((line = r.readLine()) != null) sb.append(line);
                        r.close();
                        body = sb.toString();
                    }
                } catch (Exception e) {
                    err = e.getMessage();
                }
                final String fBody = body, fErr = err;
                handler.post(new Runnable() {
                    @Override public void run() { apply(fBody, fErr); }
                });
            }
        }).start();
    }

    private void apply(String body, String err) {
        if (err != null || body == null) {
            statusView.setText("Could not reach the crew hub" + (err != null ? ": " + err : ""));
            return;
        }
        try {
            JSONObject root = new JSONObject(body);
            next = root.optJSONObject("next");
            upcoming = root.optJSONArray("upcoming");
        } catch (Exception e) {
            statusView.setText("Unexpected reply.");
            return;
        }
        statusView.setText("Updated " + new SimpleDateFormat("HH:mm", Locale.UK).format(new Date()));
        renderCall();
    }

    private void renderCall() {
        if (next == null) {
            titleView.setText("Nothing coming up");
            whenView.setText("");
            countdownView.setText("");
            upcomingView.setText("");
            return;
        }
        titleView.setText(next.optString("title", "Call"));
        String show = next.optString("show", "");
        String when = next.optString("when", "");
        whenView.setText(show.isEmpty() ? when : show + "\n" + when);
        renderCountdown();

        StringBuilder sb = new StringBuilder();
        if (upcoming != null) {
            for (int i = 1; i < upcoming.length(); i++) {
                JSONObject c = upcoming.optJSONObject(i);
                if (c == null) continue;
                sb.append(c.optString("when", "")).append(" — ").append(c.optString("title", "")).append("\n");
            }
        }
        upcomingView.setText(sb.toString().trim());
    }

    private void renderCountdown() {
        if (next == null) return;
        Date target = startOf(next);
        if (target == null) { countdownView.setText(next.optBoolean("dateTbc") ? "Date TBC" : ""); return; }
        long s = (target.getTime() - System.currentTimeMillis()) / 1000;
        if (s < 0) { countdownView.setText("On now"); return; }
        if (s < 60) { countdownView.setText("in under a minute"); return; }
        long m = s / 60;
        if (m < 60) { countdownView.setText("in " + m + " min"); return; }
        long h = m / 60;
        if (h < 24) { countdownView.setText("in " + h + "h " + (m % 60) + "m"); return; }
        countdownView.setText("in " + (h / 24) + " days");
    }

    /** The call's start moment, from its date plus the first time in start/meet. */
    private Date startOf(JSONObject c) {
        String date = c.optString("date", "");
        int[] hm = firstTime(c.optString("startTime", ""));
        if (hm == null) hm = firstTime(c.optString("meetTime", ""));
        if (date.isEmpty() || hm == null) return null;
        try {
            Calendar cal = Calendar.getInstance();
            cal.setTime(iso.parse(date));
            cal.set(Calendar.HOUR_OF_DAY, hm[0]);
            cal.set(Calendar.MINUTE, hm[1]);
            cal.set(Calendar.SECOND, 0);
            cal.set(Calendar.MILLISECOND, 0);
            return cal.getTime();
        } catch (Exception e) {
            return null;
        }
    }

    private int[] firstTime(String s) {
        if (s == null) return null;
        String[] tokens = s.split("[\\s\\-–,]+");
        for (String raw : tokens) {
            String t = raw.replaceAll("[.,()]", "");
            String[] bits = t.split(":");
            if (bits.length == 2) {
                try {
                    int h = Integer.parseInt(bits[0]);
                    int m = Integer.parseInt(bits[1]);
                    if (h < 24 && m < 60) return new int[]{h, m};
                } catch (NumberFormatException ignored) { }
            }
        }
        return null;
    }

    private int dp(int n) {
        return Math.round(getResources().getDisplayMetrics().density * n);
    }
}
