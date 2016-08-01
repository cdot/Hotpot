/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.app.PendingIntent;
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
import android.text.TextUtils;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.location.LocationListener;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.maps.model.LatLng;

import java.io.IOException;
import java.net.MalformedURLException;
import java.security.KeyStoreException;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Thread that tracks location and sends updates to a remote server.
 */
class PlaceThread extends Thread
        implements Messenger.MessageHandler, LocationListener,
        GoogleApiClient.ConnectionCallbacks, GoogleApiClient.OnConnectionFailedListener,
        SharedPreferences.OnSharedPreferenceChangeListener {

    private static final String TAG = "HOTPOT/PlaceThread";

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

    // Net interface
    private ServerConnection mServerConnection = null;
    // Broadcast comms
    private Messenger mMessenger;
    // Reference to the service that started us
    private Context mServiceContext;
    // Location request used for setting update parameters
    private LocationRequest mLocationRequest;
    // Last recorded location
    private LatLng mCurPos = new LatLng(0, 0);
    // Pending intent used with locations
    private PendingIntent mPendingIntent;

    // Handler for messaging the thread
    private Handler mHandler;
    // Play Store API
    private GoogleApiClient mApiClient;
    // The URL of the server receiving location updates
    private String mServerURL;
    // Boolean that record whether services are being demanded
    private int mRequestHW = -1;
    private int mRequestCH = -1;

    /**
     * Initialise the service thread
     *
     * @param context the Service
     */
    public PlaceThread(Context context, String url) {
        mServerURL = url;
        mServiceContext = context;
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mServiceContext);
        prefs.registerOnSharedPreferenceChangeListener(this);
        Log.d(TAG, "Constructed " + url);
    }

    /**
     * Run the thread
     */
    @Override
    public void run() {
        Log.d(TAG, "Running thread");

        // The looper's only role is to keep the thread alive and listening for location updates
        Looper.prepare();

        mHandler = new Handler();

        mAndroidId = Settings.Secure.getString(mServiceContext.getContentResolver(),
                Settings.Secure.ANDROID_ID);
        mMessenger = new Messenger(mServiceContext, new String[]{
                PlaceService.STOP, PlaceService.REQUEST, PlaceService.POSITION}, this);
        mPendingIntent = PendingIntent.getBroadcast(mServiceContext, 0,
                new Intent(PlaceService.POSITION), PendingIntent.FLAG_UPDATE_CURRENT);
        mServerConnection = null;
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mServiceContext);
        Set<String> certs = prefs.getStringSet(SettingsActivity.PREF_CERTS, null);
        if (mServerURL != null) {
            try {
                mServerConnection = new ServerConnection(mServerURL, certs);
                Log.d(TAG, "connected to server " + mServerURL
                        + " with " + (certs != null ? certs.size() : 0) + " certificates");

            } catch (MalformedURLException mue) {
                String mess = "'" + mServerURL + "' is not a valid URL: " + mue.getMessage();
                Log.e(TAG, mess);
                Toast.makeText(mServiceContext, mess, Toast.LENGTH_LONG).show();
            } catch (KeyStoreException kse) {
                String mess = "Could not connect to server at " + mServerURL
                        + "': " + kse.getMessage();
                Log.e(TAG, mess);
                Toast.makeText(mServiceContext, mess, Toast.LENGTH_LONG).show();
            }
        } else {
            Log.e(TAG, "No server set in preferences");
            Toast.makeText(mServiceContext,
                    "Cannot establish connection to server; URL is not set",
                    Toast.LENGTH_LONG).show();
        }

        mApiClient = new GoogleApiClient.Builder(mServiceContext)
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

    private void setLocationPriority(SharedPreferences prefs) {
        int prio = LocationRequest.PRIORITY_BALANCED_POWER_ACCURACY;
        switch (prefs.getString(SettingsActivity.PREF_ACCURACY, "")) {
            case "LOW":
                prio = LocationRequest.PRIORITY_LOW_POWER;
                break;
            case "HIGH":
                prio = LocationRequest.PRIORITY_HIGH_ACCURACY;
                break;
            case "NO":
                prio = LocationRequest.PRIORITY_NO_POWER;
                break;
        }
        mLocationRequest.setPriority(prio);
    }

    private boolean mLocatorRunning = false;

    private void stopLocator() {
        if (!mLocatorRunning)
            return;
        LocationServices.FusedLocationApi.removeLocationUpdates(mApiClient, mPendingIntent);
        Log.d(TAG, "Locator stopped");
        mLocatorRunning = false;
    }

    private void startLocator() {
        if (mLocatorRunning)
            stopLocator();
        try {
            LocationServices.FusedLocationApi.requestLocationUpdates(
                    mApiClient, mLocationRequest, mPendingIntent);
            Log.d(TAG, "Locator started");
            mLocatorRunning = true;
        } catch (SecurityException se) {
            Log.e(TAG, "Unexpected security exception " + se);
        }
    }

    /**
     * Callback for when an API connection is made
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnected(Bundle connectionHint) throws SecurityException {
        Log.d(TAG, "Connected to googleAPI");

        // Kick off the location server ASAP
        mLocationRequest = LocationRequest.create();
        setLocationPriority(PreferenceManager.getDefaultSharedPreferences(mServiceContext));
        mLocationRequest.setSmallestDisplacement(100); // default 100 meters
        mLocationRequest.setInterval(20000); // every 20s
        startLocator();
    }


    /**
     * Callback for when a Google API connection is suspended
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
     *
     * @param intent the message
     */
    @Override
    public void handleMessage(Intent intent) {
        int i;

        //Log.d(TAG, "handle broadcast message " + intent.getAction());
        switch (intent.getAction()) {
            case PlaceService.STOP:
                mHandler.getLooper().quit();
                break;
            case PlaceService.REQUEST:
                i = intent.getIntExtra("STATE", 0);
                switch (intent.getStringExtra("WHAT")) {
                    case "HW":
                        mRequestHW = i;
                        break;
                    case "CH":
                        mRequestCH = i;
                        break;
                }
                // Send an update asynchronously from the location update queue
                sendUpdate();
                break;
            case PlaceService.POSITION:
                if (LocationResult.hasResult(intent)) {
                    LocationResult locationResult = LocationResult.extractResult(intent);
                    Location location = locationResult.getLastLocation();
                    if (location != null) {
                        mCurPos = new LatLng(location.getLatitude(), location.getLongitude());
                        Log.d(TAG, "locationChanged " + mCurPos);
                        // Send an update to the server
                        sendUpdate();
                    }
                }
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
            return;
        }
        Log.d(TAG, "Sending update to server");

        // Broadcast the new position so the UI can update "last reported"
        Intent intent = new Intent(PlaceService.LOCATION_CHANGED);
        intent.putExtra("LAT", mCurPos.latitude);
        intent.putExtra("LONG", mCurPos.longitude);
        mMessenger.broadcast(intent);

        final Map<String, String> params = new HashMap<>();
        params.put("device", mAndroidId);
        params.put("lat", "" + mCurPos.latitude);
        params.put("lng", "" + mCurPos.longitude);
        ArrayList<String> requests = new ArrayList<>();
        if (mRequestHW >= 0)
            requests.add("HW=" + mRequestHW);
        if (mRequestCH > 0)
            requests.add("CH=" + mRequestCH);
        params.put("requests", TextUtils.join(",", requests));

        // Handle the request in a new thread to avoid blocking the message queue
        Thread ut = new Thread() {
            public void run() {
                String reply = null;
                Looper.prepare(); // So we can Toast
                try {
                    reply = mServerConnection.POST("/set/mobile", params);
                } catch (IOException ioe) {
                    Toast.makeText(mServiceContext, "POST failed " + ioe, Toast.LENGTH_LONG).show();
                }

                if (reply == null)
                    return;

                // Reply includes:
                // lat, lng (location of the server)
                // distance (distance to travel before next update wanted, in metres)
                // due (estimated time of arrival home, in epoch seconds)
                Pattern re = Pattern.compile("\"(.*?)\":(.*?)[,}]");
                Matcher m = re.matcher(reply);
                double latitude = 0, longitude = 0;
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
                        case "distance":
                            float distance = (float) safeDouble(value);
                            if (distance < 100) // Don't update until we have wandered 100m from home
                                distance = 100;
                            Log.d(TAG, "Next update when distance travelled > " + distance + " metres");
                            //stopLocator();
                            mLocationRequest.setSmallestDisplacement(distance);
                            //startLocator();
                            break;
                        case "due":
                            // Not used by mobile
                            break;
                        default:
                            Log.i(TAG, "Bad reply from server " + reply);
                    }
                }

                if (mHomePos == null) {
                    // We've received a home location. Broadcast it to the UI.
                    mHomePos = new LatLng(latitude, longitude);
                    Log.d(TAG, "HOME is at " + mHomePos);
                    Intent intent = new Intent(PlaceService.HOME_CHANGED);
                    intent.putExtra("LAT", mHomePos.latitude);
                    intent.putExtra("LONG", mHomePos.longitude);
                    mMessenger.broadcast(intent);
                }
            }
        };
        ut.start();
    }

    /**
     * Called from scheduler when location changes
     */
    @Override
    public void onLocationChanged(Location location) {

        mCurPos = new LatLng(location.getLatitude(), location.getLongitude());
        Log.d(TAG, "locationChanged " + mCurPos);
        // Send an update to the server
        sendUpdate();
    }

    private void setURL(SharedPreferences prefs) {
        String sURL = prefs.getString(SettingsActivity.PREF_URL, null);
        Log.d(TAG, "setURL " + sURL);
        // Pull certificates from the server and store them in an invisible preference
        SharedPreferences.Editor ed = prefs.edit();
        ed.remove(SettingsActivity.PREF_URL_WARNING);
        ed.remove(SettingsActivity.PREF_CERTS);
        if (sURL != null) {
            try {
                ServerConnection serverConnection = new ServerConnection(sURL);
                Set<String> certs = serverConnection.getCertificates();
                if (certs != null && certs.size() > 0) {
                    Log.d(TAG, sURL + " provided " + certs.size() + " certificates");
                    // It's a bit crap that preferences can't store an ordered list in extras,
                    // but fortunately it doesn't matter.
                    ed.putStringSet(SettingsActivity.PREF_CERTS, new HashSet<>(certs));
                } else if (serverConnection.isSSL()) {
                    ed.putString(SettingsActivity.PREF_URL_WARNING,
                            "Protocol is https, but server did not provide any certificates");
                }
            } catch (MalformedURLException mue) {
                ed.putString(SettingsActivity.PREF_URL_WARNING,
                        "Not a valid URL: " + mue.getMessage());
            }
        }
        ed.apply();
    }

    /**
     * Handle a change to a shared preference. Could this be in the PlaceThread?
     *
     * @param prefs
     * @param key
     */
    public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
        String report = "onSharedPreferenceChanged " + key + "=";
        switch (key) {
            case SettingsActivity.PREF_URL:
                setURL(prefs);
                break;
            case SettingsActivity.PREF_ACCURACY:
                setLocationPriority(prefs);
                startLocator();
                break;
        }
    }
}
