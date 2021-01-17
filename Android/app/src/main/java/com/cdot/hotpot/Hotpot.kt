package com.cdot.hotpot

import android.app.Application
import android.content.SharedPreferences
import androidx.preference.PreferenceManager.getDefaultSharedPreferences
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.net.URL

class Hotpot : Application() {
    private val prefs: SharedPreferences
        get() = getDefaultSharedPreferences(this)

    private fun addCredentials(builder: Request.Builder) {
        if (prefs.getString("username", null) != null) {
            val credentials = Credentials.basic(
                prefs.getString("username", null)!!,
                prefs.getString("password", null)!!)
            builder.addHeader("Authorization", credentials)
        }
    }
    
    fun postJSON(path: String, job: JSONObject, callback: Callback) {
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

    fun getJSON(path: String, callback: Callback) {
        val client = OkHttpClient()
        val surl = prefs.getString("url", "http://localhost")
        val url = URL(surl + path)
        val builder = Request.Builder()
            .url(url)
        addCredentials(builder)
        client.newCall(builder.build()).enqueue(callback)
    }
}