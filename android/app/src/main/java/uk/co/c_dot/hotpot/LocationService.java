package uk.co.c_dot.hotpot;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

/**
 * Background service that tracks location and passes it to the server
 */
public class LocationService extends Service {

    // Constants used in preferences and intents
    public static final String DOMAIN = "uk.co.c_dot.hotpot.";

    // startCommand for the service
    public static final String INITIALISE = DOMAIN + "INITIALISE";

    // Commands sent by service
    public static final String LOCATION_CHANGED = DOMAIN + "LOCATION_CHANGED";
    public static final String HOME_CHANGED = DOMAIN + "HOME_CHANGED";

    // Commands received by service
    public static final String PAUSE = DOMAIN + "PAUSE";
    public static final String RESUME = DOMAIN + "RESUME";

    // Preferences
    public static final String PREF_URL = DOMAIN + "URL";
    public static final String PREF_CERTS = DOMAIN + "CERTS";

    protected static final String TAG = "HOTPOT/LocationService";

    /**
     * No bindings
     *
     * @return null
     */
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Start the service. The only thing we do is to start the thread that listens for
     * broadcast messages.
     *
     * @param intent action should always be "INITIALISE"
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "LocationService onStartCommand "
                + ((intent != null) ? intent.getAction() : "") + " id " + startId);
        assert (intent.getAction().equals(INITIALISE));

        // Start the service thread.
        LocationThread thread = new LocationThread(this);
        thread.start();

        // If we get killed, after returning from here, restart
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "LocationService onDestroy");
    }
}
