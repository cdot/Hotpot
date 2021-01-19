package com.cdot.hotpot

import android.app.Application
import android.content.SharedPreferences
import android.provider.Settings
import android.util.Log
import androidx.preference.PreferenceManager.getDefaultSharedPreferences
import okhttp3.Callback
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URL
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.*
import javax.security.cert.CertificateException

class Hotpot : Application() {
    companion object {
        private val TAG = Hotpot::class.simpleName
    }

    val prefs: SharedPreferences
        get() = getDefaultSharedPreferences(this)

    val deviceName: String
        get() {
            // https://medium.com/capital-one-tech/how-to-get-an-android-device-nickname-d5eab12f4ced
            var dn: String
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N_MR1) {
                dn = Settings.Global.getString(contentResolver, Settings.Global.DEVICE_NAME)
                if (dn != null && dn.isNotEmpty()) return dn
            }
            dn = Settings.System.getString(contentResolver, "device_name")
            if (dn != null && dn.isNotEmpty()) return dn
            Settings.System.getString(contentResolver, "bluetooth_name")
            if (dn != null && dn.isNotEmpty()) return dn
            dn = Settings.Secure.getString(contentResolver, "bluetooth_name")
            if (dn != null && dn.isNotEmpty()) return dn
            return "Android"
        }

    // Every security rule in the book is busted by this, as the certificate isn't checked. But
    // the Hotpot server is well controlled and this achieves what we want viz encryption of the
    // basicauth comms between the server and the client.
    val client = makeClient()

    private fun makeClient() : OkHttpClient {
        val trustAllCerts: Array<TrustManager> = arrayOf<TrustManager>(
                object : X509TrustManager {
                    @Throws(CertificateException::class)
                    override fun checkClientTrusted(chain: Array<X509Certificate?>?,
                                                    authType: String?) {
                        Log.d(TAG, "checkClientTrusted ${authType}")
                    }

                    @Throws(CertificateException::class)
                    override fun checkServerTrusted(chain: Array<X509Certificate?>?,
                                                    authType: String?) {
                        Log.d(TAG, "checkServerTrusted ${authType}")
                    }

                    override fun getAcceptedIssuers(): Array<X509Certificate?>? {
                        return arrayOf()
                    }
                }
        )
        val sslContext: SSLContext = SSLContext.getInstance("SSL")
        sslContext.init(null, trustAllCerts, SecureRandom())
        val sslSocketFactory: SSLSocketFactory = sslContext.getSocketFactory()
        val builder = OkHttpClient.Builder();
        builder.sslSocketFactory(sslSocketFactory, trustAllCerts[0] as X509TrustManager);
        builder.hostnameVerifier(object : HostnameVerifier {
            override fun verify(hostname: String?, session: SSLSession?): Boolean {
                // TODO: Verify that the hostname is what we expect
                Log.d(TAG, "Asked to verify host ${hostname}")
                return true
            }
        })
        return builder.build();
    }

    private fun addCredentials(builder: Request.Builder) {
        if (prefs.getString("username", null) != null) {
            val credentials = Credentials.basic(
                    prefs.getString("username", null)!!,
                    prefs.getString("password", null)!!)
            builder.addHeader("Authorization", credentials)
        }
    }

    fun POST(path: String, job: JSONObject, callback: Callback) {
        val json = job.toString()
        val body = json.toRequestBody("application/json; charset=utf-8".toMediaType())
        val url = URL(prefs.getString("url", "http://localhost") + path)
        val builder = Request.Builder()
                .url(url)
                .post(body)
        addCredentials(builder)
        client.newCall(builder.build()).enqueue(callback)
    }

    fun GET(path: String, callback: Callback) {
        val surl = prefs.getString("url", "http://localhost")
        val url = URL(surl + path)
        val builder = Request.Builder()
                .url(url)
        addCredentials(builder)
        client.newCall(builder.build()).enqueue(callback)
    }
}