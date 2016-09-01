/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.os.Looper;
import android.util.Base64;
import android.util.JsonReader;
import android.util.JsonToken;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;
import org.xmlpull.v1.XmlPullParserException;
import org.xmlpull.v1.XmlPullParserFactory;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.StringReader;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.net.UnknownHostException;
import java.nio.charset.Charset;
import java.security.KeyManagementException;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.Certificate;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.HashSet;
import java.util.Set;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;

/**
 * A connection to a server identified by a URL. Only supports POST requests with JSON responses.
 * Supports (optional) SSL with untrusted certificates (does not check hosts or certificates)
 * <p/>
 * When used in SSL mode this class makes some assumptions that are inherently insecure in order
 * to work with self-signed certificates. Specifically, the default hostname verification is
 * suspended, and it trusts arbitrary certificates (does not require certificates to be signed
 * by a trusted authority). This is acceptable for our application because the priority is that
 * traffic is encoded, not that it comes from a trusted source (i.e. only the key is actually
 * used, the cert is ignored.).
 */
public class ServerConnection {

    private static String TAG = "HOTPOT/ServerConnection";

    /**
     * Handler for a POST response
     */
    public interface ResponseHandler {
        /**
         * Called with the Object read from the response.
         *
         * @param jr the object read from the response
         */
        void done(Object jr);

        /**
         * Called if an error occurs while reading the response. The exception will be an
         * IOException or a JSONException.
         *
         * @param e error exception
         */
        void error(Exception e);
    }

    /**
     * Base URL for the server. Different requests are sent by varying the path and params.
     */
    private URL mURL = null;

    /**
     * SSL keystore, if this is an SSL connection.
     */
    private KeyStore mKeyStore = null;

    /**
     * Only used if this is an SSL connection
     */
    private SSLContext mSSLContext = null;

    /**
     * Only used if this is an SSL connection. These are the certificates to be used with the
     * connection..
     */
    Set<Certificate> mCertificates = null;

    /**
     * Create a new server connection to the given URL with the given SSL certificates.
     * Does not resolve redirects.
     *
     * @param url   server URL
     * @param certs base 64 encoded SSL certificates
     * @throws MalformedURLException if the URL is bad
     * @throws KeyStoreException     if there's a problem loading the certificates
     */
    public ServerConnection(String url, Set<Certificate> certs)
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
     * first defining the parameters of a connection that will subsequently be used with
     * cached certificates. Automatically resolves any single level of redirect.
     *
     * @param url URL of trusted server
     * @throws MalformedURLException if the URL is bad, or the server didn't pass any certificates
     */
    public ServerConnection(String url) throws MalformedURLException {
        mURL = new URL(url);
        mCertificates = null;
        // TODO: handle authentication
        Log.d(TAG, "Create server connection on " + mURL);
        // Follow any redirect, either 30x status or HTML REFRESH
        followRedirect();
        if (mURL.getProtocol().equals("https")) {
            try {
                Set<Certificate> certs = fetchCertificates();
                loadKeyStore(certs);
            } catch (KeyStoreException kse) {
                // We don't treat this as an error, we just assume the server had no useable
                // certificates to offer us
                Log.d(TAG, "Failure fetching certificates: " + kse);
            }
        }
    }

    /**
     * Is the connection encrypted?
     *
     * @return true if this is an SSL connection
     */
    public boolean isSSL() {
        return mURL.getProtocol().equals("https");
    }

    /**
     * Get the connected URL
     */
    public URL getUrl() {
        return mURL;
    }

    /**
     * Get the certificates trusted for use with the connection. These are either certificates
     * presented when the object is set up, or those gleaned from the server.
     *
     * @return a set of base 64 encoded certificates
     */
    public Set<Certificate> getCertificates() {
        return mCertificates;
    }

