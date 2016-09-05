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
import java.security.cert.CertificateException;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.HashSet;

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
    private URL mURL;

    /**
     * Only used if this is an SSL connection
     */
    private SSLContext mSSLContext;

    /**
     * * Base64 encoded authentication string (if provided)
     */
    private String mAuthentication;

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
     * Create a new server connection to the given trusted URL, and, if the protocol is https,
     * fetch certificates from the remote server, loading them into the connection. Note that
     * this constructor must only be used with an absolutely trusted URL - for example, when
     * first defining the parameters of a connection that will subsequently be used with
     * cached certificates. Automatically resolves any single level of redirect.
     *
     * @param url URL of trusted server
     * @throws IOException if there was  problem
     */
    public ServerConnection(String url, String user, String pass) throws IOException {

        Log.d(TAG, "Create server connection on " + mURL);
        if (user != null && pass != null) {
            String auth = user + ":" + pass;
            mAuthentication = Base64.encodeToString(auth.getBytes(), Base64.NO_WRAP);
        } else
            mAuthentication = null;

        mURL = null;
        mSSLContext = null;
        peekConnect(new URL(url), 5);
    }

    /**
     * Given an initial URL, try and connect and see if a 30x redirect moves us on. If it does,
     * follow the redirect and set a new mURL. If the connection succeeds and we can pull a body
     * with a 200 status, inspect that body to see if it is HTML. If it is, and we can parse
     * a REFRESH meta tag from it, then follow the redirect therein.
     * Fetch the certificates that an HTTPS server uses to sign it's comms. This uses an
     * empty TrustManager implementation, so must only be used under strict conditions.
     * Sets up mURL and (if appropriate) mSSLContext
     */
    private void peekConnect(URL url, int redirLimit) throws IOException {
        SSLContext sslCtx; // temporary, while we are fetching the certificates

        Log.d(TAG, "Peeking at " + url);

        HttpURLConnection conn;

        if (url.getProtocol().equals("https")) {
            try {
                sslCtx = SSLContext.getInstance("TLS");
                sslCtx.init(null, new TrustManager[]{new CavalierTrustManager()}, null);
                Log.d(TAG, "Peeking connection with cavalier trust manager");

            } catch (NoSuchAlgorithmException nsae) {
                throw new IOException("No such algorithm: " + nsae.getMessage());
            } catch (KeyManagementException kme) {
                throw new IOException("Key management: " + kme.getMessage());
            }

            HttpsURLConnection sslConn = (HttpsURLConnection) url.openConnection();
            Log.d(TAG, "Opened connection to " + url);

            sslConn.setHostnameVerifier(new UnselectiveHostnameVerifier());
            sslConn.setSSLSocketFactory(sslCtx.getSocketFactory());
            conn = sslConn;
            conn.setUseCaches(false);
        } else {
            conn = (HttpURLConnection) url.openConnection();
        }
        conn.setInstanceFollowRedirects(true);
        if (mAuthentication != null)
            conn.setRequestProperty("Authorization", "Basic " + mAuthentication);

        if (conn.getResponseCode() >= 300)
            throw new IOException("Peek at " + url + " failed, response was " + conn.getResponseCode());

        // See if we have a redirect
        String reply = readResponse(conn);

        URL realURL = conn.getURL();

        // A 30x redirect should be handled by Http*URLConnection. But an HTML refresh redirect
        // is another matter.
        if (realURL.equals(url)) {
            // No 30x redirect. But if the response is well-formed HTML, it may contain
            // a REFRESH meta-tag. Explore that option.
            String redirect = exploreRedirect(reply);
            if (redirect != null) {
                realURL = new URL(redirect);
                // Drop the path
                realURL = new URL(realURL.getProtocol(), realURL.getHost(), realURL.getPort(), "");
                if (!realURL.equals(url)) {
                    Log.d(TAG, "REFRESH redirected to " + realURL);
                    if (redirLimit == 0)
                        throw new IOException("Exceeded redirect limit " + realURL);
                    peekConnect(realURL, redirLimit - 1);
                    return;
                }
            }
        } else {
            Log.d(TAG, conn.getResponseCode() + " redirect to " + realURL);
        }

        // Get certificates
        if (conn instanceof HttpsURLConnection) {
            HttpsURLConnection sslConn = (HttpsURLConnection) conn;
            try {
                // Create a KeyStore containing our trusted CAs
                String keyStoreType = KeyStore.getDefaultType();
                KeyStore keyStore = KeyStore.getInstance(keyStoreType);
                keyStore.load(null, null);

                for (Certificate ca : sslConn.getServerCertificates()) {
                    Log.d(TAG, "Fetched certificate " + ((X509Certificate) ca).getSubjectDN());
                    keyStore.setCertificateEntry("ca", ca);
                }

                String algorithm = TrustManagerFactory.getDefaultAlgorithm();
                TrustManagerFactory tmf = TrustManagerFactory.getInstance(algorithm);
                tmf.init(keyStore);
                Log.d(TAG, "Initialised TrustManagerFactory with " + keyStore.size() + " certificates");
                mSSLContext = SSLContext.getInstance("TLS");
                mSSLContext.init(null, tmf.getTrustManagers(), null);

            } catch (CertificateException | KeyStoreException | NoSuchAlgorithmException | KeyManagementException e) {
                Log.e(TAG, "Failure setting up SSL context " + e);
                // Should never happen
                throw new IOException(e);
            }
        }
        conn.disconnect();
        mURL = url;
    }

    /**
     * Get the connected URL
     */
    public URL getUrl() {
        return mURL;
    }

    /**
     * Connect to the given using the appropriate protocol
     *
     * @param url the URL to connect to
     * @throws IOException if there's a problem
     */
    private HttpURLConnection connect(URL url) throws IOException {
        HttpURLConnection conn;
        if (url.getProtocol().equals("https")) {
            HttpsURLConnection sslConn = (HttpsURLConnection) url.openConnection();
            sslConn.setHostnameVerifier(new UnselectiveHostnameVerifier());
            sslConn.setSSLSocketFactory(mSSLContext.getSocketFactory());
            conn = sslConn;
        } else {
            conn = (HttpURLConnection) url.openConnection();
        }
        conn.setUseCaches(false);
        if (mAuthentication != null)
            conn.setRequestProperty("Authorization", "Basic " + mAuthentication);
        return conn;
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
     * GET an request synchronously, calling a callback on receiving a response.
     *
     * @param path URL path + params
     * @param rh   Response handler
     */
    public void GET_sync(final String path, final ResponseHandler rh) {
        try {
            URL url = new URL(mURL.getProtocol(), mURL.getHost(), mURL.getPort(),
                    path != null ? path : "");

            HttpURLConnection connection = connect(url);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Content-Type", "application/json;charset=utf-8");
            if (connection.getResponseCode() >= 300)
                throw new IOException("Error " + connection.getResponseCode()
                        + " " + connection.getResponseMessage());
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
     * @param path URL path + params
     * @param rh   Response handler
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
            if (connection.getResponseCode() >= 300)
                throw new IOException("Error " + connection.getResponseCode()
                        + " " + connection.getResponseMessage());
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