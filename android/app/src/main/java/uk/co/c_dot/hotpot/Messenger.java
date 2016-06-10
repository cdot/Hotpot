package uk.co.c_dot.hotpot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.support.v4.content.LocalBroadcastManager;

import com.google.android.gms.maps.model.LatLng;

import java.util.ArrayList;

/**
 * Simplified interface to broadcast manager used by service and app
 */
public class Messenger extends BroadcastReceiver {

    public interface MessageHandler {
        public void handleMessage(Intent intent);
    }

    private MessageHandler mHandler;
    private LocalBroadcastManager mBM;
    private Context mContext;
    private Class mTarget;

    /**
     * Construct a message receiver using the given local broadcast manager.
     *
     * @param context  Context the messenger operates within
     * @param messages List of messages handled by this receiver
     */
    public Messenger(Context context, String[] messages,
                     MessageHandler actor, Class target) {
        mContext = context;
        mBM = LocalBroadcastManager.getInstance(context);

        mHandler = actor;
        mTarget = target;

        IntentFilter intentFilter = new IntentFilter();
        for (String message : messages)
            intentFilter.addAction(message);
        mBM.registerReceiver(this, intentFilter);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        mHandler.handleMessage(intent);
    }

    public Intent getNewIntent(String message) {
        Intent intent = new Intent(mContext, mTarget);
        intent.setAction(message);
        return intent;
    }

    public void broadcast(String message) {
        mBM.sendBroadcast(getNewIntent(message));
    }

    public void broadcast(String message, LatLng pos) {
        Intent intent = getNewIntent(message);
        intent.putExtra("ARG1", pos.latitude);
        intent.putExtra("ARG2", pos.longitude);
        mBM.sendBroadcast(intent);
    }

    public void broadcast(String message, ArrayList<String> s) {
        Intent intent = getNewIntent(message);
        intent.putStringArrayListExtra("ARG1", s);
        mBM.sendBroadcast(intent);
    }
}
