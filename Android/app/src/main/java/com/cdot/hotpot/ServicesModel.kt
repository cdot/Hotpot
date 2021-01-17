package com.cdot.hotpot

import android.content.SharedPreferences
import android.util.Log
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import okhttp3.*
import org.json.JSONObject
import java.io.IOException
import java.util.*

class ServicesModel : ViewModel() {

    companion object {
        private val TAG = ServicesModel::class.simpleName

        const val BOOST = -274L
        const val CLEAR = -275L

        val SERVICE_NAMES = arrayOf("CH", "HW")
    }

    class Request(val source: String, val target: Double, val until_: Long)

    inner class Service(val serviceIndex: Int) {
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
            curTemp.postValue("%.4g".format(temp))
            targetTemp.postValue("%.4g".format(tgt))
            condition.postValue(if (temp < tgt) "<" else ">")
            lastKnownGood.postValue(if (deltaT < 60) "" else "(%ds)".format(deltaT))
            val reqs = job.getJSONArray("requests")
            val rl : MutableList<Request> = mutableListOf()
            for (i in 0 until reqs.length()) {
                val req = reqs.getJSONObject(i)
                rl.add(
                    Request(
                        req.getString("source"),
                        req.getDouble("target"),
                        req.getLong("until")
                    )
                )
            }
            requests.postValue(rl)
        }

        fun setPinstate(job: JSONObject) {
            val state = job.getInt("state")
            pinState.postValue(if (state == 0) "OFF" else "ON")
            val reas = job.getString("reason")
            reason.postValue(reas)
        }

        fun sendRequest(target: Double, until_: Long) {
            val job = JSONObject()
            job.put("service", SERVICE_NAMES[serviceIndex])
            job.put("source", "android")
            job.put("target", target)
            job.put("until", until_)
            hotpot.postJSON("/ajax/request", job, object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    Log.e(TAG, "POST", e)
                }

                override fun onResponse(call: Call, response: Response) {
                    if (response.code != 200) {
                        Log.e(TAG, "POST returned ${response.code}")
                    }
                }
            })
        }
    }

    var services : Array<Service> =  Array(SERVICE_NAMES.size) { i -> Service(i) }
    private var name2service : MutableMap<String, Service> = mutableMapOf()
    lateinit var hotpot: Hotpot

    init {
        for (s in services) {
            name2service[SERVICE_NAMES[s.serviceIndex]] = s
        }
    }

    fun pollState() {
        Timer().schedule(object : TimerTask() {
            override fun run() {
                hotpot.getJSON("/ajax/state", object : Callback {
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
            (name2service[key] ?: error("")).setThermostate(therms.getJSONObject(key))
        val pins = job.getJSONObject("pin")
        for (key in pins.keys())
            (name2service[key] ?: error("")).setPinstate(pins.getJSONObject(key))
    }
}