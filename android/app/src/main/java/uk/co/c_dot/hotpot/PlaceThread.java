/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.preference.PreferenceManager;
import android.provider.Settings;
import android.support.annotation.NonNull;
import android.util.Log;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.common.api.ResultCallback;
import com.google.android.gms.common.api.Status;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.maps.model.LatLng;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.MalformedURLException;
import java.security.KeyStoreException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Thread that tracks location and sends updates to a remote server.
 */
class PlaceThread extends Thread {

    private static final String TAG = "HOTPOT/PlaceThread";

    private static final String POSITION = MainActivity.DOMAIN + "POSITION";

    // ANDROID_ID of the device
    private String mAndroidId;

    // Net interface
    private ServerConnection mServerConnection = null;

    // Handler for preferences changes coming from UI
    private PreferencesListener mPrefencesListener = null;

    // Reference to the service that started us
    private Context mServiceContext;

    // Pending intent used with fences
    private PendingIntent mPendingIntent;

    // Handler for messaging the thread
    private Handler mHandler;

    // Play Store API
    private GoogleApiClient mApiClient;

    /**
     * Inner object used for handling connection callbacks.
     */
    private class GoogleApiConnectionHandler implements
            GoogleApiClient.ConnectionCallbacks,
            GoogleApiClient.OnConnectionFailedListener {
        /**
         * Callback for when an API connection is made
         * Implements ConnectionCallbacks
         */
        @Override
        public void onConnected(Bundle connectionHint) throws SecurityException {
            Log.d(TAG, "Connected to googleAPI");
            initialiseServer();
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
            // No point carrying on, can't recover from this
            abort("Problems talking to GoogleAPI: " + result.getErrorMessage());
        }
    }

    /**
     * Handler for changes to shared preferences. Cleaner than using a broadcast.
     */
    private class PreferencesListener
            implements SharedPreferences.OnSharedPreferenceChangeListener {

        public PreferencesListener() {
            SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mServiceContext);
            prefs.registerOnSharedPreferenceChangeListener(this);
        }

