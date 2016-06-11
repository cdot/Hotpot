/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.Location;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.preference.PreferenceManager;
import android.provider.Settings;
import android.support.annotation.NonNull;
import android.util.Log;
import android.widget.Toast;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.maps.model.LatLng;

import java.io.IOException;
import java.net.MalformedURLException;
import java.security.KeyStoreException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thread that tracks location and sends updates to a remote server.
 */
class LocationThread extends Thread
        implements Messenger.MessageHandler,
        GoogleApiClient.ConnectionCallbacks, GoogleApiClient.OnConnectionFailedListener,
        SharedPreferences.OnSharedPreferenceChangeListener {

    private static final String TAG = "HOTPOT/LocationThread";

    // Default update frequency
    private static final long UPDATE_INTERVAL = 5000; // ms

    // Radius of the earth, for haversine
    private static final double EARTH_RADIUS = 6371000; // metres

    private static double safeDouble(String value) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException nfe) {
            return 0;
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
    private static double haversine(LatLng p1, LatLng p2) {
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

    // ANDROID_ID of the device
    private String mAndroidId;
    // Server home location
    private LatLng mHomePos = null;
    // Last position of this device
    private LatLng mLastPos = null;
    // Net interface
    private ServerConnection mServerConnection = null;
    // Broadcast comms
    private Messenger mMessenger;
    // Reference to the service that started us
    private Context mContext;
    // Handler for messaging the thread
    private Handler mHandler;
    // Play Store API
    private GoogleApiClient mApiClient;

    // Runnable that is executed when a location is wanted
    private Runnable mWakeUp = new Runnable() {
        @Override
        public void run() {
            //Log.d(TAG, "Woken");
            mHandler.postDelayed(mWakeUp, locationChanged());
        }
    };

    /**
     * Initialise the service thread
     *
     * @param context the Service
     */
    public LocationThread(Context context) {
        mContext = context;
    }

    @Override
    public void run() {
        Log.d(TAG, "run");
        mAndroidId = Settings.Secure.getString(mContext.getContentResolver(), Settings.Secure.ANDROID_ID);
        mMessenger = new Messenger(mContext, new String[]{LocationService.STOP}, this);

        Looper.prepare();
        mHandler = new Handler();

        mApiClient = new GoogleApiClient.Builder(mContext)
                .addConnectionCallbacks(this)
                .addOnConnectionFailedListener(this)
                .addApi(LocationServices.API)
                .build();
        // A thread has no onCreate so we have to explicitly connect
        mApiClient.connect();

        Looper.loop();

        Log.d(TAG, "stopped");

        // Cleanup
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mContext);
        prefs.unregisterOnSharedPreferenceChangeListener(this);
        mApiClient.disconnect();
    }


    /**
     * Callback for when an API connection is made
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnected(Bundle connectionHint) throws SecurityException {
        Log.d(TAG, "connected to API");

        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mContext);
        String sURL = prefs.getString(LocationService.PREF_URL, null);
        if (sURL != null) {
            try {
                mServerConnection = new ServerConnection(
                        sURL, prefs.getStringSet(LocationService.PREF_CERTS, null));
                Log.d(TAG, "connected to server " + sURL);

            } catch (MalformedURLException | KeyStoreException e) {
                Toast.makeText(mContext,
                        "'" + sURL + "' is not a valid URL: " + e.getMessage(),
                        Toast.LENGTH_LONG).show();
                Log.e(TAG, "Could not connect to server " + sURL);
            }
        } else {
            Toast.makeText(mContext,
                    "Cannot establish connection to server; URL is not set",
                    Toast.LENGTH_LONG).show();
            Log.e(TAG, "No server set in preferences");
        }
        prefs.registerOnSharedPreferenceChangeListener(this);

        // Kick off the location server ASAP
        mHandler.postDelayed(mWakeUp, 1);
    }


    /**
     * Callback for when an API connection is suspended
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnectionSuspended(int cause) {
        Log.d(TAG, "onConnectionSuspended - trying again");
        // The connection to Google Play services was lost for some
        // reason. We call connect() to attempt to reestablish the
        // connection.
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
        Log.i(TAG, "onConnectionFailed: " + result.getErrorMessage());
    }

    @Override
    public void handleMessage(Intent intent) {
        Log.d(TAG, "handleMessage " + intent.getAction());
        switch (intent.getAction()) {
            case LocationService.STOP:
                mHandler.getLooper().quit();
                break;
        }
    }

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

        Map<String, String> params = new HashMap<>();
        params.put("device", mAndroidId);
        params.put("latitude", "" + loc.latitude);
        params.put("longitude", "" + loc.longitude);
        String reply = null;
        try {
            reply = mServerConnection.GET("/mobile", params);
        } catch (IOException ioe) {
            Toast.makeText(mContext, "GET failed " + ioe, Toast.LENGTH_SHORT).show();
        }
        long next_update = UPDATE_INTERVAL;

        if (reply != null) {
            // Reply includes:
            // latitude, longitude (location of the server)
            // next_update (earliest time to send the next update, in epoch seconds)
            Pattern re = Pattern.compile("\"(.*?)\":(.*?)[,}]");
            Matcher m = re.matcher(reply);
            double latitude = 0, longitude = 0;
            while (m.find()) {
                String key = m.group(1);
                String value = m.group(2);
                switch (key) {
                    case "home_lat":
                        latitude = safeDouble(value);
                        break;
                    case "home_long":
                        longitude = safeDouble(value);
                        break;
                    case "interval":
                        next_update = (long) (safeDouble(value) * 1000);
                        break;
                    default:
                        Log.i(TAG, "Bad reply from server " + reply);
                }
            }

            if (mHomePos == null) {
                mHomePos = new LatLng(latitude, longitude);
                Log.d(TAG, "HOME is at " + mHomePos);
                mMessenger.broadcast(LocationService.HOME_CHANGED, mHomePos);
            }
        }
        if (next_update < UPDATE_INTERVAL)
            next_update = UPDATE_INTERVAL;

        return next_update;
    }

    /**
     * Called from scheduler when location changes
     */
    public long locationChanged() {
        Location location;
        try {
            location = LocationServices.FusedLocationApi.getLastLocation(mApiClient);
        } catch (SecurityException se) {
            Log.d(TAG, "locationChanged security exception " + se.getMessage());
            location = null;
        }
        if (location == null) {
            // TODO: back off for longer than this. Consider going back to user for guidance.
            // Repeated location requests are going to get expensive.
            Log.d(TAG, "locationChanged: location is null");
            return UPDATE_INTERVAL;
        }
        Log.d(TAG, "locationChanged " + location);
        LatLng curPos = new LatLng(location.getLatitude(), location.getLongitude());

        if (mLastPos != null) {
            double dist = haversine(mLastPos, curPos);

            // If within 20m of the old position, then not moving, Do no more
            if (dist < 20 && mHomePos != null) {
                Log.d(TAG, "Not sending location update, not moved enough: " + dist + "m");
                return UPDATE_INTERVAL;
            }
        }

        mMessenger.broadcast(LocationService.LOCATION_CHANGED, curPos);

        mLastPos = curPos;
        return sendUpdate(curPos);
    }

    public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
        Log.d(TAG, "onSharedPreferenceChanged");
        if (!key.equals(LocationService.PREF_URL))
            return;
        String sURL = prefs.getString(LocationService.PREF_URL, null);
        mServerConnection = null;
        try {
            mServerConnection = new ServerConnection(sURL);
            Set<String> certs = mServerConnection.getCertificates();
            // Store the certs in an invisible preference
            SharedPreferences.Editor ed = prefs.edit();
            if (certs != null) {
                Log.d(TAG, sURL + " provided " + certs.size() + " certificates");
                ed.putStringSet(LocationService.PREF_CERTS, certs);
            } else {
                ed.remove(LocationService.PREF_CERTS);
                if (mServerConnection.isSSL())
                    Toast.makeText(mContext,
                            "Protocol is https, but " + sURL + " did not provide any certificates",
                            Toast.LENGTH_SHORT).show();
            }
            ed.apply();
        } catch (MalformedURLException mue) {
            mServerConnection = null;
            Toast.makeText(mContext,
                    sURL + " is not a valid URL: " + mue.getMessage(),
                    Toast.LENGTH_SHORT).show();
        }
    }
}
