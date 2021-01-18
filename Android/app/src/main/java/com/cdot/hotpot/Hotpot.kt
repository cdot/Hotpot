package com.cdot.hotpot

import android.app.Application
import android.content.SharedPreferences
import android.provider.Settings
import androidx.preference.PreferenceManager.getDefaultSharedPreferences
import okhttp3.Callback
import okhttp3.Credentials
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URL

class Hotpot : Application() {
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
        val client = OkHttpClient()
        val url = URL(prefs.getString("url", "http://localhost") + path)
        val builder = Request.Builder()
                .url(url)
                .post(body)
        addCredentials(builder)
        client.newCall(builder.build()).enqueue(callback)
    }

    fun GET(path: String, callback: Callback) {
        val client = OkHttpClient()
        val surl = prefs.getString("url", "http://localhost")
        val url = URL(surl + path)
        val builder = Request.Builder()
                .url(url)
        addCredentials(builder)
        client.newCall(builder.build()).enqueue(callback)
    }
}