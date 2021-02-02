package com.cdot.hotpot

import android.app.Activity
import android.util.Log
import android.widget.Toast
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.google.android.material.snackbar.Snackbar
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.*
import kotlin.math.floor

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
            var deltaT = (System.currentTimeMillis() - lkg) / 1000
            curTemp.postValue("%.4g".format(temp))
            targetTemp.postValue("%.4g".format(tgt))
            condition.postValue(if (temp < tgt) "<" else ">")
            val h = floor(deltaT / (60 * 60 * 1000.0))
            deltaT %= 60 * 60 * 1000
            val m = floor(deltaT / (60 * 1000.0))
            deltaT %= 60 * 1000
            val s = floor(deltaT / 1000.0)
            var d = if (h > 0) "${h}h" else ""
            if (m > 0) d + "${m}m"
            if (s > 0) d += "${s}s"
            lastKnownGood.postValue(d)
            val reqs = job.getJSONArray("requests")
            val rl: MutableList<Request> = mutableListOf()
            for (i in 0 until reqs.length()) {
                val req = reqs.getJSONObject(i)
                val r = Request(req.getString("source"), req.getDouble("target"), req.getLong("until"))
                rl.add(r)
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

    var services: Array<Service> = Array(SERVICE_NAMES.size) { i -> Service(i) }
    private var name2service: MutableMap<String, Service> = mutableMapOf()
    lateinit var hotpot: Hotpot

    init {
        for (s in services) {
            name2service[SERVICE_NAMES[s.serviceIndex]] = s
        }
    }

    // Public count of listeners who want state updates (should never exceed 1)
    var stateListeners = mutableSetOf<ServiceFragment>()

    fun addStateListener(f: ServiceFragment) {
        Log.d(TAG, "Adding state listener ${f.serviceIndex}")
        stateListeners.add(f);
    }

    fun removeStateListener(f: ServiceFragment) {
        Log.d(TAG, "Removing state listener ${f.serviceIndex}")
        stateListeners.remove(f);
    }

    // Poll the server for the current state and display
    fun pollState(activity: Activity) {
        Timer().schedule(object : TimerTask() {
            override fun run() {
                // Don't query state unless there is at least one state listener active
                if (stateListeners.size == 0)
                    return

                hotpot.GET("/ajax/state", object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        Log.e(TAG, "GET /ajax/state", e)
                        activity.runOnUiThread {
                            Snackbar.make(activity.findViewById(R.id.view_pager),
                            activity.getString(R.string.no_contact), Snackbar.LENGTH_SHORT).show()
                        }
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