package com.cdot.hotpot.ui.main

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import com.cdot.hotpot.MainActivity
import com.cdot.hotpot.R
import com.cdot.hotpot.databinding.RequestViewBinding
import com.cdot.hotpot.databinding.ServiceFragmentBinding
import java.util.*

/**
 * A placeholder fragment containing a simple view.
 */
class ServiceFragment(private val serviceIndex: Int) : Fragment() {
    companion object {
        private val TAG = ServiceFragment::class.simpleName

        val SERVICE_TITLES = arrayOf(
            R.string.tab_CH,
            R.string.tab_HW
        )
        val SERVICE_NAMES = arrayOf("CH", "HW")
    }

    private lateinit var serviceViewModel: ServicesModel.Service

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        serviceViewModel = ViewModelProvider(requireActivity()).get(ServicesModel::class.java).services[SERVICE_NAMES[serviceIndex]] ?: error("")
    }

    inner class RequestView(private val req: ServicesModel.Request, cxt: Context) : LinearLayout(cxt) {
        private val binding = RequestViewBinding.inflate(LayoutInflater.from(requireActivity()), this, true)

        fun updateView() {
            binding.sourceTV.text = req.source
            binding.targetTV.text = "%.02g".format(req.target)
            binding.untilTV.text =
                if (req.until_ == ServicesModel.BOOST) "boosted" else Date(req.until_).toString()
            binding.clearButton.setOnClickListener {
                //sendRequest(serviceName, req.source, req.target, ServicesModel.CLEAR)
            }
        }
    }

    inner class RequestAdapter : ArrayAdapter<ServicesModel.Request>(requireActivity(), 0) {
        override fun getView(i: Int, convertView: View?, viewGroup: ViewGroup): View {
            val v = if (convertView != null) convertView as RequestView
                else RequestView(serviceViewModel.requests.value?.get(i)!!, requireActivity())
            v.updateView()
            return v
        }
    }

    override fun onCreateView(
            inflater: LayoutInflater, container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View {
        val binding = ServiceFragmentBinding.inflate(layoutInflater)
        binding.serviceName.text = resources.getString(SERVICE_TITLES[serviceIndex])
        serviceViewModel.curTemp.observe(this, { binding.currentTempTV.text = it })
        serviceViewModel.condition.observe(this, { binding.conditionTV.text = it })
        serviceViewModel.targetTemp.observe(this, { binding.targetTempTV.text = it })
        serviceViewModel.lastKnownGood.observe(this, { binding.lastKnownGoodTV.text = it })
        serviceViewModel.boostTarget.observe(this, { binding.boostToET.setText(it.toString()) })
        serviceViewModel.pinState.observe(this, { binding.pinStateTV.text = it })
        serviceViewModel.reason.observe(this, { binding.reasonTV.text = it })

        binding.boostButton.setOnClickListener {
            // sendRequest(serviceName, "browser", req.target, ServicesModel.BOOST)
        }

        val arrayAdapter = RequestAdapter()
        binding.requestsLV.adapter = arrayAdapter
        serviceViewModel.requests.observe(this, { arrayAdapter.notifyDataSetChanged() })
        return binding.root
    }
}