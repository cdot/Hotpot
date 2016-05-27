package uk.co.c_dot.hotpot;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Bundle;
import android.os.Handler;
import android.os.StrictMode;
import android.provider.Settings;
import android.support.v4.app.ActivityCompat;
import android.support.v4.app.FragmentActivity;
import android.support.v4.content.ContextCompat;
import android.util.Log;
import android.widget.Toast;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.common.api.GoogleApiClient.ConnectionCallbacks;
import com.google.android.gms.common.api.GoogleApiClient.OnConnectionFailedListener;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.maps.CameraUpdate;
import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.SupportMapFragment;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.DateFormat;
import java.util.Date;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class Hotpot
    extends FragmentActivity
    implements ConnectionCallbacks, OnConnectionFailedListener,
               OnMapReadyCallback {

    protected static final String TAG = "HOTPOT";

    public static final long UPDATE_INTERVAL = 5000; // ms

    // ANDROID_ID of the device
    private String mAndroidId;
    // Server URL. used for the API license
    private static final String HOTPOT_URL =  "http://192.168.1.12:13196/";

    // Radius of the earth, for haversine
    private static final double EARTH_RADIUS = 6371000; // metres

    // API objects
    protected GoogleApiClient mGoogleApiClient;
    private GoogleMap mMap;

    // Current location marker
    private Marker mMobileMarker, mHomeMarker;

    // Server home location
    private LatLng mHomePos = null, mLastPos = null;

    /*
    private KeyStore mKeyStore = null;
    private static final String HOTPOT_CERT =
            "-----BEGIN CERTIFICATE-----\n"
                    + "MIIDhDCCAmwCCQDe8utyPMkaozANBgkqhkiG9w0BAQsFADCBgzELMAkGA1UEBhMC\n"
                    + "R0IxETAPBgNVBAgMCENoZXNoaXJlMRAwDgYDVQQHDAdDaGVzdGVyMRowGAYDVQQK\n"
                    + "DBFDLURvdCBDb25zdWx0YW50czEUMBIGA1UEAwwLYy1kb3QuY28udWsxHTAbBgkq\n"
                    + "hkiG9w0BCQEWDnBpQGMtZG90LmNvLnVrMB4XDTE2MDQxMzEwMzE1OFoXDTE3MDQx\n"
                    + "MzEwMzE1OFowgYMxCzAJBgNVBAYTAkdCMREwDwYDVQQIDAhDaGVzaGlyZTEQMA4G\n"
                    + "A1UEBwwHQ2hlc3RlcjEaMBgGA1UECgwRQy1Eb3QgQ29uc3VsdGFudHMxFDASBgNV\n"
                    + "BAMMC2MtZG90LmNvLnVrMR0wGwYJKoZIhvcNAQkBFg5waUBjLWRvdC5jby51azCC\n"
                    + "ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOkf6a35YPNsj4lPwIu3D02S\n"
                    + "ZKUXiSJYmlATJPTP5VdAR/yvnX8N+vb9bRqB+ET/6zEmSuelAdaEW0xcKUfiyVPa\n"
                    + "+N+BnKsViP7+EQzJShis9dH/pfQMt7cZJIQoTsw2IQ43Q89JwnRq6NQSLWjqNfnt\n"
                    + "I2giqDqcBcYOrtvLS15GShP4fwaP1hnFlOaiwFCZcRnMtqwQ7PTb0yOXcUIRY007\n"
                    + "RGaHW39Z2skrWMh4p0I8SySc3mdRhku4bNCaunT5kaqBawaFaO1r73ikqIAyLL4L\n"
                    + "y6s4PJFwDDNdB1EXaQxOD2Du+NAZ0w9ZtX3mL0fbMGn0fFGfJhkrxFyKa4ab8nEC\n"
                    + "AwEAATANBgkqhkiG9w0BAQsFAAOCAQEAbJzZ4rM9qPlZd0dJYrYOGg/6qH/3JpGX\n"
                    + "M87jCSM3Cl9kxFykPtWD0bmJqJZIExEYhMXMTdWHEQqhHC0QjNsm9VMh1kjVwYyH\n"
                    + "q544HQUWaXYoijT7cs02d2FpCxx433ze81laDgbCZeD73GEJXVAcJR+zBC7fVyET\n"
                    + "vRPe3UazYG0O7Nyc/RxkcQiTeD/rLKfhARwtnflBUdzMXmSzrMjy7mN6PIu+y1OQ\n"
                    + "/K8fIBBrCtwZCPsAVAIZw7UL5OpYsA04OSp/5KM2x9a3AFz8S5lfmhm9B9FPlR+u\n"
                    + "oAAgKWNSeXgQgQJisrYHKhKF3XnCDe+Jp2473+O/I6EBJ1BjBKggpw==\n"
                    + "-----END CERTIFICATE-----\n";

    private KeyStore loadKeyStore() {
        KeyStore keyStore = null;
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            InputStream caInput = new ByteArrayInputStream(HOTPOT_CERT.getBytes("UTF-8"));
            Certificate ca;
            try {
                ca = cf.generateCertificate(caInput);
                System.out.println("ca=" + ((X509Certificate) ca).getSubjectDN());
            } finally {
                caInput.close();
            }
            // Create a KeyStore containing our trusted CAs
            String keyStoreType = KeyStore.getDefaultType();
            keyStore = KeyStore.getInstance(keyStoreType);
            keyStore.load(null, null);
            keyStore.setCertificateEntry("ca", ca);
        } catch (CertificateException ce) {
            Log.i(TAG, "LKS CE " + ce);
        } catch (IOException ioe) {
            Log.i(TAG, "LKS IOE " + ioe);
        } catch (NoSuchAlgorithmException nsa) {
            Log.i(TAG, "LKS NSA " + nsa);
        } catch (KeyStoreException kse) {
            Log.i(TAG, "LKS KSE " + kse);
        }
        return keyStore;
    }

    private SSLContext setupSSL() {
        KeyStore keyStore = loadKeyStore();
        SSLContext context = null;
        try {
            String algorithm = TrustManagerFactory.getDefaultAlgorithm();
            TrustManagerFactory tmf = TrustManagerFactory.getInstance(algorithm);
            tmf.init(keyStore);
            context = SSLContext.getInstance("TLS");
            context.init(null, tmf.getTrustManagers(), null);
        } catch (KeyStoreException kse) {
            Log.i(TAG, "SUN KSE " + kse);
        } catch (NoSuchAlgorithmException nsa) {
            Log.i(TAG, "SUN NSA " + nsa);
        } catch (KeyManagementException kme) {
            Log.i(TAG, "SUN KME " + kme);
        }
        return context;
    }

    private SSLContext mSSLContext = null;
    */

    /**
     * Debugging, convert stack trace to a string for logging
     * @param e exception to analyse
     * @return string of stack trace
     */
    private String getStackTrace(Exception e) {
        StringWriter writer = new StringWriter();
        PrintWriter printWriter = new PrintWriter( writer );
        e.printStackTrace(printWriter);
        printWriter.flush();
        return writer.toString();
    }

    /**
     * Send a location update to the server. If the home location hasn't been set already,
     * use the server response to set it. Schedules the next update.
     * @param loc new location
     */
    private void sendUpdate(LatLng loc) {
        /*    if (mSSLContext == null)
            mSSLContext = setupSSL();*/

        Log.i(TAG, "Sending location update");
        try {
            URL url = new URL(HOTPOT_URL
                              + "?latitude=" + loc.latitude
                              + "&longitude=" + loc.longitude
                              + "&device=" + mAndroidId);
            //HTTPS HttpsURLConnection urlConnection = (HttpsURLConnection) url.openConnection();
            HttpURLConnection connection =
                (HttpURLConnection) url.openConnection();
            try {
                //HTTPS urlConnection.setSSLSocketFactory(mSSLContext.getSocketFactory());
                InputStream in = new BufferedInputStream(connection.getInputStream());
                ByteArrayOutputStream result = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                int length;
                while ((length = in.read(buffer)) != -1) {
                    result.write(buffer, 0, length);
                }
                String reply = result.toString("UTF-8");
                // Reply includes:
                // latitude, longitude (location of the server)
                // next_update (earliest time to send the next update, in epoch seconds)
                Pattern re = Pattern.compile("\"(.*?)\":(.*?)[,}]");
                Matcher m = re.matcher(reply);
                double latitude = 0, longitude = 0;
                long next_update = 0;
                while (m.find()) {
                    String key = m.group(1);
                    String value = m.group(2);
                    switch (key) {
                        case "home_lat":
                            latitude = Double.parseDouble(value);
                            break;
                        case "home_long":
                            longitude = Double.parseDouble(value);
                            break;
                        case "interval":
                            next_update = (long) (Double.parseDouble(value) * 1000);
                            break;
                        default:
                            Log.i(TAG, "Bad reply from server " + reply);
                    }
                }
                if (mHomePos == null) {
                    mHomePos = new LatLng(latitude, longitude);
                    Log.i(TAG, "HOME is at " + mHomePos);
                }
                if (next_update < UPDATE_INTERVAL)
                    next_update = UPDATE_INTERVAL;
                getNextLocationAfter(next_update);
            } finally {
                connection.disconnect();
            }
        } catch (IOException ioe) {
            Log.i(TAG, "Problem sending update " + ioe.getMessage());// + this.getStackTrace(ioe));
            getNextLocationAfter(UPDATE_INTERVAL);
        }
    }

    /**
     * Scheduler for location updates
     */
    private Handler handler = new Handler();

    private class WakeUp implements Runnable {
        public boolean ignore = false;

        @Override
        public void run() {
            Log.i(TAG, "Woken");
            if (!ignore)
                onLocationChanged();
        }
    }

    private WakeUp wakeUp = new WakeUp();

    /**
     * Schedules a location update for some time in the future
     *
     * @param update time in ms to wait before the update
     */
    private void getNextLocationAfter(long update) {
        wakeUp.ignore = false;
        Log.i(TAG, "Next update in " + (update / 1000) + "s");
        handler.postDelayed(wakeUp, update);
    }

    /**
     * Stop listening for location updates
     */
    private void stopListening() {
        wakeUp.ignore = true;
    }

    /**
     * Seek permission to access location
     */
    private void requestLocationPermission() {
        ActivityCompat.requestPermissions(this, new String[]{
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.INTERNET
            }, 123);
    }

    /**
     * Callback for permissions request. Overrides FragmentActivity
     * @param requestCode code set in the request
     * @param permissions permissions asked for
     * @param grantResults dunno
     */
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 123
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Permission Granted", Toast.LENGTH_SHORT).show();
            getNextLocationAfter(UPDATE_INTERVAL);
        } else {
            Toast.makeText(this, "Permission Denied", Toast.LENGTH_SHORT).show();
        }
    }

    /**
     * Return the crow-flies distance between two locations,
     * each specified by lat and long.
     * @param p1 LatLng of first point
     * @param p2 LatLng of second point
     * @return distance in metres
     */
    private double haversine(LatLng p1, LatLng p2) {
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

        mMap.moveCamera(cam);
    }

    /**
     * Callback for a location event. Implements LocationListener
     */
    public void onLocationChanged() {
        Location location;
        try {
            location = LocationServices.FusedLocationApi.getLastLocation(mGoogleApiClient);
        } catch (SecurityException se) {
            Log.d(TAG, "onLocationChanged failed " + se.getMessage());
            getNextLocationAfter(UPDATE_INTERVAL);
            return;
        }
        Log.d(TAG, "onLocationChanged " + location);
        if (location == null || mMap == null) {
            getNextLocationAfter(UPDATE_INTERVAL);
            return;
        }
        LatLng curPos = new LatLng(location.getLatitude(),
                location.getLongitude());

        if (mLastPos != null) {
            double dist = haversine(mLastPos, curPos);

            // If within 20m of the old position, then not moving, Do no more
            if (dist < 20 && mHomePos != null) {
                Log.i(TAG, "Not sending location update, not moved enough: " + dist + "m");
                getNextLocationAfter(UPDATE_INTERVAL);
                return;
            }
        }

        updateMap(curPos);

        mLastPos = curPos;
        sendUpdate(curPos);
    }

    /**
     * See Android Activity lifecycle
     * Overrides FragmentActivity
     * Called when the fragment is created
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_maps);

        mMap = null;
        mMobileMarker = null;
        mAndroidId = Settings.Secure
            .getString(getContentResolver(), Settings.Secure.ANDROID_ID);

        // SMELL: move networking activity to a thread
        StrictMode.ThreadPolicy policy = new StrictMode.ThreadPolicy.Builder().permitAll().build();
        StrictMode.setThreadPolicy(policy);


        mGoogleApiClient = new GoogleApiClient.Builder(this)
                .addConnectionCallbacks(this)
                .addOnConnectionFailedListener(this)
                .addApi(LocationServices.API)
                .build();

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
        mGoogleApiClient.connect();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    public void onResume() {
        Log.d(TAG, "onResume");
        super.onResume();
        getNextLocationAfter(UPDATE_INTERVAL);
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStop() {
        Log.d(TAG, "onStop");
        stopListening();
        mGoogleApiClient.disconnect();
        super.onStop();
    }

    // Implements OnMapReadyCallback
    @Override
    public void onMapReady(GoogleMap googleMap) {
        Log.d(TAG, "onMapReady");
        mMap = googleMap;
    }

    /**
     * Callback for when an API connection is suspended
     * Implements ConnectionCallbacks
     */
    @Override
    public void onConnected(Bundle connectionHint) throws SecurityException {
        Log.d(TAG, "onConnected");
        // Check we have permission to get the location
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED)
            getNextLocationAfter(UPDATE_INTERVAL);
        else // if not, request it
            requestLocationPermission();        Log.d(TAG, "Constructed location listener");
    }

    /**
     * Callback for when an API connection is suspended
     * Implements ConnectionCallbacks
     * */
    @Override
    public void onConnectionSuspended(int cause) {
        // The connection to Google Play services was lost for some
        // reason. We call connect() to attempt to re-establish the
        // connection.
        Log.d(TAG, "onConnectionSuspended");
        mGoogleApiClient.connect();
    }

    /**
     * Callback for when an API connection fails
     * Implements OnConnectionFailedListener
     * @param result carrier for error code
     */
    @Override
    public void onConnectionFailed(ConnectionResult result) {
        // Refer to the javadoc for ConnectionResult to see what error
        // codes might be returned in onConnectionFailed.
        Log.i(TAG, "onConnectionFailed: ConnectionResult.getErrorCode() = "
                + result.getErrorCode());
    }
}

