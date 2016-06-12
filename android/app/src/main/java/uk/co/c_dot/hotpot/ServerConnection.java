/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.util.Base64;
import android.util.Log;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.security.KeyManagementException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.Certificate;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * A connection to a server identified by a URL. Current supports GET requests and SSL.
 */
public class ServerConnection {

    private static String TAG = "HOTPOT/ServerConnection";

    private URL mURL = null;
    private KeyStore mKeyStore = null;
    private SSLContext mSSLContext = null;
    List<String> mCertificates = null;

    /**
     * Create a new server connection to the given URL with the given SSL certificates (only used
     * if the protocol is https)
     *
     * @param url   server URL
     * @param certs base 64 encoded SSL certificates
     * @throws MalformedURLException if the URL is bad
     * @throws KeyStoreException     if there's a problem loading the certificates
     */
    public ServerConnection(String url, List<String> certs)
            throws MalformedURLException, KeyStoreException {
        mURL = new URL(url);
        mCertificates = certs;
        if (mURL.getProtocol().equals("https")) {
            loadKeyStore(certs);
            mSSLContext = null; // to force reload
        }
    }

    /**
     * Create a new server connection to the given trusted URL, and, if the protocol is https,
     * fetch certificates from the remote server, loading them into the connection. Note that
     * this constructor must only be used with an absolutely trusted URL - for example, when
     * first defining the parameters of a connection that will subsequently be opened using
     * cached certificates.
     *
     * @param url URL of trusted server
     * @throws MalformedURLException if the URL is bad, or the server didn't pass any certificates
     */
    public ServerConnection(String url) throws MalformedURLException {
        mURL = new URL(url);
        mCertificates = null;
        if (mURL.getProtocol().equals("https")) {
            try {
                List<String> certs = fetchCertificates();
                loadKeyStore(certs);
            } catch (KeyStoreException kse) {
                // We don't treat this as an error, we just assume the server had no useable
                // certificates to offer us
                Log.d(TAG, "Failure fetching certificates: " + kse);
            }
        }
    }

    /**
     * Is the connection secure
     *
     * @return true if this is an SSL connection
     */
    public boolean isSSL() {
        return mURL.getProtocol().equals("https");
    }

     /**
     * Get the certificates trusted for use with the connection
     *
     * @return a set of base 64 encoded certificates
     */
    public List<String> getCertificates() {
        return mCertificates;
    }

    /**
     * Load the key store from a set of certificates sorted in a string set.
     *
     * @param certs base 64 encoded certificates
     * @throws KeyStoreException if anything goes wrong
     */
    private void loadKeyStore(List<String> certs) throws KeyStoreException {
        Log.d(TAG, "Loading key store");
        mCertificates = new ArrayList<>();
        try {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            // Create a KeyStore containing our trusted CAs
            String keyStoreType = KeyStore.getDefaultType();
            mKeyStore = KeyStore.getInstance(keyStoreType);
            try {
                mKeyStore.load(null, null);
            } catch (NoSuchAlgorithmException nsa) {
                throw new KeyStoreException(nsa.getMessage());
            }
            if (certs != null) {
                for (String b64_cert : certs) {
                    Log.d(TAG, "Loading cert" + b64_cert);
                    InputStream caInput = new ByteArrayInputStream(
                            Base64.decode(b64_cert, Base64.DEFAULT));
                    try {
                        Certificate ca = cf.generateCertificate(caInput);
                        Log.d(TAG, "trusted certificate ca="
                                + ((X509Certificate) ca).getSubjectDN());
                        mKeyStore.setCertificateEntry("ca", ca);
                        mCertificates.add(b64_cert);
                    } finally {
                        caInput.close();
                    }
                }
            }
        } catch (IOException ioe) {
            throw new KeyStoreException("IO exception " + ioe.getMessage());
        } catch (CertificateException ce) {
            throw new KeyStoreException("Certificate exception " + ce.getMessage());
        }
    }

    private SSLContext getContext() throws IOException {
        if (mSSLContext == null) {
            try {
                String algorithm = TrustManagerFactory.getDefaultAlgorithm();
                TrustManagerFactory tmf = TrustManagerFactory.getInstance(algorithm);
                tmf.init(mKeyStore);
                mSSLContext = SSLContext.getInstance("TLS");
                mSSLContext.init(null, tmf.getTrustManagers(), null);
            } catch (KeyStoreException | NoSuchAlgorithmException | KeyManagementException e) {
                throw new IOException(e);
            }
        }
        return mSSLContext;
    }

