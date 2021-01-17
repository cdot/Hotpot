package com.cdot.hotpot.ui.main

import android.util.Log
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import okhttp3.*
import org.json.JSONObject
import java.io.IOException
import java.net.URL
import java.util.*

class ServicesModel : ViewModel() {

    companion object {
        private val TAG = ServicesModel::class.simpleName

        const val BOOST = -274L
        const val CLEAR = -275L
    }

    class Request(val source: String, val target: Double, val until_: Long)

    class Service {
        val curTemp = MutableLiveData<String>()
        val condition = MutableLiveData<String>()
        val targetTemp = MutableLiveData<String>()
        val lastKnownGood = MutableLiveData<String>()
        val pinState = MutableLiveData<String>()
        val reason = MutableLiveData<String>()
        val requests = MutableLiveData<List<Request>>()
        val boostTarget = MutableLiveData<Double>()

        fun setThermostate(job: JSONObject) {
            val temp = job.getDouble("temperature")
            val tgt = job.getDouble("target")
            val lkg = job.getLong("lastKnownGood")
            val deltaT = (System.currentTimeMillis() - lkg) / 1000
            curTemp.postValue("%.2g".format(temp))
            targetTemp.postValue("%.2g".format(tgt))
            condition.postValue(if (temp < tgt) "<" else ">")
            lastKnownGood.postValue(if (deltaT < 60) "" else "(%ds)".format(deltaT))
            val reqs = job.getJSONArray("requests")
            val rl : MutableList<Request> = mutableListOf()
            for (i in 0 until reqs.length()) {
                val req = reqs.getJSONObject(i)
                rl.add(Request(req.getString("source"), req.getDouble("target"), req.getLong("until")))
            }
            requests.postValue(rl)
        }

        fun setPinstate(job: JSONObject) {
            val state = job.getInt("state")
            pinState.postValue(if (state == 0) "OFF" else "ON")
            val reas = job.getString("reason")
            reason.postValue(reas)
        }
    }

    val services = mapOf("HW" to Service(), "CH" to Service())

    fun pollState() {
        Timer().schedule(object: TimerTask() {
            override fun run() {
                val credentials = Credentials.basic("hotpot", "bavenue")
                val client = OkHttpClient()

                val url = URL("http://192.168.1.16:13196/ajax/state")
                val request = okhttp3.Request.Builder()
                    .url(url)
                    .addHeader("Authorization", credentials)
                    .build()

                client.newCall(request).enqueue(object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        Log.e(TAG, "GET", e)
                    }

                    override fun onResponse(call: Call, response: Response) {
                        if (response.code != 200)
                            throw Error(response.message)
                        val json = JSONObject(response.body!!.string())
                        setState(json)
                    }
                })
            }
        }, 100L, 2000L)
    }

    fun setState(job: JSONObject) {
        val therms = job.getJSONObject("thermostat")
        for (key in therms.keys())
            (services[key] ?: error("")).setThermostate(therms.getJSONObject(key))
        val pins = job.getJSONObject("pin")
        for (key in pins.keys())
            (services[key] ?: error("")).setPinstate(pins.getJSONObject(key))
    }
}