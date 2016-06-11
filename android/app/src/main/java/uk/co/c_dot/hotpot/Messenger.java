/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.support.v4.content.LocalBroadcastManager;

import com.google.android.gms.maps.model.LatLng;

/**
 * Simplified interface to broadcasts used by service and app
 */
public class Messenger extends BroadcastReceiver {

    private static final String TAG = "HOTPOT/Messenger";

    /**
     * Interface for an incoming message handler
     */
    interface MessageHandler {
        void handleMessage(Intent intent);
    }

    private MessageHandler mHandler;
    private LocalBroadcastManager mBM;

    /**
     * Constructor
     * @param context the context this messenger works within
     * @param handles List of messages handled by this receiver
     * @param handler the received message handler
     */
    public Messenger(Context context, String[] handles, MessageHandler handler) {
        //Log.d(TAG, "Setting up " + TextUtils.join(" ", handles));
        mBM = LocalBroadcastManager.getInstance(context);

        mHandler = handler;

        IntentFilter intentFilter = new IntentFilter();
        for (String message : handles)
            intentFilter.addAction(message);

        mBM.registerReceiver(this, intentFilter);
    }

    /**
     * Handler for a received message
     *
     * @param context the context this messenger works within
     * @param intent  the message
     */
    @Override
    public void onReceive(Context context, Intent intent) {
        //Log.d(TAG, "Received " + intent.getAction());
        mHandler.handleMessage(intent);
    }

    /**
     * Send a simple message
     *
     * @param intent the message
     */
    public void broadcast(Intent intent) {
        //Log.d(TAG, "Sending " + intent.getAction());
        mBM.sendBroadcast(intent);
    }

    /**
     * Send a simple message
     *
     * @param message the message
     */
    public void broadcast(String message) {
        broadcast(new Intent(message));
    }

    /**
     * Send a message containing a LatLng in parameters
     *
     * @param message the message
     * @param pos     the location to send
     */
    public void broadcast(String message, LatLng pos) {
        Intent intent = new Intent(message);
        intent.putExtra("ARG1", pos.latitude);
        intent.putExtra("ARG2", pos.longitude);
        broadcast(intent);
    }
}
