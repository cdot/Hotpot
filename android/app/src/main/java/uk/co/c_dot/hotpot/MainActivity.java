/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

// Generic java

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Bundle;
import android.os.Handler;
import android.os.StrictMode;
import android.preference.PreferenceManager;
import android.provider.Settings;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.Toast;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.common.api.GoogleApiClient.ConnectionCallbacks;
import com.google.android.gms.common.api.GoogleApiClient.OnConnectionFailedListener;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.maps.CameraUpdate;
import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.SupportMapFragment;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import java.io.IOException;
import java.net.MalformedURLException;
import java.security.KeyStoreException;
import java.text.DateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Android app
// Google API client. used for location and maps

public class MainActivity
        extends AppCompatActivity
        implements ConnectionCallbacks, OnConnectionFailedListener,
        OnMapReadyCallback {

    protected static final String TAG = "HOTPOT";
    private static final String PREF_URL = "hotpotServerURL";
    private static final String PREF_CERTS = "hotpotServerCerts";

    /**
     * Scheduler for location updates
     */
    private class WakeUp implements Runnable {
        private boolean ignoreNext = true;

        @Override
        public void run() {
            //Log.i(TAG, "Woken");
            if (!ignoreNext)
                locationChanged();
        }

        public void cancelWake() {
            ignoreNext = true;
        }

        public void wakeUpAfter(long update) {
            ignoreNext = false;
            mWakeUpHandler.postDelayed(this, update);
        }
    }

    private class PreferenceChangedListener implements SharedPreferences.OnSharedPreferenceChangeListener {
        public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
            if (key.equals(PREF_URL)) {
                Log.d(TAG, "hotpotServerURL has changed");
                String sURL = prefs.getString(PREF_URL, null);
                try {
                    mServerConnection = new ServerConnection(sURL);
                } catch (MalformedURLException mue) {
                    mServerConnection = null;
                    Toast.makeText(getApplicationContext(),
                            sURL + " is not a valid URL: " + mue.getMessage(),
                            Toast.LENGTH_SHORT).show();
                }
                if (mServerConnection != null) {
                    Set<String> certs = mServerConnection.getCertificates();
                    // Store the certs in an invisible preference
                    Log.d(TAG, sURL + " provided " + certs.size() + " certificates");
                    SharedPreferences.Editor ed = prefs.edit();
                    if (certs != null) {
                        ed.putStringSet(PREF_CERTS, certs);
                    } else {
                        ed.remove(PREF_CERTS);
                        if (mServerConnection.isSSL())
                            Toast.makeText(getApplicationContext(),
                                    "Protocol is https, but " + sURL + " did not provide any certificates",
                                    Toast.LENGTH_SHORT).show();
                    }
                    ed.apply();
                }
            }
            // PREFS_CERTS doesn't need to be handled, as it only changes value when the URL
            // changes
        }
    }

    private static final long UPDATE_INTERVAL = 5000; // ms
    private Handler mWakeUpHandler = new Handler();
    private WakeUp mWakeUp = new WakeUp();

    // ANDROID_ID of the device
    private String mAndroidId = null;

    // Radius of the earth, for haversine
    private static final double EARTH_RADIUS = 6371000; // metres

    // API objects
    protected GoogleApiClient mApiClient = null;
    private GoogleMap mMap = null;

    // Current location marker
    private Marker mMobileMarker, mHomeMarker;

    // Server home location
    private LatLng mHomePos = null, mLastPos = null;

    // Net interface
    private ServerConnection mServerConnection = null;

    // Preferences
    SharedPreferences.OnSharedPreferenceChangeListener mPrefsListener = null;

    /**
     * Debugging, convert stack trace to a string for logging
     *
     * @param e exception to analyse
     * @return string of stack trace
     *
    private String getStackTrace(Exception e) {
    StringWriter writer = new StringWriter();
    PrintWriter printWriter = new PrintWriter(writer);
    e.printStackTrace(printWriter);
    printWriter.flush();
    return writer.toString();
    }*/

    /**
     * Send a location update to the server. If the home location hasn't
     * been set already, use the server response to set it. Schedules the
     * next update.
     *
     * @param loc new location
     * @return the interval before a new update is wanted
     */
    private long sendUpdate(LatLng loc) {
        if (mServerConnection == null)
            return UPDATE_INTERVAL;

        Log.i(TAG, "Sending location update");

        Map<String, String> params = new HashMap<>();
        params.put("device", mAndroidId);
        params.put("latitude", "" + loc.latitude);
        params.put("longitude", "" + loc.longitude);
        String reply = null;
        try {
            reply = mServerConnection.GET("/mobile", params);
        } catch (IOException ioe) {
            Toast.makeText(this,
                    "GET failed " + ioe,
                    Toast.LENGTH_SHORT).show();
        }
        long next_update = UPDATE_INTERVAL;

        if (reply != null) {
            // Reply includes:
            // latitude, longitude (location of the server)
            // next_update (earliest time to send the next update, in epoch seconds)
            Pattern re = Pattern.compile("\"(.*?)\":(.*?)[,}]");
            Matcher m = re.matcher(reply);
            double latitude = 0, longitude = 0;
            while (m.find())

            {
                String key = m.group(1);
                String value = m.group(2);
                switch (key) {
                    case "home_lat":
                        latitude = Double.parseDouble(value);
                        break;
                    case "home_long":
                        longitude = Double.parseDouble(value);
                        break;
                    case "interval":
                        next_update = (long) (Double.parseDouble(value) * 1000);
                        break;
                    default:
                        Log.i(TAG, "Bad reply from server " + reply);
                }
            }

            if (mHomePos == null) {
                mHomePos = new LatLng(latitude, longitude);
                Log.i(TAG, "HOME is at " + mHomePos);
            }
        }
        if (next_update < UPDATE_INTERVAL)
            next_update = UPDATE_INTERVAL;

        return next_update;
    }

    /**
     * Seek permission to access location
     */
    private void requestLocationPermission() {
        ActivityCompat.requestPermissions(this, new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.INTERNET
        }, 123);
    }

    /**
     * Callback for permissions request. Overrides FragmentActivity
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
            mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
        } else {
            Toast.makeText(this, "Permission Denied", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Return the crow-flies distance between two locations,
     * each specified by lat and long.
     *
     * @param p1 LatLng of first point
     * @param p2 LatLng of second point
     * @return distance in metres
     */
    private double haversine(LatLng p1, LatLng p2) {
        double lat1 = p1.latitude * Math.PI / 180;
        double lat2 = p2.latitude * Math.PI / 180;
        double dLat = (p2.latitude - p1.latitude) * Math.PI / 180;
        double dLong = (p2.longitude - p1.longitude) * Math.PI / 180;

        double a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(lat1) * Math.cos(lat2) *
                                Math.sin(dLong / 2) * Math.sin(dLong / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return EARTH_RADIUS * c;
    }

    /**
     * Update the map with a new position
     *
     * @param curPos new position
     */
    private void updateMap(LatLng curPos) {
        if (mMap == null)
            return; // map not ready yet

        if (mHomePos != null && mHomeMarker == null) {
            mHomeMarker = mMap.addMarker(new MarkerOptions().position(mHomePos));
        }

        CameraUpdate cam;
        if (mMobileMarker == null) {
            mMobileMarker = mMap.addMarker(new MarkerOptions()
                    //.draggable(false)
                    .position(curPos)
                    .flat(true));
            cam = CameraUpdateFactory.newLatLngZoom(curPos, 12);
        } else
            cam = CameraUpdateFactory.newLatLng(curPos);

        mMobileMarker.setPosition(curPos);
        mMobileMarker.setTitle(DateFormat.getTimeInstance().format(new Date()));

        if (mLastPos != null) {
            double latDiff = curPos.latitude - mLastPos.latitude;
            double longDiff = curPos.longitude - mLastPos.longitude;
            double rotation;
            if (latDiff == 0)
                rotation = (longDiff == 0)
                        ? 0
                        : (longDiff > 0)
                        ? 270
                        : 90;
            else if (longDiff == 0)
                rotation = (latDiff > 0) ? 180 : 0;
            else
                rotation = 360 * Math.atan2(-longDiff, -latDiff) / (2 * Math.PI);
            mMobileMarker.setRotation((float) rotation);
        }

        mMap.moveCamera(cam);
    }

    /**
     * Called from scheduler when location changes
     */
    public void locationChanged() {
        Location location;
        try {
            location = LocationServices.FusedLocationApi.getLastLocation(mApiClient);
        } catch (SecurityException se) {
            Log.d(TAG, "locationChanged failed " + se.getMessage());
            mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
            return;
        }
        Log.d(TAG, "locationChanged " + location);
        if (location == null || mMap == null) {
            mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
            return;
        }
        LatLng curPos = new LatLng(location.getLatitude(),
                location.getLongitude());

        if (mLastPos != null) {
            double dist = haversine(mLastPos, curPos);

            // If within 20m of the old position, then not moving, Do no more
            if (dist < 20 && mHomePos != null) {
                Log.i(TAG, "Not sending location update, not moved enough: " + dist + "m");
                mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
                return;
            }
        }

        updateMap(curPos);

        mLastPos = curPos;
        mWakeUp.wakeUpAfter(sendUpdate(curPos));
    }

    /**
     * Action on the options menu
     *
     * @param item the selected item
     * @return true to consume the event
     */
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case R.id.action_settings:
                // User chose the "Settings" item, show the app settings UI...
                Intent i = new Intent(this, SettingsActivity.class);
                startActivity(i);
                return true;

            default:
                // If we got here, the user's action was not recognized.
                // Invoke the superclass to handle it.
                return super.onOptionsItemSelected(item);

        }
    }

    /**
     * Adnroid developer tutorial for toolbar doesn't tell you about this, but without it the
     * overflow menu doesn't show up.
     *
     * @param menu the menu to inflate (populate from XML)
     * @return true to show the menu
     */
    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.toolbar_menu, menu);
        return true;
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
        Log.d(TAG, "onCreate called");

        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
        if (mServerConnection == null) {
            String sURL = prefs.getString(PREF_URL, null);
            try {
                mServerConnection = new ServerConnection(
                        sURL, prefs.getStringSet(PREF_CERTS, null));
            } catch (MalformedURLException | KeyStoreException e) {
                Toast.makeText(getApplicationContext(),
                        sURL + " is not a useable URL: " + e.getMessage(),
                        Toast.LENGTH_SHORT).show();
            }
        }
        if (mPrefsListener == null) {
            mPrefsListener = new PreferenceChangedListener();
            Log.d(TAG, "Installing prefs listener");
            prefs.registerOnSharedPreferenceChangeListener(mPrefsListener);
        }
        mMap = null;
        mMobileMarker = null;
        if (mAndroidId == null)
            mAndroidId = Settings.Secure
                    .getString(getContentResolver(), Settings.Secure.ANDROID_ID);

        // SMELL: move networking activity to a thread
        StrictMode.ThreadPolicy policy = new StrictMode.ThreadPolicy.Builder().permitAll().build();
        StrictMode.setThreadPolicy(policy);

        mApiClient = new GoogleApiClient.Builder(this)
                .addConnectionCallbacks(this)
                .addOnConnectionFailedListener(this)
                .addApi(LocationServices.API)
                .build();

        // Add the Toolbar
        Toolbar toolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        // Obtain the SupportMapFragment and get notified when the map
        // is ready to be used.
        SupportMapFragment mapFragment =
                (SupportMapFragment) getSupportFragmentManager()
                        .findFragmentById(R.id.map);
        mapFragment.getMapAsync(this);

        mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStart() {
        Log.d(TAG, "onStart");
        super.onStart();
        if (mApiClient != null)
            mApiClient.connect();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    public void onResume() {
        Log.d(TAG, "onResume");
        super.onResume();
        mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStop() {
        Log.d(TAG, "onStop");
        mWakeUp.cancelWake();
        if (mApiClient != null)
            mApiClient.disconnect();
        super.onStop();
    }

    // Implements OnMapReadyCallback
    @Override
    public void onMapReady(GoogleMap googleMap) {
        Log.d(TAG, "onMapReady");
        mMap = googleMap;
    }

    /**
     * Callback for when an API connection is suspended
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnected(Bundle connectionHint) throws SecurityException {
        Log.d(TAG, "onConnected");
        // Check we have permission to get the location
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED)
            mWakeUp.wakeUpAfter(UPDATE_INTERVAL);
        else // if not, request it
            requestLocationPermission();
        Log.d(TAG, "Constructed location listener");
    }

    /**
     * Callback for when an API connection is suspended
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnectionSuspended(int cause) {
        // The connection to Google Play services was lost for some
        // reason. We call connect() to attempt to re-establish the
        // connection.
        Log.d(TAG, "onConnectionSuspended");
        if (mApiClient != null)
            mApiClient.connect();
    }

    /**
     * Callback for when an API connection fails
     * Implements OnConnectionFailedListener
     *
     * @param result carrier for error code
     */
    @Override
    public void onConnectionFailed(@NonNull ConnectionResult result) {
        // Refer to the javadoc for ConnectionResult to see what error
        // codes might be returned in onConnectionFailed.
        Log.i(TAG, "onConnectionFailed: ConnectionResult.getErrorCode() = "
                + result.getErrorCode());
    }
}
