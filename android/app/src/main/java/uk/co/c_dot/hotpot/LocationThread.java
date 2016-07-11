/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thread that tracks location and sends updates to a remote server.
 */
class LocationThread extends Thread
        implements Messenger.MessageHandler,
        GoogleApiClient.ConnectionCallbacks, GoogleApiClient.OnConnectionFailedListener {

    private static final String TAG = "HOTPOT/LocationThread";

    // Default update frequency
    private static final long DEFAULT_INTERVAL = 1 * 60 * 1000; // 1 minute in ms

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
    // The URL of the server receiving location updates
    private String mServerURL;
    // SSL certificates that are acceptable for the given server
    private List<String> mServerCerts;
    // Boolean that record whether services are being demanded
    private boolean mRequestHW = false;
    private boolean mRequestCH = false;

    // Runnable that is executed when a location is wanted
    private Runnable mLCRun = new Runnable() {
        @Override
        public void run() {
            Log.d(TAG, "Timeout check location");
            // check the location, and schedule the next update from the interval returned
            locationChanged();
        }
    };

    /**
     * Queue a request for a location update after the given interval. This will replace any
     * queued update.
     * @param interval number of ms to wait before posting (uptime)
     */
    private void queueLocationUpdate(long interval) {
        Log.d(TAG, "Check location in " + (interval / 1000) + "s");
        // Remove existing update callbacks
        mHandler.removeCallbacks(mLCRun);
        // Replace with the new callback
        mHandler.postDelayed(mLCRun, interval);
    }

    /**
     * Initialise the service thread
     *
     * @param context the Service
     */
    public LocationThread(Context context, String url, List<String> certs) {
        mServerURL = url;
        mServerCerts = certs;
        mContext = context;
        Log.d(TAG, "Constructed " + url + " with " + (certs != null ? certs.size() : 0) + " certificates");
    }

    /**
     * Run the thread
     */
    @Override
    public void run() {
        Log.d(TAG, "run");

        Looper.prepare();

        mAndroidId = Settings.Secure.getString(mContext.getContentResolver(), Settings.Secure.ANDROID_ID);
        mMessenger = new Messenger(mContext, new String[]{
                LocationService.STOP, LocationService.REQUEST}, this);
        mServerConnection = null;
        if (mServerURL != null) {
            try {
                mServerConnection = new ServerConnection(mServerURL, mServerCerts);
                Log.d(TAG, "connected to server " + mServerURL
                        + " with " + (mServerCerts != null ? mServerCerts.size() : 0) + " certificates");

            } catch (MalformedURLException mue) {
                String mess = "'" + mServerURL + "' is not a valid URL: " + mue.getMessage();
                Log.e(TAG, mess);
                Toast.makeText(mContext, mess, Toast.LENGTH_LONG).show();
            } catch (KeyStoreException kse) {
                String mess = "Could not connect to server at " + mServerURL + "': " + kse.getMessage();
                Log.e(TAG, mess);
                Toast.makeText(mContext, mess, Toast.LENGTH_LONG).show();
            }
        } else {
            Log.e(TAG, "No server set in preferences");
            Toast.makeText(mContext,
                    "Cannot establish connection to server; URL is not set",
                    Toast.LENGTH_LONG).show();
        }

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

        mApiClient.disconnect();
    }


    /**
     * Callback for when an API connection is made
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnected(Bundle connectionHint) throws SecurityException {
        Log.d(TAG, "connected to API");

        // Kick off the location server ASAP
        queueLocationUpdate(1);
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

     /**
     * * Handle a broadcast message coming from the UI
     * @param intent
     */
    @Override
    public void handleMessage(Intent intent) {
        Log.d(TAG, "handle broadcast message " + intent.getAction());
        switch (intent.getAction()) {
            case LocationService.STOP:
                mHandler.getLooper().quit();
                break;
            case LocationService.REQUEST:
                boolean onoff = intent.getBooleanExtra("ONOFF", false);
                switch (intent.getStringExtra("WHAT")) {
                    case "HW":
                        mRequestHW = onoff;
                        break;
                    case "CH":
                        mRequestCH = onoff;
                        break;
                }
                // Send an update asynchronously from the location update queue
                sendUpdate();
                break;
        }
    }

    /**
     * Send a location update to the server. If the home location hasn't
     * been set already, use the server response to set it. Schedules the
     * next update.
     */
    private void sendUpdate() {
        if (mServerConnection == null) {
            Log.w(TAG, "Cannot send location update, no server connection");
            queueLocationUpdate(DEFAULT_INTERVAL);
            return;
        }
        Log.d(TAG, "Sending update to server");

        final Map<String, String> params = new HashMap<>();
        params.put("device", mAndroidId);
        params.put("lat", "" + mLastPos.latitude);
        params.put("lng", "" + mLastPos.longitude);
        if (mRequestHW)
            params.put("request_HW", "true");
        if (mRequestCH)
            params.put("request_CH", "true");

        // Handle the request in a new thread to avoid blocking the message queue
        Thread ut = new Thread() {
            public void run() {
                String reply = null;
                Looper.prepare(); // So we can Toast
                try {
                    reply = mServerConnection.POST("/set/mobile", params);
                } catch (IOException ioe) {
                    Toast.makeText(mContext, "POST failed " + ioe, Toast.LENGTH_LONG).show();
                }

                if (reply == null) {
                    queueLocationUpdate(DEFAULT_INTERVAL);
                    return;
                }

                // Reply includes:
                // lat, lng (location of the server)
                // interval (time before next update wanted, in epoch seconds)
                Pattern re = Pattern.compile("\"(.*?)\":(.*?)[,}]");
                Matcher m = re.matcher(reply);
                double latitude = 0, longitude = 0;
                long interval = DEFAULT_INTERVAL;
                while (m.find()) {
                    String key = m.group(1);
                    String value = m.group(2);
                    switch (key) {
                        case "lat":
                            latitude = safeDouble(value);
                            break;
                        case "lng":
                            longitude = safeDouble(value);
                            break;
                        case "interval":
                            interval = (long) (safeDouble(value) * 1000);
                            break;
                        default:
                            Log.i(TAG, "Bad reply from server " + reply);
                    }
                }

                if (mHomePos == null) {
                    mHomePos = new LatLng(latitude, longitude);
                    Log.d(TAG, "HOME is at " + mHomePos);
                    Intent intent = new Intent(LocationService.HOME_CHANGED);
                    intent.putExtra("LAT", mHomePos.latitude);
                    intent.putExtra("LONG", mHomePos.longitude);
                    mMessenger.broadcast(intent);
                }
                if (interval < DEFAULT_INTERVAL)
                    interval = DEFAULT_INTERVAL;

                queueLocationUpdate(interval);
            }
        };
        ut.start();
    }

    /**
     * Called from scheduler when location changes
     */
    private void locationChanged() {
        Location location;
        try {
            location = LocationServices.FusedLocationApi.getLastLocation(mApiClient);
        } catch (SecurityException se) {
            Log.w(TAG, "locationChanged security exception " + se.getMessage());
            location = null;
        }
        if (location == null) {
            // TODO: back off for longer than this. Consider going back to user for guidance.
            // Repeated location requests are going to get expensive.
            Log.w(TAG, "locationChanged: location is null");
            queueLocationUpdate(DEFAULT_INTERVAL);
            return;
        }
        LatLng curPos = new LatLng(location.getLatitude(), location.getLongitude());
        Log.d(TAG, "locationChanged " + curPos);

        if (mLastPos != null) {
            double dist = haversine(mLastPos, curPos);

            // If within 20m of the old position, then not moving, Do no more
            if (dist < 20 && mHomePos != null) {
                Log.d(TAG, "Not sending location update, not moved enough: " + dist + "m");
                queueLocationUpdate(DEFAULT_INTERVAL);
                return;
            }
        }

        Intent intent = new Intent(LocationService.LOCATION_CHANGED);
        intent.putExtra("LAT", curPos.latitude);
        intent.putExtra("LONG", curPos.longitude);
        mMessenger.broadcast(intent);

        mLastPos = curPos;
        sendUpdate();
    }
}