    /**
     * Because the server is using a self-signed certificate, we override the hostname
     * verification check to allow SSL to work.
     */
    private static class UnselectiveHostnameVerifier implements HostnameVerifier {
        public boolean verify(String hostname, SSLSession s) {
            //Log.d(TAG, "Verify hostname " + hostname);
            return true;
        }
    }

    /**
     * Fetch the certificates that an HTTPS server uses to sign it's comms. This uses an
     * empty TrustManager implementation, so must only be used under strict conditions
     * e.g. when setting up preferences.
     */
    private List<String> fetchCertificates() throws KeyStoreException {
        SSLContext sslCtx; // temporary, while we are fetching the certificates
        List<String> certs = new ArrayList<>();

        try {
            sslCtx = SSLContext.getInstance("TLS");

            sslCtx.init(null, new TrustManager[]{new X509TrustManager() {

                private X509Certificate[] accepted;

                @Override
                public void checkClientTrusted(X509Certificate[] xcs, String string)
                        throws CertificateException {
                }

                @Override
                public void checkServerTrusted(X509Certificate[] xcs, String string)
                        throws CertificateException {
                    accepted = xcs;
                }

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return accepted;
                }
            }}, null);
        } catch (NoSuchAlgorithmException nsae) {
            throw new KeyStoreException("No such algorithm: " + nsae.getMessage());
        } catch (KeyManagementException kme) {
            throw new KeyStoreException("Key management: " + kme.getMessage());
        }
        try {
            HttpsURLConnection connection = (HttpsURLConnection) mURL.openConnection();

            connection.setHostnameVerifier(new UnselectiveHostnameVerifier());
            connection.setSSLSocketFactory(sslCtx.getSocketFactory());

            if (connection.getResponseCode() == 200) {
                for (Certificate c : connection.getServerCertificates()) {
                    String s = Base64.encodeToString(c.getEncoded(), Base64.DEFAULT);
                    Log.d(TAG, "CERT=" + c.toString() + "=" + s);
                    certs.add(s);
                }
            }
            connection.disconnect();
        } catch (CertificateEncodingException cee) {
            throw new KeyStoreException("Certificate encoding: " + cee.getMessage());
        } catch (IOException ioe) {
            throw new KeyStoreException("IO exception: " + ioe.getMessage());
        }
        return certs;
    }

    /**
     * Connect to the given using the appropriate protocol
     */
    private HttpURLConnection connect(URL url) throws IOException {
        if (url.getProtocol().equals("https")) {
            try {
                HttpsURLConnection connection
                        = (HttpsURLConnection) url.openConnection();
                connection.setHostnameVerifier(new UnselectiveHostnameVerifier());
                SSLContext context = getContext();
                connection.setSSLSocketFactory(context.getSocketFactory());
                return connection;
            } catch (UnknownHostException uhe) {
                throw new IOException(uhe);
            }
        } else {
            return (HttpURLConnection) url.openConnection();
        }
    }

    /**
     * Send a GET to the server
     *
     * @param path   additional path to add to the URL e.g. "/mobile"
     * @param params map of parameter names to values
     * @return the result of the GET
     */
    public String GET(String path, Map<String, String> params) throws IOException {

        // Build a new URL with parameters encoded
        String sURL = mURL.toString();
        if (path != null)
            sURL += path;
        String sep = "?";
        for (String key : params.keySet()) {
            sURL += sep + URLEncoder.encode(key, "UTF-8") + "="
                    + URLEncoder.encode(params.get(key), "UTF-8");
            sep = "&";
        }

        // Open the connection
        HttpURLConnection connection = connect(new URL(sURL));

        // Read the reply
        String reply = null;
        try {
            InputStream in = new BufferedInputStream(connection.getInputStream());
            ByteArrayOutputStream result = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int length;
            while ((length = in.read(buffer)) != -1)
                result.write(buffer, 0, length);

            reply = result.toString("UTF-8");
        } finally {
            connection.disconnect();
        }
        return reply;
    }
}