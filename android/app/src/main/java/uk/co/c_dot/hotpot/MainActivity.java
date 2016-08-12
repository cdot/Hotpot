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
import android.location.Location;
import android.os.Bundle;
import android.os.StrictMode;

import android.preference.PreferenceManager;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AppCompatActivity;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import com.google.android.gms.maps.model.LatLng;

/**
 * Hotpot main application.
 * <p>
 * The Hotpot application is divided into two parts; there's this activity, which provides
 * the UI, and a PlaceService that does the actual work of finding the location and
 * communicating it to the server.
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "HOTPOT/MainActivity";

    // Constants used in preferences and intents
    public static final String DOMAIN = "uk.co.c_dot.hotpot.";

    private Context mContext;

    private class BroadcastListener extends BroadcastReceiver {
        public void onReceive(Context context, Intent intent) {
            final TextView tv;
            final Button butt;
            Log.d(TAG, "handle broadcast message " + intent.getAction());
            switch (intent.getAction()) {
                case PlaceService.FENCE_CROSSED:
                    Location pos = intent.getParcelableExtra("POS");
                    String fence = intent.getStringExtra("FENCE");
                    String trans = intent.getStringExtra("TRANSITION");
                    String report = fence + " " + trans + " " + pos;
                    tv = (TextView) findViewById(R.id.display_status);
                    tv.setText(report);
                    break;
                case PlaceService.HOME_CHANGED:
                    LatLng home = intent.getParcelableExtra("POS");
                    tv = (TextView) findViewById(R.id.display_home);
                    tv.setText(home.toString());
                    break;
                case PlaceService.STARTED:
                    Log.d(TAG, "Service has started");
                    butt = ((Button) findViewById(R.id.action_restart));
                    butt.setText(getResources().getString(R.string.reconnect));
                    break;
                case PlaceService.STOPPING:
                    // Something has caused the PlaceService to stop
                    String why = intent.getStringExtra("REASON");
                    Log.d(TAG, "Service has stopped: " + why);
                    Toast.makeText(mContext, why, Toast.LENGTH_LONG).show();
                    tv = (TextView) findViewById(R.id.display_status);
                    tv.setText(why);
                    butt = ((Button) findViewById(R.id.action_restart));
                    butt.setText(getResources().getString(R.string.connect));
                    break;
            }
        }
    }

    /**
     * Call only when we are sure we have all requisite permissions
     */
    private void startLocationService() {
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
        String url = prefs.getString(PlaceService.PREF_URL, null);
        if (url != null || url.length() == 0) {
            Intent intent = new Intent(this, PlaceService.class);
            intent.setAction(PlaceService.START);
            Log.d(TAG, "Starting location service");
            startService(intent);
        } else {
            // TODO: start the settings activity?
            Toast.makeText(this, "Cannot start location service; URL not set",
                    Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Call to stop the service
     */
    private void stopLocationService() {
        Log.d(TAG, "Stopping location service");
        Intent intent = new Intent(this, PlaceService.class);
        intent.setAction(PlaceService.STOP);
        stopService(intent);
    }

    /**
     * Callback for permissions request. Overrides AppCompatActivity
     *
     * @param requestCode  code set in the request
     * @param permissions  permissions asked for
     * @param grantResults dunno
     */
    @Override
    public void onRequestPermissionsResult(
            int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 123
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startLocationService();
        } else {
            Toast.makeText(this, "Permission Denied", Toast.LENGTH_LONG).show();
        }
    }

    public void onClickBoostHW(View view) {
        sendBroadcast(new Intent(PlaceService.BOOST_HW));
    }

    public void onClickBoostCH(View view) {
        sendBroadcast(new Intent(PlaceService.BOOST_CH));
    }

    public void onClickClose(View view) {
        stopLocationService(); // broadcast STOP to all running services
        finish();
    }

    public void onClickRestart(View view) {
        stopLocationService();
        startLocationService();
    }

    /**
     * See Android Activity lifecycle
     * Overrides FragmentActivity
     * Called when the fragment is created
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        mContext = this;
        Log.d(TAG, "onCreate called");

        EditText urlView = ((EditText) findViewById(R.id.server_url));
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mContext);
        String curl = prefs.getString(PlaceService.PREF_URL, null);
        if (curl != null)
            urlView.setText(curl);

        urlView.addTextChangedListener(new TextWatcher() {

                    public void afterTextChanged(Editable s) {
                        Log.d(TAG, "FUCK OFF YOU STUPID CUNT");
                        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mContext);
                        SharedPreferences.Editor ed = prefs.edit();
                        ed.putString(PlaceService.PREF_URL, s.toString());
                        ed.apply();
                    }

                    public void beforeTextChanged(CharSequence s, int start,
                                                  int count, int after) {
                    }

                    public void onTextChanged(CharSequence s, int start,
                                              int before, int count) {
                    }
                });

        IntentFilter intentFilter = new IntentFilter();
        intentFilter.addAction(PlaceService.FENCE_CROSSED);
        intentFilter.addAction(PlaceService.HOME_CHANGED);
        intentFilter.addAction(PlaceService.STARTED);
        intentFilter.addAction(PlaceService.STOPPING);
        registerReceiver(new BroadcastListener(), intentFilter);

        // Check we have permission to get the location - may have to do this in the service?
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) {
            startLocationService();
        } else {
            ActivityCompat.requestPermissions(MainActivity.this,
                    new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.INTERNET},
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