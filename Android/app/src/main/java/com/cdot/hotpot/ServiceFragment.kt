package com.cdot.hotpot

import android.app.Activity
import android.os.Bundle
import android.view.KeyEvent
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.ArrayAdapter
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.lifecycle.ViewModelProvider
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
    }

    private lateinit var servicesModel: ServicesModel.Service

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        servicesModel = ViewModelProvider(requireActivity()).get(ServicesModel::class.java).services[serviceIndex]
    }

    inner class RequestView : LinearLayout(requireActivity()) {
        private val binding = RequestViewBinding.inflate(LayoutInflater.from(requireActivity()), this, true)
        lateinit var request: ServicesModel.Request

        fun updateView() {
            binding.requestTV.text = resources.getString(R.string.requestDetails, request.source, request.target,
                    if (request.until_ == ServicesModel.BOOST) "boosted" else Date(request.until_).toString())
            val hotpot = requireActivity().application as Hotpot
            binding.clearButton.visibility = if (request.source == hotpot.deviceName) View.VISIBLE else View.GONE
            binding.clearButton.setOnClickListener {
                servicesModel.sendRequest(0.0, ServicesModel.CLEAR)
            }
        }
    }

    inner class RequestAdapter : ArrayAdapter<ServicesModel.Request>(requireActivity(), 0) {
        override fun getView(i: Int, convertView: View?, viewGroup: ViewGroup): View {
            val r = servicesModel.requests
            val v = r.value!!
            val view = if (convertView == null) RequestView() else convertView as RequestView
            view.request = v.get(i)
            view.updateView()
            return view
        }

        override fun getCount(): Int {
            val r = servicesModel.requests
            val v = r.value
            if (v == null) return 0
            return v.size
        }
    }

    override fun onCreateView(
            inflater: LayoutInflater, container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View {
        val binding = ServiceFragmentBinding.inflate(layoutInflater)
        binding.serviceName.text = resources.getString(SERVICE_TITLES[serviceIndex])
        servicesModel.curTemp.observe(viewLifecycleOwner, { binding.currentTempTV.text = it })
        servicesModel.condition.observe(viewLifecycleOwner, { binding.conditionTV.text = it })
        servicesModel.targetTemp.observe(viewLifecycleOwner, { binding.targetTempTV.text = it })
        servicesModel.lastKnownGood.observe(viewLifecycleOwner, { binding.lastKnownGoodTV.text = it })
        servicesModel.boostTarget.observe(viewLifecycleOwner, { binding.boostToET.setText(it.toString()) })
        servicesModel.pinState.observe(viewLifecycleOwner, { binding.pinStateTV.text = it })
        servicesModel.reason.observe(viewLifecycleOwner, { binding.reasonTV.text = it })

        binding.boostButton.setOnClickListener {
            val s = binding.boostToET.text.toString()
            servicesModel.sendRequest(s.toDouble(), ServicesModel.BOOST)
        }
        binding.boostButton.setEnabled(false) // remember this in prefs
        binding.boostToET.setOnEditorActionListener { textView: TextView?, i: Int, keyEvent: KeyEvent? ->
            if (i == EditorInfo.IME_ACTION_DONE) {
                val imm = textView!!.getContext().getSystemService(Activity.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(textView.getWindowToken(), 0)
                val s = binding.boostToET.text.toString()
                binding.boostButton.setEnabled(s.isNotEmpty())
            }
            false
        }

        val arrayAdapter = RequestAdapter()
        binding.requestsLV.adapter = arrayAdapter
        servicesModel.requests.observe(viewLifecycleOwner, {
            arrayAdapter.notifyDataSetChanged()
        })
        return binding.root
    }
}