    /**
     * Load the key store from a set of certificates sorted in a string set.
     *
     * @param certs base 64 encoded certificates
     * @throws KeyStoreException if anything goes wrong
     */
    private void loadKeyStore(Set<Certificate> certs) throws KeyStoreException {
        Log.d(TAG, "Loading key store");
        mCertificates = new HashSet<>();
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
                int count = 0;
                for (Certificate ca : certs) {
                       Log.d(TAG, "Loading trusted certificate "
                                + ((X509Certificate) ca).getSubjectDN());
                        mKeyStore.setCertificateEntry("ca", ca);
                        mCertificates.add(ca);
                        count++;
                }
                Log.d(TAG, "Keystore loaded with " + count + " certificates");
            } else {
                Log.d(TAG, "No certs to load");
            }
        } catch (IOException ioe) {
            throw new KeyStoreException("IO exception " + ioe.getMessage());
        } catch (CertificateException ce) {
            throw new KeyStoreException("Certificate exception " + ce.getMessage());
        }
    }

    /**
     * Get the SSL context.This is a method because we need to be able to reset the context
     * after loading the keysotre from certificates returned by the server.
     *
     * @return the SSL context
     * @throws IOException if there's a problem with the keys or the key store
     */
    private SSLContext getContext() throws IOException {
        if (mSSLContext == null) {
            try {
                String algorithm = TrustManagerFactory.getDefaultAlgorithm();
                TrustManagerFactory tmf = TrustManagerFactory.getInstance(algorithm);
                tmf.init(mKeyStore);
                mSSLContext = SSLContext.getInstance("TLS");
                mSSLContext.init(null, tmf.getTrustManagers(), null);
            } catch (KeyStoreException | NoSuchAlgorithmException | KeyManagementException e) {
                // Should never happen
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
        /**
         * Android studio doesn't like this, but we need to do it for our unknown hostname.
         * We could be really anal, and insist that the hostname in the certificate is known,
         * but it doesn't really gain us much given that the certificate is unsigned anyway.
         *
         * @param hostname the hostname to verify
         * @param s        the SSL session
         * @return true if the hostname is verified (it always is)
         */
        public boolean verify(String hostname, SSLSession s) {
            //Log.d(TAG, "Verify hostname " + hostname);
            return true;
        }
    }

    /**
     * A trust manager implementation that trusts every certificate passed to it. Because we
     * want to work with unsigned certificates, this trusts everything presented to it.
     */
    private static class CavalierTrustManager implements X509TrustManager {
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

    }

    /**
     * Fetch the certificates that an HTTPS server uses to sign it's comms. This uses an
     * empty TrustManager implementation, so must only be used under strict conditions
     * e.g. when setting up preferences.
     */
    private Set<Certificate> fetchCertificates() throws KeyStoreException {
        SSLContext sslCtx; // temporary, while we are fetching the certificates
        Set<Certificate> certs = new HashSet<>();

        try {
            sslCtx = SSLContext.getInstance("TLS");

            sslCtx.init(null, new TrustManager[]{new CavalierTrustManager()}, null);
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
                    Log.d(TAG, "Fetched certificate " + ((X509Certificate) c).getSubjectDN());
                    certs.add(c);
                }
            }
            connection.disconnect();
        } catch (IOException ioe) {
            throw new KeyStoreException("IO exception: " + ioe.getMessage());
        }
        return certs;
    }

    /**
     * Connect to the given using the appropriate protocol
     *
     * @param url the URL to connect to
     * @throws IOException if there's a problem
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
     * Reads a UTF-8 encoded string from the connection.
     *
     * @param connection connection to read from
     * @return the response
     * @throws IOException if there's a problem
     */
    private static String readResponse(HttpURLConnection connection) throws IOException {
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

    /**
     * Parse the next well-formed Json object from the token reader.
     *
     * @param reader the source of the token stream
     * @return any of JSONObject, JSONArray, Double, String, Boolean or null
     * @throws IOException, JSONException
     */
    private static Object parseJSON(JsonReader reader) throws IOException, JSONException {
        JsonToken jt = reader.peek();
        if (jt == JsonToken.BEGIN_ARRAY) {
            JSONArray array = new JSONArray();
            reader.beginArray();
            while (reader.hasNext()) {
                if (reader.peek() == JsonToken.END_OBJECT)
                    break;
                array.put(parseJSON(reader));
            }
            reader.endArray();
            return array;
        }
        if (jt == JsonToken.BEGIN_OBJECT) {
            JSONObject object = new JSONObject();
            reader.beginObject();
            while (reader.hasNext()) {
                if (reader.peek() == JsonToken.END_OBJECT)
                    break;
                String name = reader.nextName();
                object.put(name, parseJSON(reader));
            }
            reader.endObject();
            return object;
        }
        if (jt == JsonToken.NAME)
            return reader.nextName();
        if (jt == JsonToken.NUMBER)
            return reader.nextDouble();
        if (jt == JsonToken.STRING)
            return reader.nextString();
        if (jt == JsonToken.BOOLEAN)
            return reader.nextBoolean();
        if (jt == JsonToken.NULL) {
            reader.skipValue();
            return null;
        }

        throw new JSONException("Malformed JSON " + jt);
    }

    /**
     * Parse the body as HTML, looking for a well formed META http-equiv="REFRESH" tag. The
     * body must be valid XML up to the point where the tag is seen (or the first &lt;/head&gt;
     * or &lt;body&gt is encountered)
     *
     * @param body retrieved page
     * @return new URL being redirected to.
     */
    private String exploreRedirect(String body) {
        try {
            XmlPullParser parser = XmlPullParserFactory.newInstance().newPullParser();
            parser.setInput(new StringReader(body));
            int event;
            while ((event = parser.next()) != XmlPullParser.END_DOCUMENT) {
                if (event == XmlPullParser.START_TAG) {
                    String tag = parser.getName().toLowerCase();
                    if (tag.equals("meta")) {
                        String attr, content = null;
                        /*for (int i = 0; i < parser.getAttributeCount(); i++) {
                            Log.d(TAG, "META " + parser.getAttributeNamespace(i)
                                    + " pf " + parser.getAttributePrefix(i)
                                    + " t " + parser.getAttributeType(i)
                                    + "" + parser.getAttributeName(i));
                        }*/
                        attr = parser.getAttributeValue(null, "http-equiv");
                        if (attr == null)
                            continue;
                        if (attr.toLowerCase().equals("refresh")) {
                            content = parser.getAttributeValue(null, "content");
                            if (content != null) {
                                int us = content.indexOf(";");
                                if (us >= 0)
                                    return content.substring(us + 1).trim();
                            }
                        }
                    } else if (tag.equals("body")) {
                        break;
                    }
                } else if (event == XmlPullParser.END_TAG && parser.getName().toLowerCase().equals("head"))
                    break;
            }
        } catch (XmlPullParserException xppe) {
            Log.d(TAG, "XPPE " + xppe);
        } catch (IOException ioe) {
            Log.d(TAG, "IOE " + ioe);
        }
        return null;
    }

    /**
     * Given an initial URL, try and connect and see if a 30x redirect moves us on. If it does,
     * follow the redirect and set a new mURL. If the connection succeeds and we can pull a body
     * with a 200 status, inspect that body to see if it is HTML. If it is, and we can parse
     * a REFRESH meta tag from it, then follow the redirect therein.
     */
    private void followRedirect() {
        try {
            HttpURLConnection connection = connect(mURL);
            connection.setInstanceFollowRedirects(true);
            Log.d(TAG, "Probe redirect RESPONSE CODE WAS " + connection.getResponseCode());
            String reply = readResponse(connection);
            if (connection.getResponseCode() >= 400)
                return;

            // Test for a 30x redirect
            URL realURL = connection.getURL();
            if (realURL.equals(mURL)) {
                // No 30x redirect. But if the response is well-formed HTML, it may contain
                //  a REFRESH meta-tag. Explore that option.
                String redirect = exploreRedirect(reply);
                if (redirect != null) {
                    realURL = new URL(redirect);
                    // Drop the path
                    realURL = new URL(realURL.getProtocol(), realURL.getHost(), realURL.getPort(), "");
                    Log.d(TAG, "REFRESH redirected to " + realURL);
                }
            } else
                Log.d(TAG, connection.getResponseCode() + " redirected to " + realURL);
            if (!realURL.equals(mURL))
                mURL = realURL;
        } catch (IOException ioe) {
            Log.d(TAG, "IO exception resolving redirect: " + ioe);
        }
    }

    /**
     * GET an request synchronously, calling a callback on receiving a response.
     *
     * @param path   URL path + params
     * @param rh     Response handler
     */
    public void GET_sync(final String path, final ResponseHandler rh) {
        try {
            URL url = new URL(mURL.getProtocol(), mURL.getHost(), mURL.getPort(),
                    path != null ? path : "");

            HttpURLConnection connection = connect(url);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Content-Type", "application/json;charset=utf-8");
            String reply = readResponse(connection);
            if (reply == null || reply.equals("")) {
                Log.d(TAG, "GET response is null");
                if (rh != null)
                    rh.done(null);
            } else {
                try { // and parse it
                    if (rh != null)
                        rh.done(parseJSON(new JsonReader(new StringReader(reply))));
                } catch (JSONException je) {
                    Log.e(TAG, "Failed to parse JSON response " + je);
                    if (rh != null)
                        rh.error(je);
                }
            }
        } catch (IOException ioe) {
            Log.e(TAG, "IO exception while reading response: " + ioe);
            if (rh != null)
                rh.error(ioe);
        }
    }

    /**
     * GET an request asynchronously, calling a callback on receiving a response.
     *
     * @param path   URL path + params
     * @param rh     Response handler
     */
    public void GET_async(final String path, final ResponseHandler rh) {
        // Handle the request in a new thread to avoid blocking the message queue
        Thread ut = new Thread() {
            public void run() {
                GET_sync(path, rh);
            }
        };
        ut.start();
    }

    /**
     * POST an request synchronously, calling a callback on receiving a response.
     *
     * @param path   URL path
     * @param params Request parameters
     * @param rh     Response handler
     */
    public void POST_sync(final String path, final JSONObject params,
                          final ResponseHandler rh) {
        try {
            URL url = new URL(mURL.getProtocol(), mURL.getHost(), mURL.getPort(),
                    path != null ? path : "");

            HttpURLConnection connection = connect(url);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json;charset=utf-8");
            if (params != null) {
                connection.setDoOutput(true);
                byte[] b = params.toString().getBytes(Charset.forName("UTF-8"));
                connection.setFixedLengthStreamingMode(b.length);
                OutputStream out = new BufferedOutputStream(connection.getOutputStream());
                out.write(b);
                out.close();
            }
            String reply = readResponse(connection);
            if (reply == null || reply.equals("")) {
                Log.d(TAG, "POST response is null");
                if (rh != null)
                    rh.done(null);
            } else {
                try { // and parse it
                    if (rh != null)
                        rh.done(parseJSON(new JsonReader(new StringReader(reply))));
                } catch (JSONException je) {
                    Log.e(TAG, "Failed to parse JSON response " + je);
                    if (rh != null)
                        rh.error(je);
                }
            }
        } catch (IOException ioe) {
            Log.e(TAG, "IO exception while reading response: " + ioe);
            if (rh != null)
                rh.error(ioe);
        }
    }

    /**
     * POST an request asynchronously, calling a callback on receiving a response.
     *
     * @param path   URL path
     * @param params Request parameters
     * @param rh     Response handler
     */
    public void POST_async(final String path, final JSONObject params,
                           final ResponseHandler rh) {
        Log.d(TAG, mURL + " POST " + path + " " + params);
        // Handle the request in a new thread to avoid blocking the message queue
        Thread ut = new Thread() {
            public void run() {
                POST_sync(path, params, rh);
            }
        };
        ut.start();
    }
}