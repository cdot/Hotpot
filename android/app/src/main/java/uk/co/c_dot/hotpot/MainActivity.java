/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

// Generic java
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.StrictMode;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.Toast;

import com.google.android.gms.maps.CameraUpdate;
import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.SupportMapFragment;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import java.text.DateFormat;
import java.util.Date;

// Android app
// Google API client. used for location and maps

public class MainActivity extends AppCompatActivity
        implements OnMapReadyCallback, Messenger.MessageHandler {

    private static final String TAG = "HOTPOT/MainActivity";

    private LatLng mHomePos = null, mLastPos = null;

    // Messenger used to broadcast comms between this activity and the location service
    private Messenger mMessenger;

    // API objects
    private GoogleMap mMap = null;

    // Current location marker
    private Marker mMobileMarker, mHomeMarker;

    // Options menu
    private Menu mOptionsMenu = null;

    private boolean mServicePaused = false;

    /**
     * Called when we are sure we have all requisite permissions
     */
    private void startLocationService() {
        Intent intent = new Intent(this, LocationService.class);
        intent.setAction(LocationService.INITIALISE);
        startService(intent);
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
            Toast.makeText(this, "Permission Denied", Toast.LENGTH_SHORT).show();
        }
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
        mLastPos = curPos;

        mMap.moveCamera(cam);
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
            case R.id.action_pause_resume:
                if (mServicePaused)
                    startLocationService();
                else
                    mMessenger.broadcast(LocationService.STOP);
                mServicePaused = !mServicePaused;
                if (mOptionsMenu != null)
                    mOptionsMenu.findItem(R.id.action_pause_resume).setIcon(
                            mServicePaused ? R.drawable.ic_media_play : R.drawable.ic_media_pause);

                return true;
            case R.id.action_quit:
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
        mOptionsMenu = menu;
        getMenuInflater().inflate(R.menu.toolbar_menu, menu);
        return true;
    }

    /**
     * Handle a broadcast from the location Service
     * @param intent the intent behind the broadcast
     */
    public void handleMessage(Intent intent) {
        switch (intent.getAction()) {
            case LocationService.HOME_CHANGED:
                mHomePos = new LatLng(intent.getDoubleExtra("ARG1", 0),
                        intent.getDoubleExtra("ARG2", 0));
                break;
            case LocationService.LOCATION_CHANGED:
                updateMap(new LatLng(intent.getDoubleExtra("ARG1", 0),
                        intent.getDoubleExtra("ARG2", 0)));
                break;
        }
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

        mMessenger = new Messenger(this, new String[]{
                LocationService.HOME_CHANGED,
                LocationService.LOCATION_CHANGED}, this);

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

        mMap = null;
        mMobileMarker = null;

        // SMELL: move networking activity to a thread
        StrictMode.ThreadPolicy policy = new StrictMode.ThreadPolicy.Builder().permitAll().build();
        StrictMode.setThreadPolicy(policy);

        // Add the Toolbar
        Toolbar toolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        // Obtain the SupportMapFragment and get notified when the map
        // is ready to be used.
        SupportMapFragment mapFragment =
                (SupportMapFragment) getSupportFragmentManager()
                        .findFragmentById(R.id.map);
        mapFragment.getMapAsync(this);
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
        // "stop" just means we navigated away. We want to keep sending updates
        //if (mApiClient != null)
        //    mApiClient.disconnect();
        super.onStop();
    }

    // Implements OnMapReadyCallback
    @Override
    public void onMapReady(GoogleMap googleMap) {
        Log.d(TAG, "onMapReady");
        mMap = googleMap;
    }

}
