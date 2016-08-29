/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.StrictMode;

import android.preference.PreferenceManager;
import android.provider.Settings;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AppCompatActivity;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Log;
import android.view.View;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.MalformedURLException;
import java.util.HashSet;
import java.util.Set;

/**
 * Hotpot main application.
 */
public class MainActivity extends AppCompatActivity implements SharedPreferences.OnSharedPreferenceChangeListener {

    private static final String TAG = "HOTPOT/MainActivity";

    // Constants used in preferences and intents
    public static final String DOMAIN = "uk.co.c_dot.hotpot.";
    public static final String PREF_URL = DOMAIN + "URL";
    public static final String PREF_CERTS = DOMAIN + "CERTS";

    private String mAndroidId = null;
    private Context mContext = null;
    private Thread mListeningThread = null;
    private ServerConnection mServerConnection = null;

    public void onClickBoostHW(View view) {
    }

    public void onClickBoostCH(View view) {
    }

    public void onClickClose(View view) {
        finish();
    }

    private void updateTextView(JSONObject jd, String group, String item, String field, int id)
            throws JSONException {
        JSONObject g = jd.getJSONObject(group);
        JSONObject v = g.getJSONObject(item);
        double value = v.getDouble(field);
        TextView tv = ((TextView) MainActivity.this.findViewById(id));
        tv.setText("" + value);
    }

    private class ListeningThread extends Thread {
        private Handler mHandler;

        private class StateUpdater implements Runnable {
            private StateResponseHandler mResponseHandler;

            public StateUpdater() {
                mResponseHandler = new StateResponseHandler();
            }

            public void run() {
                try {
                    JSONObject params = new JSONObject();
                    params.put("device", mAndroidId);
                    mServerConnection.POST("/ajax/state", params, mResponseHandler);
                } catch (JSONException je) {
                    throw new Error(je);
                }
            }
        }

        private class StateResponseHandler implements ServerConnection.ResponseHandler {
            public void done(Object data) {
                try {
                    JSONObject jd = (JSONObject) data;
                    updateTextView(jd, "thermostat", "HW", "temperature", R.id.HW_temp);
                    updateTextView(jd, "thermostat", "CH", "temperature", R.id.CH_temp);
                    updateTextView(jd, "pin", "HW", "state", R.id.HW_state);
                    updateTextView(jd, "pin", "CH", "state", R.id.CH_state);
                } catch (JSONException je) {
                    Toast.makeText(mContext, "Problems decoding response from server: " + je,
                            Toast.LENGTH_SHORT).show();
                }
                if (!ListeningThread.this.isInterrupted())
                    mHandler.postDelayed(new StateUpdater(), 1);
            }

            public void error(Exception e) {
                // No point carrying on, can't recover from this
                Toast.makeText(mContext, "Problems talking to server: " + e, Toast.LENGTH_SHORT).show();
            }
        }

        public void run() {
            Looper.prepare();
            mHandler = new Handler();
            mHandler.postDelayed(new StateUpdater(), 1);
            Looper.loop();
        }
    }

    /**
     * Implements SharedPreferences.OnSharedPreferenceChangeListener
     * https://51.9.106.58:13196
     *
     * @param prefs preferences object
     * @param key   the preference that changed
     */
    @Override
    public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
        if (key.equals(PREF_URL)) {
            String sURL = prefs.getString(key, null);
            Log.d(TAG, "setURL " + sURL);
            // Pull certificates from the server and store them in an invisible preference
            SharedPreferences.Editor ed = prefs.edit();
            ed.remove(PREF_CERTS);
            if (sURL != null) {
                try {
                    // Kill the server comms thread
                    if (mListeningThread != null)
                        mListeningThread.interrupt();
                    mServerConnection = new ServerConnection(sURL);
                    Set<String> certs = mServerConnection.getCertificates();
                    if (certs != null && certs.size() > 0) {
                        Log.d(TAG, sURL + " provided " + certs.size() + " certificates");
                        // It's a bit crap that preferences can't store an ordered list in extras,
                        // but fortunately it doesn't matter.
                        ed.putStringSet(PREF_CERTS, new HashSet<>(certs));
                    } else if (mServerConnection.isSSL()) {
                        Toast.makeText(this,
                                "Protocol is https, but server did not provide any certificates",
                                Toast.LENGTH_SHORT).show();
                    }
                    mListeningThread = new ListeningThread();
                    mListeningThread.start();
                } catch (MalformedURLException mue) {
                    Toast.makeText(this, "Not a valid URL: " + mue.getMessage(), Toast.LENGTH_SHORT).show();
                }
            }
            ed.apply();
        }
    }
    /**
     * Action on the options menu
     *
     * @param item the selected item
     * @return true to consume the event
     */
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == R.id.action_settings) {
            // User chose the "Settings" item, show the app settings UI...
            Intent i = new Intent(this, SettingsActivity.class);
            startActivity(i);
            return true;
        }
    }

    /**
     * See Android Activity lifecycle
     * Overrides FragmentActivity
     * Called when the fragment is created
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        mAndroidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        mContext = this;

        setContentView(R.layout.activity_main);

        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mContext);
        prefs.registerOnSharedPreferenceChangeListener(this);
        String curl = prefs.getString(PREF_URL, null);

        // Check we have permission to use the internet
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.INTERNET)
                == PackageManager.PERMISSION_GRANTED) {
        } else {
            ActivityCompat.requestPermissions(MainActivity.this,
                    new String[]{Manifest.permission.INTERNET},
                    123);
        }

        StrictMode.ThreadPolicy policy = new StrictMode.ThreadPolicy.Builder().permitAll().build();
        StrictMode.setThreadPolicy(policy);
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStart() {
        Log.d(TAG, "onStart");
        super.onStart();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    public void onResume() {
        Log.d(TAG, "onResume");
        super.onResume();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStop() {
        Log.d(TAG, "onStop");
        super.onStop();
    }
}
