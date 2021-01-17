package com.cdot.hotpot

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.viewpager.widget.ViewPager
import com.cdot.hotpot.ui.main.SectionsPagerAdapter
import com.cdot.hotpot.ui.main.ServicesModel
import com.google.android.material.tabs.TabLayout
import okhttp3.*
import org.json.JSONObject
import java.io.*
import java.net.URL
import java.util.*


class MainActivity : AppCompatActivity() {

    companion object {
        // Shared Preferences
        const val TAG = "MainActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val sectionsPagerAdapter = SectionsPagerAdapter(this, supportFragmentManager)
        val viewPager: ViewPager = findViewById(R.id.view_pager)
        viewPager.adapter = sectionsPagerAdapter
        val tabs: TabLayout = findViewById(R.id.tabs)
        tabs.setupWithViewPager(viewPager)
        val model = ViewModelProvider(this).get(ServicesModel::class.java)

        val t = Timer()
        t.schedule(object: TimerTask() {
            override fun run() {
                val credentials = Credentials.basic("hotpot", "bavenue")
                val client = OkHttpClient();

                val url = URL("http://192.168.1.16:13196/ajax/state")
                val request = Request.Builder()
                    .url(url)
                    .addHeader("Authorization", credentials)
                    .build()

                client.newCall(request).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        TODO("Not yet implemented")
                    }

                    override fun onResponse(call: Call, response: Response) {
                        val t = response.body!!.string();
                        if (response.code != 200)
                            throw Error(response.message)
                        val json = JSONObject(t)
                        val therms = json.getJSONObject("thermostat")
                        for (key in therms.keys()) {
                            val service = model.services.get(key)!!
                            service.setThermostate(therms.getJSONObject(key))
                        }
                        val pins = json.getJSONObject("pin")
                        for (key in pins.keys()) {
                            val service = model.services.get(key)!!
                            service.setPinstate(pins.getJSONObject(key))
                        }
                    }
                })
            }
        }, 100L, 2000L);
    }
}