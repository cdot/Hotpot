package uk.co.c_dot.hotpot;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.io.UnsupportedEncodingException;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.security.KeyManagementException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.text.DateFormat;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

import android.location.Location;
import android.os.Bundle;
import android.os.StrictMode;
import android.support.v4.app.FragmentActivity;
import android.util.Log;

import android.widget.Toast;

import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.maps.CameraUpdate;
import com.google.android.gms.maps.CameraUpdateFactory;
import com.google.android.gms.common.api.GoogleApiClient;
import com.google.android.gms.common.api.GoogleApiClient.ConnectionCallbacks;
import com.google.android.gms.common.api.GoogleApiClient.OnConnectionFailedListener;

import com.google.android.gms.location.LocationListener;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;

import com.google.android.gms.maps.GoogleMap;
import com.google.android.gms.maps.OnMapReadyCallback;
import com.google.android.gms.maps.SupportMapFragment;
import com.google.android.gms.maps.model.LatLng;
import com.google.android.gms.maps.model.Marker;
import com.google.android.gms.maps.model.MarkerOptions;

import android.Manifest;
import android.content.pm.PackageManager;
import android.support.v4.content.ContextCompat;
import android.support.v4.app.ActivityCompat;
import android.provider.Settings;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

public class Hotpot
    extends FragmentActivity
    implements ConnectionCallbacks, OnConnectionFailedListener,
               LocationListener,
               OnMapReadyCallback {

    protected static final String TAG = "HOTPOT";

    public static final long UPDATE_INTERVAL_IN_MS = 5000;
    public static final long FASTEST_UPDATE_INTERVAL_IN_MS =
            UPDATE_INTERVAL_IN_MS / 2;

    // ANDROID_ID of the device
    private String mAndroidId;
    // Server URL
    private static final String HOTPOT_URL =  "http://192.168.1.12:13196/";
    // Radius of the earth, for haversine
    private static final double EARTH_RADIUS = 6371000;

    // API objects
    protected GoogleApiClient mGoogleApiClient;
    private GoogleMap mMap;
    protected LocationRequest mLocationRequest;

    // Current location marker
    private Marker mMarker;

    // Server home location
    private LatLng home = null;

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
     * use the server response to set it.
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
                // Reply is the location of the server
                if (home == null) {
                    Pattern re = Pattern.compile("\\{\"(.*?)\":(.*?),\"(.*?)\":(.*?)\\}");
                    Matcher m = re.matcher(reply);
                    if (m.matches()) {
                        int latitude = 4, longitude = 2;
                        if (m.group(1).equals("latitude")) {
                            latitude = 2;
                            longitude = 4;
                        }
                        home = new LatLng(Double.parseDouble(m.group(latitude)),
                                Double.parseDouble(m.group(longitude)));
                        Log.i(TAG, "HOME is at " + home);
                    } else
                        Log.i(TAG, "Could not parse home location from " + reply);
                }
            } finally {
                connection.disconnect();
            }
        } catch (IOException ioe) {
            Log.i(TAG, "Problem sending update " + this.getStackTrace(ioe));
        }
    }

    /**
     * Create our location request object (can't be done until permissions are confirmed)
     * and start listening for location updates.
     */
    private void createLocationRequest() {
        mLocationRequest = new LocationRequest();
        mLocationRequest.setInterval(UPDATE_INTERVAL_IN_MS);
        mLocationRequest.setFastestInterval(FASTEST_UPDATE_INTERVAL_IN_MS);
        mLocationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);
        startListening();
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
     */
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 123
                && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "Permission Granted", Toast.LENGTH_SHORT).show();
            createLocationRequest();
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

        double d = EARTH_RADIUS * c;

        return d;
    }

    /**
     * Callback for a location event. Implements LocationListener
     */
    @Override
    public void onLocationChanged(Location location) {
        Log.d(TAG, "onLocationChanged " + location);
        if (location == null || mMap == null)
            return;
        LatLng curPos = new LatLng(location.getLatitude(),
                location.getLongitude()), oldPos;
        boolean firstLocation = false;
        if (mMarker == null) {
            mMarker = mMap.addMarker(new MarkerOptions()
                    //.draggable(false)
                    .position(curPos)
                    .flat(true));
            oldPos = curPos;
            firstLocation = true;
        } else
            oldPos = mMarker.getPosition();

        double dist = haversine(oldPos, curPos);

        // If within 20m of the old position, and not our first time, then not moving, Do no more
        if (dist < 20 && !firstLocation && home != null) {
            Log.i(TAG, "Not sending location update, not moved");
            mMarker.setRotation(0);
            return;
        }

        double latDiff = curPos.latitude - oldPos.latitude;
        double longDiff = curPos.longitude - oldPos.longitude;
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

        mMarker.setRotation((float) rotation);
        mMarker.setPosition(curPos);

        CameraUpdate cam;
        if (firstLocation)
            cam = CameraUpdateFactory.newLatLngZoom(curPos, 12);
        else
            cam = CameraUpdateFactory.newLatLng(curPos);
        mMap.moveCamera(cam);

        mMarker.setTitle(DateFormat.getTimeInstance().format(new Date()));

        sendUpdate(curPos);
    }

    /**
     * Start listening to location events
     * @throws SecurityException
     */
    public void startListening() throws SecurityException {
        Log.d(TAG, "startListening");
        if (mLocationRequest != null)
            LocationServices
                .FusedLocationApi
                .requestLocationUpdates(mGoogleApiClient, mLocationRequest, this);
    }

    /**
     * Stop listening to location events
     */
    public void stopListening() {
        Log.d(TAG, "stopListening");
        LocationServices
                .FusedLocationApi
                .removeLocationUpdates(mGoogleApiClient, this);
    }

    /**
     * Implements LocationListener
     * Called when the GPS provider is turned off (user turning off the GPS on the phone)
     * */
    public void onProviderDisabled(String provider) {
        Log.d(TAG, "onProviderDisabled " + provider);
    }

    /**
     * Implements LocationListener
     * Called when the GPS provider is turned on (user turning on the GPS on the phone)
     */
    public void onProviderEnabled(String provider) {
        Log.d(TAG, "onProviderEnabled " + provider);
    }

    /**
     * Implements LocationListener
     * Called when the status of the GPS provider changes
     * @param provider
     * @param status one of android.location.LocationProvider.OUT_OF_SERVICE
     * android.location.LocationProvider.TEMPORARILY_UNAVAILABLE
     * android.location.LocationProvider.AVAILABLE
     * @param extras
     */
    public void onStatusChanged(String provider, int status, Bundle extras) {
        Log.d(TAG, "onStatusChanged " + provider + " " + status);
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
        mMarker = null;
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
        startListening();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onPause() {
        Log.d(TAG, "onPause");
        super.onPause();
        // Stop location updates to save battery
        // SMELL: probably want to keep them going, don't we? If they're
        // only every 15 minutes or so.....
        stopListening();
    }

    /**
     * See Android Activity Lifecycle
     * Overrides FragmentActivity
     */
    @Override
    protected void onStop() {
        Log.d(TAG, "onStop");
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
        // Check we have permission to create the location request
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED)
            createLocationRequest();
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
     */
    @Override
    public void onConnectionFailed(ConnectionResult result) {
        // Refer to the javadoc for ConnectionResult to see what error
        // codes might be returned in onConnectionFailed.
        Log.i(TAG, "onConnectionFailed: ConnectionResult.getErrorCode() = "
                + result.getErrorCode());
    }
}

