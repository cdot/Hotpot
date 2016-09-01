/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.StrictMode;

import android.preference.PreferenceManager;
import android.provider.Settings;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v4.content.LocalBroadcastManager;
import android.support.v7.app.AppCompatActivity;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import android.support.v7.widget.Toolbar;

import org.json.JSONException;
import org.json.JSONObject;

import java.net.MalformedURLException;
import java.security.cert.Certificate;
import java.util.Set;

/**
 * Hotpot main application.
 */
public class MainActivity extends AppCompatActivity
        implements SharedPreferences.OnSharedPreferenceChangeListener {

    private static final String TAG = "HOTPOT/MainActivity";

    // Constants used in preferences and intents. Must be consistent with string resources.
    public static final String DOMAIN = "uk.co.c_dot.hotpot.";
    public static final String PREF_URL = DOMAIN + "URL";
    public static final String PREF_FREQ = DOMAIN + "FREQ";
    public static final String PREF_USER = DOMAIN + "USER";
    public static final String PREF_PASS = DOMAIN + "PASS";

    // Broadcast messages coming from update thread
    private static final String UPDATE = DOMAIN + "UPDATE";

    private static final int ASK_PERMISSION_CODE = 0x80081355;

    private String mAndroidId = null;
    private boolean mAllowedToPOST = false;
    private ServerConnection mServerConnection = null;
    private ListeningThread mListeningThread = null;
    private int mThreadCounter = 0;

    private void boost(String pin) {
        JSONObject params = new JSONObject();
        try {
            params.put("source", mAndroidId);
            params.put("pin", pin);
            params.put("state", "2");
        } catch (JSONException je) {
        }
        mServerConnection.POST_async("/ajax/request", params, null);
    }

    public void onClickBoostHW(View view) {
        boost("HW");
    }

    public void onClickBoostCH(View view) {
        boost("CH");
    }

    public void onClickRefreshCalendar(View view) {
        mServerConnection.GET_async("/ajax/refresh_calendars", null);
    }

    public void onClickQuit(MenuItem item) {
        finish();
    }

    public void onClickRefreshState(View view) {
        // sync so the response is handled in the same thread, simlpy so we can Toast
        mServerConnection.GET_sync("/ajax/state", new AjaxStateResponseHandler(null));
    }

    private boolean isOnline() {
        ConnectivityManager cm =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo netInfo = cm.getActiveNetworkInfo();
        return (netInfo != null && netInfo.isConnectedOrConnecting());
    }

    private boolean allowContinuousUpdates() {
        ConnectivityManager cm =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo netInfo = cm.getActiveNetworkInfo();
        // What sort of connection do we have? Don't do continuous updates if
        return (netInfo != null && netInfo.isConnectedOrConnecting()
                && netInfo.getType() != ConnectivityManager.TYPE_MOBILE);
    }

    private void stopListeningThread() {
        // Kill the server comms thread
        if (mListeningThread != null) {
            Log.d(TAG, "Interrupting listening thread " + mListeningThread.TAG);
            mListeningThread.interrupt();
            mListeningThread = null;
        }
    }

    private void startListeningThread() {
        stopListeningThread();
        if (mAllowedToPOST) {
            mListeningThread = new ListeningThread();
            mListeningThread.start();
        } else {
            Log.e(TAG, "Tried to start listening thread before permissions granted");
            assert (false);
        }
    }

    /**
     * Listener for local broadcasts from listening thread, getting updates to server state
     */
    private class BroadcastListener extends BroadcastReceiver {
        @Override
        public void onReceive(Context ctx, Intent i) {
            if (i.getAction().equals(UPDATE)) {
                View v = MainActivity.this.findViewById(i.getIntExtra("id", 0));
                if (v instanceof Button) // Button is a subclass of textView so must be first
                    ((Button) v).setEnabled(Boolean.parseBoolean(i.getStringExtra("value")));
                else if (v instanceof TextView)
                    ((TextView) v).setText(i.getStringExtra("value"));
                else
                    Log.e(TAG, "Unexpected type in UPDATE");
            }
        }
    }

    /**
     * Handler for the response from /ajax/state
     */
    private class AjaxStateResponseHandler implements ServerConnection.ResponseHandler {
        Runnable callback;

        AjaxStateResponseHandler(Runnable cb) {
            callback = cb;
        }

        // Send a field value update to the main activity
        private void send(String action, int id, Object value) {
            Intent i = new Intent();
            i.setAction(UPDATE);
            i.putExtra("id", id);
            i.putExtra("value", value.toString());
            LocalBroadcastManager.getInstance(MainActivity.this).sendBroadcast(i);
        }

        // Implements ServerConnection.ResponseHandler
        @Override
        public void done(Object data) {
            JSONObject jd = (JSONObject) data, ths, pins, req, pin;
            String state;
            try {
                ths = jd.getJSONObject("thermostat");
                send(UPDATE, R.id.HW_temp, String.format("%.2f", ths.getJSONObject("HW").getDouble("temperature")));
                send(UPDATE, R.id.CH_temp, String.format("%.2f", ths.getJSONObject("CH").getDouble("temperature")));

                pins = jd.getJSONObject("pin");

                pin = pins.getJSONObject("HW");
                state = "" + pin.getInt("state");
                try {
                    req = pin.getJSONObject("request");
                    if (req != null && req.getInt("state") == 2)
                        state = "BOOSTED";
                } catch (JSONException je) {
                }
                send(UPDATE, R.id.HW_state, state);

                pin = pins.getJSONObject("CH");
                state = "" + pin.getInt("state");
                try {
                    req = pin.getJSONObject("request");
                    if (req != null && req.getInt("state") == 2)
                        state = "BOOSTED";
                } catch (JSONException je) {
                }
                send(UPDATE, R.id.CH_state, state);

            } catch (JSONException je) {
                String mess = "Exception decoding response from server: " + je;
                Log.e(TAG, mess);
                Toast.makeText(MainActivity.this, mess, Toast.LENGTH_SHORT).show();
            }
            if (callback != null)
                callback.run();
        }

        // Implements ServerConnection.ResponseHandler
        @Override
        public void error(Exception e) {
            String mess = "Problems talking to server: " + e;
            Log.e(TAG, mess);
            Toast.makeText(MainActivity.this, mess, Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Thread that talks to the server to get state updates. Requires the server connection
     * to be established before it is started.
     */
    private class ListeningThread extends Thread {
        public String TAG;

        private Handler mHandler;
        private AjaxStateResponseHandler mRH;
        private StateUpdater mSU = null;
        private long mUpdateFreq = 5000;

        /**
         * Runnable that is posted for running after a delay
         */
        private class StateUpdater implements Runnable {
            public void run() {
                if (ListeningThread.this.isInterrupted()) {
                    Log.d(TAG, "Interrupted when StateUpdater ran");
                    mHandler.getLooper().quit();
                    return;
                }
                if (allowContinuousUpdates()) {
                    Log.d(TAG, "Getting /ajax/state");
                    // POST_sync to wait for the response
                    mServerConnection.GET_sync("/ajax/state", mRH);
                } else
                    mHandler.postDelayed(mSU, mUpdateFreq);
            }
        }

        public ListeningThread() {
            TAG = MainActivity.TAG + ".Thread" + MainActivity.this.mThreadCounter++;
            mSU = new StateUpdater();
            mRH = new AjaxStateResponseHandler(new Runnable() {
                public void run() {
                    if (ListeningThread.this.isInterrupted()) {
                        Log.d(TAG, "Interrupted when handling server response");
                        mHandler.getLooper().quit();
                    } else
                        mHandler.postDelayed(mSU, mUpdateFreq);
                }
            });
            SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(MainActivity.this);
            mUpdateFreq = Math.round(Double.parseDouble(prefs.getString(PREF_FREQ, "5")) * 1000);
        }

        public void run() {
            Log.d(TAG, "Starting on " + mServerConnection.getUrl());
            Looper.prepare();
            mHandler = new Handler();
            mHandler.postDelayed(mSU, 1);
            Looper.loop();
            Log.d(TAG, "Terminated");
        }
    }

    /**
     * Restart the server connection and listening thread, on startup or if the URL has changed.
     */
    private void resetServerConnection() {
        stopListeningThread();
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(MainActivity.this);
        String sURL = prefs.getString(PREF_URL, null);
        if (sURL == null) {
            Log.d(TAG, "Can't start server connection, URL is null");
            return;
        }
        Log.d(TAG, "Starting server connection on " + sURL);
        String user = prefs.getString(PREF_USER, null);
        String pass = prefs.getString(PREF_PASS, null);
        try {
            // Probe the connection, looking for possible redirect
            mServerConnection = new ServerConnection(sURL, user, pass);
            // Check SSL certificates
            if (mServerConnection.isSSL()) {
                Set<Certificate> certs = mServerConnection.getCertificates();
                if (certs == null || certs.size() == 0) {
                    Toast.makeText(MainActivity.this,
                            "Protocol is https, but server did not provide any certificates",
                            Toast.LENGTH_SHORT).show();
                }
            }
            Log.d(TAG, "Connection to " + mServerConnection.getUrl() + " established");
            startListeningThread();
        } catch (MalformedURLException mue) {
            String mess = "Not a valid URL: " + mue.getMessage();
            Log.e(TAG, mess);
            Toast.makeText(MainActivity.this, mess, Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Callback for permissions request. Overrides AppCompatActivity
     * Invoked as a result of a permissions check that is done on startup. The server connection
     * is only established once we are sure we have permission.
     *
     * @param requestCode  code set in the request
     * @param permissions  permissions asked for
     * @param grantResults dunno
     */
    @Override
    public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == ASK_PERMISSION_CODE
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            mAllowedToPOST = true;
            resetServerConnection();
        } else {
            Toast.makeText(this, "Permission Denied", Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Implements SharedPreferences.OnSharedPreferenceChangeListener
     * Watch for changes to the URL
     *
     * @param prefs preferences object
     * @param key   the preference that changed
     */
    @Override
    public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
        switch (key) {
            case PREF_URL:
            case PREF_USER:
            case PREF_PASS:
                resetServerConnection();
                break;
            case PREF_FREQ:
                Log.d(TAG, "set update freq " + prefs.getString(key, "5"));
                break;
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
            Log.d(TAG, "Starting settings activity");
            startActivity(i);
            return true;
        }
        return false;
    }

    /**
     * Android developer tutorial for toolbar doesn't tell you about this, but without it the
     * overflow menu doesn't show up.
     *
     * @param menu the menu to inflate (populate from XML)
     * @return true to show the menu
     */
    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.toolbar, menu);
        return true;
    }

    /**
     * See Android Activity lifecycle
     * Overrides AppCompatActivity
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d(TAG, "onCreate");
        super.onCreate(savedInstanceState);

        mAndroidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        Log.d(TAG, "androidID " + mAndroidId);
        IntentFilter filter = new IntentFilter();
        filter.addAction(UPDATE);
        LocalBroadcastManager.getInstance(this).registerReceiver(new BroadcastListener(), filter);

        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
        prefs.registerOnSharedPreferenceChangeListener(this);

        StrictMode.ThreadPolicy policy = new StrictMode.ThreadPolicy.Builder().permitAll().build();
        StrictMode.setThreadPolicy(policy);
        setContentView(R.layout.activity_main);

        setSupportActionBar((Toolbar) findViewById(R.id.hotpot_toolbar));

        // Check we have permission to use the internet
        String[] perms = new String[]{Manifest.permission.INTERNET, Manifest.permission.ACCESS_NETWORK_STATE};

        mAllowedToPOST = true;
        for (int i = 0; i < perms.length; i++)
            if (ContextCompat.checkSelfPermission(this, perms[i]) != PackageManager.PERMISSION_GRANTED)
                mAllowedToPOST = false;

        if (mAllowedToPOST)
            resetServerConnection();
        else
            // Not allowed to listen until we get confirmation
            ActivityCompat.requestPermissions(this, perms, ASK_PERMISSION_CODE);
    }

    /**
     * See Android Activity Lifecycle
     * Overrides AppCompatActivity
     */
    @Override
    protected void onStart() {
        Log.d(TAG, "onStart");
        super.onStart();
        // Have to check if the listening thread is already running, because it is started in
        // onCreate.
        if (mListeningThread == null)
            startListeningThread();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides AppCompatActivity
     */
    @Override
    protected void onStop() {
        Log.d(TAG, "onStop");
        super.onStop();
        stopListeningThread();
    }
}