        /**
         * Handle a change to a shared preference.
         *
         * @param prefs preferences object
         * @param key   the preference that changed
         */
        public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
            switch (key) {
                case PlaceService.PREF_URL:
                    String sURL = prefs.getString(key, null);
                    stopFencing(); // old server loc is now invalid, kill the fences
                    Log.d(TAG, "setURL " + sURL);
                    // Pull certificates from the server and store them in an invisible preference
                    SharedPreferences.Editor ed = prefs.edit();
                    ed.remove(PlaceService.PREF_URL_WARNING);
                    ed.remove(PlaceService.PREF_CERTS);
                    if (sURL != null) {
                        try {
                            ServerConnection serverConnection = new ServerConnection(sURL);
                            Set<String> certs = serverConnection.getCertificates();
                            if (certs != null && certs.size() > 0) {
                                Log.d(TAG, sURL + " provided " + certs.size() + " certificates");
                                // It's a bit crap that preferences can't store an ordered list in extras,
                                // but fortunately it doesn't matter.
                                ed.putStringSet(PlaceService.PREF_CERTS, new HashSet<>(certs));
                            } else if (serverConnection.isSSL()) {
                                ed.putString(PlaceService.PREF_URL_WARNING,
                                        "Protocol is https, but server did not provide any certificates");
                            }
                            initialiseServer();
                        } catch (MalformedURLException mue) {
                            ed.putString(PlaceService.PREF_URL_WARNING,
                                    "Not a valid URL: " + mue.getMessage());
                        }
                    }
                    ed.apply();
                    break;
            }
        }
    }

    private class BroadcastListener extends BroadcastReceiver {
        public void onReceive(Context cxt, Intent i) {
            switch (i.getAction()) {
                case PlaceService.BOOST_HW:
                    sendRequest("HW", 2);
                    break;
                case PlaceService.BOOST_CH:
                    sendRequest("CH", 2);
                    break;
                case PlaceService.STOP:
                    // Don't issue STOPPING, the UI already knows
                    stopFencing();
                    mHandler.getLooper().quit();
                    break;
            }
        }
    }

    /**
     * Interface to support an action on network coming available
     */
    private interface NetworkHandler {
        void onAvailable();
    }

    /**
     * Initialise the service thread
     *
     * @param context the Service
     */
    public PlaceThread(Context context) {
        mServiceContext = context;
        mPrefencesListener = new PreferencesListener();
    }

    /**
     * * A fatal error occured; terminate the thread, telling the UI (and anyone else
     * who is listening) why.
     * @param mess reason for the abort
     */
    private void abort(String mess) {
        Log.e(TAG, mess);
        // Tell the UI we're stopping (if it's listening)
        Intent i = new Intent(PlaceService.STOPPING);
        i.putExtra("REASON", mess);
        mServiceContext.sendBroadcast(i);
        mHandler.getLooper().quit();
    }

    /**
     * Create geofences around the home location at the radii requested by the server.
     * The server will be notified when the device crosses any of these three fences.
     *
     * @param home the home location of the server
     */
    private void startFencing(LatLng home, JSONObject walls) {
        ArrayList<Geofence> fences = new ArrayList<>();

        JSONArray keys = walls.names();
        for (int i = 0; i < keys.length(); i++) {
            try {
                String s = keys.getString(i);
                // Strictly speaking we only need a maximum of two fences, "getting closer"
                // and "getting further away".
                fences.add(new Geofence.Builder()
                        .setRequestId(s)
                        .setCircularRegion(
                                home.latitude,
                                home.longitude,
                                (float)walls.getDouble(s)
                        )
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER
                                | Geofence.GEOFENCE_TRANSITION_EXIT)
                        .build());
                Log.d(TAG, "Added fence " + s + " at " + walls.getDouble(s) + "m");
            } catch (JSONException je) {
                abort("JSON exception reading config: " + je);
            }
        }

        GeofencingRequest.Builder builder = new GeofencingRequest.Builder();
        builder.addGeofences(fences);
        GeofencingRequest request = builder.build();

        try {
            LocationServices.GeofencingApi.addGeofences(mApiClient, request, mPendingIntent)
                    .setResultCallback(new ResultCallback<Status>() {
                        public void onResult(@NonNull Status r) {
                            if (!r.isSuccess())
                                // no point continuing
                                abort("Geofencing failed" + r.getStatusMessage());
                            else {
                                // Tell the UI we've started walking the fences
                                Intent i = new Intent(PlaceService.STARTED);
                                mServiceContext.sendBroadcast(i);
                            }
                        }
                    });
        } catch (SecurityException se) {
            abort("Security exception setting up fences: " + se);
        }
    }

    /**
     * Remove any fences that have been set up.
     */
    private void stopFencing() {
        LocationServices.GeofencingApi.removeGeofences(
                mApiClient,
                // This is the same pending intent that was used in addGeofences().
                mPendingIntent
        ).setResultCallback(new ResultCallback<Status>() {
            public void onResult(@NonNull Status r) {
                Log.d(TAG, (r.isSuccess() ? "Removed" : "Failed to remove") + " geofences " + r.getStatusMessage());
            }
        }); // Result processed in onResult().
    }

    /**
     * Run the thread. Startup procedure is:
     * Check if network is active. Ask for callback when network comes live?
     * Send "mobile active" message to server
     * If no response is received, back off and try again
     */
    @Override
    public void run() {
        Log.d(TAG, "Running");

        // The looper's only role is to keep the thread alive and listening for location updates
        Looper.prepare();

        mHandler = new Handler();

        mAndroidId = Settings.Secure.getString(mServiceContext.getContentResolver(),
                Settings.Secure.ANDROID_ID);

        // Start listening for commands from the UI
        IntentFilter ifilt = new IntentFilter();
        ifilt.addAction(PlaceService.STOP);
        ifilt.addAction(PlaceService.BOOST_HW);
        ifilt.addAction(PlaceService.BOOST_CH);
        mServiceContext.registerReceiver(new BroadcastListener(), ifilt);

        // PendingIntent for LocationServices position reports. How do we tell from the intent which
        // fence triggered?
        mPendingIntent = PendingIntent.getBroadcast(mServiceContext, 0,
                new Intent(POSITION), PendingIntent.FLAG_UPDATE_CURRENT);

        // Start listening to geofencing events
        mServiceContext.registerReceiver(new BroadcastReceiver() {
            public void onReceive(Context context, Intent intent) {

                GeofencingEvent evt = GeofencingEvent.fromIntent(intent);
                if (evt.hasError()) {
                    Log.e(TAG, "SHIT" + evt.getErrorCode());
                    return;
                }

                List<Geofence> fences = evt.getTriggeringGeofences();
                sendTransition(
                        fences.get(0).getRequestId(),
                        (evt.getGeofenceTransition() == Geofence.GEOFENCE_TRANSITION_EXIT)
                                ? "EXIT" : "ENTER",
                        evt.getTriggeringLocation());
            }
        }, new IntentFilter(POSITION));

        GoogleApiConnectionHandler gapi = new GoogleApiConnectionHandler();
        mApiClient = new GoogleApiClient.Builder(mServiceContext)
                .addConnectionCallbacks(gapi)
                .addOnConnectionFailedListener(gapi)
                .addApi(LocationServices.API)
                .build();
        mApiClient.connect();

        Looper.loop();

        Log.d(TAG, "stopped");

        mApiClient.disconnect();
    }

    private void initialiseServer() {
        Log.d(TAG, "Initialising server");
        connectNetwork(new NetworkHandler() {
            public void onAvailable() {
                establishConnection();
            }
        });
    }

    /**
     * Test if network is available
     *
     * @return whether the network is connected, or in the process of connecting
     */
    private boolean networkIsAvailable() {
        ConnectivityManager connMgr = (ConnectivityManager)
                mServiceContext.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo ni = connMgr.getActiveNetworkInfo();
        if (ni != null)
            Log.d(TAG, "Active network is " + ni);
        return (ni != null && ni.isConnectedOrConnecting());
    }

    /**
     * Make sure we are connected to the network, and when we are, call the handler
     *
     * @param nh the handler
     */
    private void connectNetwork(final NetworkHandler nh) {
        if (networkIsAvailable()) {
            // Already connected, don't need to wait for network
            Log.d(TAG, "Network is available");
            nh.onAvailable();
        } else {
             Log.d(TAG, "Network is not available, waiting to connect");
           // Enable the broadcast receiver for network coming live
            IntentFilter bif = new IntentFilter();
            bif.addAction(ConnectivityManager.CONNECTIVITY_ACTION);
            mServiceContext.registerReceiver(new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Log.d(TAG, "Had CONNECTIVITY_ACTION");
                    if (networkIsAvailable()) {
                        Log.d(TAG, "Network is available");
                        // Don't need the receiver any more, we know the network is live
                        mServiceContext.unregisterReceiver(this);
                        nh.onAvailable();
                    }
                    // Otherwise keep listening for the magic broadcast that says the network
                    // if available
                }
            }, bif);
        }
    }

    /**
     * Establish connection to the server, get it's home location, and start fencing
     */
    private void establishConnection() throws SecurityException {
        Log.d(TAG, "establishConnection");
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(mServiceContext);
        String sURL = prefs.getString(PlaceService.PREF_URL, null);

        if (sURL == null || sURL.equals("")) {
            abort("No server set in preferences");
            return;
        }

        try {
            Set<String> certs = prefs.getStringSet(PlaceService.PREF_CERTS, null);
            mServerConnection = new ServerConnection(sURL, certs);
            Log.d(TAG, "Connected to server " + sURL
                    + " with " + (certs != null ? certs.size() : 0) + " certificates");

            // Post the device ID to register our presence with the server and get the server's
            // home location

            // Get current location
            Location pos = LocationServices.FusedLocationApi.getLastLocation(mApiClient);

            JSONObject params = new JSONObject();
            params.put("device", mAndroidId);
            if (pos != null) {
                params.put("lat", pos.getLatitude());
                params.put("lng", pos.getLongitude());
                if (pos.hasBearing())
                    params.put("bearing", pos.getBearing());
                if (pos.hasSpeed())
                    params.put("speed", pos.getSpeed());
            }

            mServerConnection.POST("/mobile/config", params,
                    new ServerConnection.ResponseHandler() {
                        public void done(Object data) throws IOException {
                            // We've received a home location.
                            try {
                                JSONObject jd = (JSONObject) data;
                                LatLng pos = new LatLng(jd.getDouble("lat"), jd.getDouble("lng"));
                                Log.d(TAG, "HOME is at " + pos);
                                Intent intent = new Intent(PlaceService.HOME_CHANGED);
                                intent.putExtra("POS", pos);
                                // TODO: send the fences to the UI
                                mServiceContext.sendBroadcast(intent);
                                // We know where home is, so we can start fencing.
                                startFencing(pos, jd.getJSONObject("fences"));
                            } catch (JSONException je) {
                                Log.e(TAG, "/mobile/config bad response: " + je);
                            }
                        }

                        public void error(Exception e) {
                            // No point carrying on, can't recover from this
                            abort("Problems talking to server: " + e);
                        }
                    });

        } catch (JSONException je) {
            abort(sURL + " initialisation failed: " + je.getMessage());
        } catch (MalformedURLException mue) {
            abort("'" + sURL + "' is not a valid URL: " + mue.getMessage());
        } catch (KeyStoreException kse) {
            abort("Could not connect to server at " + sURL
                    + "': " + kse.getMessage());
        }
    }

    /**
     * Send a fence transition to the server.
     *
     * @param fence      one of WALK, CYCLE or DRIVE
     * @param transition one of ENTER or EXIT
     * @param pos        where the transition occurred
     */
    private void sendTransition(String fence, String transition, Location pos) {
        Log.d(TAG, "Sending transition to server");

        // Broadcast the new position so the UI can update "last reported"
        Intent intent = new Intent(PlaceService.FENCE_CROSSED);
        intent.putExtra("POS", pos);
        intent.putExtra("FENCE", fence);
        intent.putExtra("TRANSITION", transition);
        mServiceContext.sendBroadcast(intent);

        try {
            JSONObject params = new JSONObject();

            params.put("lat", pos.getLatitude());
            params.put("lng", pos.getLongitude());
            if (pos.hasBearing())
                params.put("bearing", pos.getBearing());
            if (pos.hasSpeed())
                params.put("speed", pos.getSpeed());
            params.put("fence", fence);
            params.put("transition", transition);

            params.put("device", mAndroidId);
            mServerConnection.POST("/mobile/crossing", params,
                    new ServerConnection.ResponseHandler() {
                        public void done(Object data) throws IOException {
                        }

                        public void error(Exception e) {
                            Log.e(TAG, e.toString());
                        }
                    });
        } catch (JSONException je) {
            // Should never happen
            abort("sendRequest exception " + je);
        }
    }

    /**
     * Send a boost request to the server
     *
     * @param pin   the pin to request for; CH or HW
     * @param state the required state; 0 (off) 1 (on) 2 (boost)
     */
    private void sendRequest(String pin, int state) {
        Log.d(TAG, "Sending request to server");

        try {
            JSONObject params = new JSONObject();

            params.put("pin", pin);
            params.put("state", state);

            params.put("device", mAndroidId);
            mServerConnection.POST("/mobile/request", params,
                    new ServerConnection.ResponseHandler() {
                        public void done(Object data) throws IOException {
                        }

                        public void error(Exception e) {
                            Log.e(TAG, e.toString());
                        }
                    });
        } catch (JSONException je) {
            // Should never happen
            abort("sendRequest exception " + je);
        }
    }
}
