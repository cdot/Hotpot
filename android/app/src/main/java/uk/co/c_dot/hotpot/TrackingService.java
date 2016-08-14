/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;

/**
 * Background service that tracks location and passes it to the server. The service simply starts
 * a TrackingThread that actually does the hard work of tracking the location. This is a
 * singleton - there should only ever be one copy of this service running.
 */
public class TrackingService extends Service {

    // User preferences
    public static final String PREF_URL = MainActivity.DOMAIN + "URL";

    // Hidden preferences
    public static final String PREF_URL_WARNING = MainActivity.DOMAIN + "URL_WARNING";
    public static final String PREF_CERTS = MainActivity.DOMAIN + "CERTS";

    private static final String TAG = "HOTPOT/TrackingService";

    // Commands/broadcasts received by service
    public static final String START = MainActivity.DOMAIN + "START";
    public static final String STOP = MainActivity.DOMAIN + "STOP";
    public static final String BOOST_HW = MainActivity.DOMAIN + "BOOST_HW";
    public static final String BOOST_CH = MainActivity.DOMAIN + "BOOST_CH";

    // Data sent by service
    public static final String STARTED = MainActivity.DOMAIN + "STARTED";
    public static final String STOPPING = MainActivity.DOMAIN + "STOPPING";
    public static final String FENCE_CROSSED = MainActivity.DOMAIN + "FENCE_CROSSED";
    public static final String HOME_CHANGED = MainActivity.DOMAIN + "HOME_CHANGED";

    // Worker thread
    private TrackingThread mThread;

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
     * Start (or restart) the service. The only thing we do is to start the thread that listens for
     * broadcast messages.
     *
     * @param intent action should always be "START"
     */
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (mThread != null)
            mThread.interrupt();

        Log.d(TAG, intent.getAction());

        // Start the service thread, if necessary
        mThread = new TrackingThread(this);
        mThread.start();

        // If we get killed after returning from here, restart
        return START_STICKY;
    }

    /**
     * Stop the service.
     *
     * @param intent action should always be "STOP"
     */
    @Override
    public boolean stopService(Intent intent) {
        Log.d(TAG, intent.getAction());
        mThread.interrupt();
        mThread = null;
        return super.stopService(intent);
    }

    /**
     * Called when the service is destroyed
     */
    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy");
        mThread.interrupt();
        mThread = null;
    }
}
