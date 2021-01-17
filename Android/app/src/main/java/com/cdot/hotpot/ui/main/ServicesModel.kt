package com.cdot.hotpot.ui.main

import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import org.json.JSONObject
import java.util.*

class ServicesModel : ViewModel() {

    companion object {
        const val BOOST = -274L
        const val CLEAR = -275L
    }

    class Request(val source: String, val target: Double, val until_: Long) {
    }

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
            val rl : MutableList<Request> = mutableListOf();
            for (i in 0 until reqs.length()) {
                val req = reqs.getJSONObject(i)
                rl.add(Request(req.getString("source"), req.getDouble("target"), req.getLong("until")))
            }
            requests.postValue(rl);
        }

        fun setPinstate(job: JSONObject) {
            val state = job.getInt("state")
            pinState.postValue(if (state == 0) "OFF" else "ON");
            val reas = job.getString("reason")
            reason.postValue(reas)
        }
    }

    val services = mapOf("HW" to Service(), "CH" to Service())
}