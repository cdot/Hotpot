package com.cdot.hotpot

import android.app.Activity
import android.provider.Settings
import android.util.Log
import android.widget.Toast
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
                val r = Request(req.getString("source"), req.getDouble("target"), req.getLong("until"))
                rl.add(r);
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
            job.put("source", hotpot.deviceName)
            job.put("target", target)
            job.put("until", until_)
            hotpot.POST("/ajax/request", job, object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    Log.e(TAG, "POST /ajax/request", e)
                }

                override fun onResponse(call: Call, response: Response) {
                    if (response.code != 200) {
                        Log.e(TAG, "POST /ajax/request returned ${response.code}")
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

    fun pollState(activity: Activity) {
        Timer().schedule(object : TimerTask() {
            override fun run() {
                hotpot.GET("/ajax/state", object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        Log.e(TAG, "GET /ajax/state", e)
                    }

                    override fun onResponse(call: Call, response: Response) {
                        if (response.code == 200) {
                            val json = response.body!!.string()
                            setState(JSONObject(json))
                        } else
                            activity.runOnUiThread {
                                Toast.makeText(activity, response.message, Toast.LENGTH_SHORT).show()
                            }
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