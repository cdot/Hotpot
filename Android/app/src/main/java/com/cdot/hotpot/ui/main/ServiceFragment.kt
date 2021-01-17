package com.cdot.hotpot.ui.main

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
import com.cdot.hotpot.databinding.RequestViewBinding
import com.cdot.hotpot.databinding.ServiceFragmentBinding
import java.util.*

/**
 * A placeholder fragment containing a simple view.
 */
class ServiceFragment(val serviceName: String) : Fragment() {

    private lateinit var serviceViewModel: ServicesModel.Service

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        serviceViewModel = ViewModelProvider(requireActivity()).get(ServicesModel::class.java).services.get(serviceName)!!
    }

    inner class RequestView(val req: ServicesModel.Request, cxt: Context) : LinearLayout(cxt) {
        val binding = RequestViewBinding.inflate(LayoutInflater.from(requireActivity()), this, true)

        fun updateView() {
            binding.sourceTV.text = req.source
            binding.targetTV.text = "%.2g".format(req.target)
            binding.untilTV.text =
                if (req.until_ == ServicesModel.BOOST) "boosted" else Date(req.until_).toString()
            binding.clearButton.setOnClickListener {
                //sendRequest(serviceName, req.source, req.target, ServicesModel.CLEAR)
            }
        }
    }

    inner class RequestAdapter internal constructor(val serviceName: String) : ArrayAdapter<ServicesModel.Request>(requireActivity(), 0) {
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
    ): View? {
        val binding = ServiceFragmentBinding.inflate(layoutInflater)
        binding.serviceName.text = serviceName
        serviceViewModel.curTemp.observe(this, { binding.currentTempTV.text = it })
        serviceViewModel.condition.observe(this, { binding.conditionTV.text = it })
        serviceViewModel.targetTemp.observe(this, { binding.targetTempTV.text = it })
        serviceViewModel.lastKnownGood.observe(this, { binding.lastKnownGoodTV.text = it })
        serviceViewModel.boostTarget.observe(this, { binding.boostToET.setText(it.toString()) })
        serviceViewModel.pinState.observe(this, { binding.pinStateTV.setText(it) })
        serviceViewModel.reason.observe(this, { binding.reasonTV.setText(it) })

        binding.boostButton.setOnClickListener {
            // sendRequest(serviceName, "browser", req.target, ServicesModel.BOOST)
        }

        val arrayAdapter = RequestAdapter(serviceName)
        binding.requestsLV.adapter = arrayAdapter
        serviceViewModel.requests.observe(this, { arrayAdapter.notifyDataSetChanged() })
        return binding.root
    }

    companion object {
        /**
         * Returns a new instance of this fragment for the given section
         * number.
         */
        @JvmStatic
        fun newInstance(sectionName: String): ServiceFragment {
            return ServiceFragment(sectionName)
        }
    }
}