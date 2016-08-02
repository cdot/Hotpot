/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Bundle;
import android.os.StrictMode;

import android.preference.PreferenceManager;
import android.support.annotation.NonNull;
import android.support.v4.app.ActivityCompat;
import android.support.v4.content.ContextCompat;
import android.support.v7.app.AppCompatActivity;
import android.support.v7.widget.Toolbar;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.Toast;

import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.location.LocationListener;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.maps.CameraUpdate;
import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.SupportMapFragment;
import com.google.android.gms.maps.model.BitmapDescriptorFactory;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.LatLngBounds;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

/**
 * Hotpot main application.
 * <p/>
 * The Hotpot application is divided into two parts; there's this activity, which provides
 * the UI, and a PlaceService that does the actual work of finding the location and
 * communicating it to the server.
 */
public class MainActivity extends AppCompatActivity
        implements GoogleApiClient.ConnectionCallbacks,
        OnMapReadyCallback {

    private static final String TAG = "HOTPOT/MainActivity";

    // Constants used in preferences and intents
    public static final String DOMAIN = "uk.co.c_dot.hotpot.";

    private GoogleApiClient mApiClient;

    // Map
    private GoogleMap mMap = null;
    private LocationRequest mLocationRequest;
    private boolean mLocationListening = false;

    // Indices into following arrays
    private static int HOME = 0, CUR = 1, SENT = 2;
    // Locations
    private LatLng[] mPlace = new LatLng[]{null, null, null};
    private LatLng[] mLastPlace = new LatLng[]{null, null, null};
    // Map markers
    private Marker[] mMarker = new Marker[]{null, null, null};
    // Marker icons
    private static final int[] mMarkerIcon = new int[]{R.drawable.home, R.drawable.cur, R.drawable.sent};

    // Options menu
    private Menu mOptionsMenu = null;

    private boolean mLocationServiceRunning = false;
    private boolean mRequestingCH = false;
    private boolean mRequestingHW = false;

    private class BroadcastListener extends BroadcastReceiver {
        public void onReceive(Context context, Intent intent) {
            Log.d(TAG, "handle broadcast message " + intent.getAction());
            switch (intent.getAction()) {
                case PlaceService.HOME_CHANGED:
                    // The server has given a new home position
                    mPlace[HOME] = new LatLng(
                            intent.getDoubleExtra("LAT", 0),
                            intent.getDoubleExtra("LONG", 0));
                    updateMap();
                    break;
                case PlaceService.LOCATION_CHANGED:
                    // A new position has been sent to the server
                    mPlace[SENT] = new LatLng(intent.getDoubleExtra("LAT", 0),
                            intent.getDoubleExtra("LONG", 0));
                    updateMap();
                    break;
                case PlaceService.REQUEST:
                    int state = intent.getIntExtra("STATE", 0);
                    switch (intent.getStringExtra("WHAT")) {
                        case "HW":
                            mOptionsMenu.findItem(R.id.action_boost_HW).setChecked(state == 2);
                            break;
                        case "CH":
                            mOptionsMenu.findItem(R.id.action_boost_CH).setChecked(state == 2);
                            break;
                    }
                    break;
            }
        }
    }

    /**
     * Call only when we are sure we have all requisite permissions
     */
    private void startLocationService() {
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
        String url = prefs.getString(SettingsActivity.PREF_URL, null);
        if (url != null) {
            Intent intent = new Intent(this, PlaceService.class);
            intent.setAction(PlaceService.START);
            intent.putExtra("URL", url);
            Log.d(TAG, "Starting location service on " + intent.getStringExtra("URL"));
            startService(intent);
            mLocationServiceRunning = true;
        } else {
            // TODO: start the settings activity?
            Toast.makeText(this, "Cannot starting location service; URL not set",
                    Toast.LENGTH_LONG).show();
            mLocationServiceRunning = false;
        }
    }

    /**
     * Call to stop the service
     */
    private void stopLocationService() {
        Log.d(TAG, "Stopping location service");
        Intent intent = new Intent(this, PlaceService.class);
        intent.setAction(PlaceService.STOP);
        stopService(intent);
        mLocationServiceRunning = false;
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
            Toast.makeText(this, "Permission Denied", Toast.LENGTH_LONG).show();
        }
    }

    /**
     * Update the map
     */
    private void updateMap() {
        if (mMap == null)
            return; // map not ready yet

        LatLngBounds bounds = null;
        boolean adjust = false;
        for (int i = HOME; i <= SENT; i++) {
            Log.d(TAG, "Update " + i + " = " + mPlace[i]);
            if (mPlace[i] != null) {
                if (mMarker[i] == null) {
                    mMarker[i] = mMap.addMarker(new MarkerOptions().position(mPlace[i])
                            .icon(BitmapDescriptorFactory.fromResource(mMarkerIcon[i])));
                    adjust = true;
                } else if (mLastPlace[i] != null && !mPlace[i].equals(mLastPlace[i])) {
                    mMarker[i].setPosition(mPlace[i]);
                } else if (mLastPlace[i] == null)
                    adjust = true;
                bounds = (bounds == null) ? new LatLngBounds(mPlace[i], mPlace[i])
                        : bounds.including(mPlace[i]);
                mLastPlace[i] = mPlace[i];
            }
        }

        if (adjust) {
            CameraUpdate cam = CameraUpdateFactory.newLatLngBounds(bounds, 10);
            mMap.moveCamera(cam);
        }
    }

    /**
     * Action on the options menu
     *
     * @param item the selected item
     * @return true to consume the event
     */
    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        Intent intent;
        switch (item.getItemId()) {
            case R.id.action_settings:
                // User chose the "Settings" item, show the app settings UI...
                Intent i = new Intent(this, SettingsActivity.class);
                startActivity(i);
                return true;
            case R.id.action_pause_resume:
                if (mLocationServiceRunning)
                    stopLocationService();
                else
                    startLocationService();
                if (mOptionsMenu != null)
                    mOptionsMenu.findItem(R.id.action_pause_resume).setIcon(
                            mLocationServiceRunning ? R.drawable.ic_media_pause : R.drawable.ic_media_play);

                return true;
            case R.id.action_boost_CH:
                intent = new Intent(PlaceService.REQUEST);
                intent.putExtra("WHAT", "CH");
                intent.putExtra("STATE", mOptionsMenu.findItem(R.id.action_boost_CH).isChecked() ? 0 : 2);
                sendBroadcast(intent);
                return true;
            case R.id.action_boost_HW:
                intent = new Intent(PlaceService.REQUEST);
                intent.putExtra("WHAT", "HW");
                intent.putExtra("STATE", mOptionsMenu.findItem(R.id.action_boost_HW).isChecked() ? 0 : 2);
                Log.d(TAG, "Sending " + intent.getIntExtra("STATE", 0) + " " + mOptionsMenu.findItem(R.id.action_boost_HW).isChecked());
                sendBroadcast(intent);
                return true;
            case R.id.action_quit:
                stopLocationService();
                finish();
                return true;
            default:
                // If we got here, the user's action was not recognized.
                // Invoke the superclass to handle it.
                Log.e(TAG, "Unexpected options item selected " + item.getItemId());
                return super.onOptionsItemSelected(item);
        }
    }

    /**
     * Android developer tutorial for toolbar doesn't tell you about this, but without it the
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
     * See Android Activity lifecycle
     * Overrides FragmentActivity
     * Called when the fragment is created
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        Log.d(TAG, "onCreate called");

        IntentFilter intentFilter = new IntentFilter();
            intentFilter.addAction(PlaceService.HOME_CHANGED);
        intentFilter.addAction(PlaceService.LOCATION_CHANGED);
                intentFilter.addAction(PlaceService.REQUEST);
                        intentFilter.addAction(PlaceService.POSITION);
        registerReceiver(new BroadcastListener(), intentFilter);

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

        // SMELL: move networking activity to a thread
        StrictMode.ThreadPolicy policy = new StrictMode.ThreadPolicy.Builder().permitAll().build();
        StrictMode.setThreadPolicy(policy);

        // Add the Toolbar
        Toolbar toolbar = (Toolbar) findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        mApiClient = new GoogleApiClient.Builder(this)
                .addConnectionCallbacks(this)
                .addApi(LocationServices.API)
                .build();
        mApiClient.connect();
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
        startLocator();
        super.onResume();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStop() {
        Log.d(TAG, "onStop");
        stopLocator();
        super.onStop();
    }

    /**
     * Implements GoogleApiClient.ConnectionCallbacks
     *
     * @param connectionHint
     * @throws SecurityException
     */
    @Override
    public void onConnected(Bundle connectionHint) throws SecurityException {
        Log.d(TAG, "connected to API");

        // Obtain the SupportMapFragment and get notified when the map
        // is ready to be used.
        SupportMapFragment mapFragment =
                (SupportMapFragment) getSupportFragmentManager()
                        .findFragmentById(R.id.map);
        mapFragment.getMapAsync(this);
    }

    /**
     * Callback for when a Google API connection is suspended
     * Implements GoogleApiClient.ConnectionCallbacks
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

    private LocationListener mLocationListener = null;

    private void stopLocator() {
        if (mLocationListening) {
            Log.d(TAG, "Locator stopped");
            LocationServices.FusedLocationApi.removeLocationUpdates(mApiClient, mLocationListener);
        }
        mLocationListening = false;
    }

    private void startLocator() {
        if (mLocationListening)
            stopLocator();
        if (mApiClient == null || mLocationListener == null)
            return;

        try {
            LocationServices.FusedLocationApi.requestLocationUpdates(
                    mApiClient, mLocationRequest, mLocationListener);
            Log.d(TAG, "Locator started");
            mLocationListening = true;
        } catch (SecurityException se) {
            // Should never happen
        }
    }

    /**
     * Implements OnMapReadyCallback
     */
    @Override
    public void onMapReady(GoogleMap googleMap) {
        Log.d(TAG, "onMapReady");
        mMap = googleMap;
        mLocationRequest = LocationRequest.create();
        mLocationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        mLocationRequest.setSmallestDisplacement(100); // default 100 meters
        mLocationRequest.setInterval(5); // default 100 meters
        mLocationListener = new LocationListener() {
            public void onLocationChanged(Location location) {
                mPlace[CUR] = new LatLng(location.getLatitude(), location.getLongitude());
                Log.d(TAG, "Got new location " + mPlace[CUR]);
                updateMap();
            }
        };
        startLocator();
    }
}