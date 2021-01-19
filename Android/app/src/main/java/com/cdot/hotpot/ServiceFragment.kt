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
class ServiceFragment(val serviceIndex: Int) : Fragment() {
    companion object {
        private val TAG = ServiceFragment::class.simpleName

        val SERVICE_TITLES = arrayOf(
                R.string.tab_CH,
                R.string.tab_HW
        )
    }

    private lateinit var services : ServicesModel
    private lateinit var service: ServicesModel.Service

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        services = ViewModelProvider(requireActivity()).get(ServicesModel::class.java)
        service = services.services[serviceIndex]
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
                service.sendRequest(0.0, ServicesModel.CLEAR)
            }
        }
    }

    inner class RequestAdapter : ArrayAdapter<ServicesModel.Request>(requireActivity(), 0) {
        override fun getView(i: Int, convertView: View?, viewGroup: ViewGroup): View {
            val r = service.requests
            val v = r.value!!
            val view = if (convertView == null) RequestView() else convertView as RequestView
            view.request = v[i]
            view.updateView()
            return view
        }

        override fun getCount(): Int {
            val r = service.requests
            val v = r.value ?: return 0
            return v.size
        }
    }

    override fun onCreateView(
            inflater: LayoutInflater, container: ViewGroup?,
            savedInstanceState: Bundle?
    ): View {
        val binding = ServiceFragmentBinding.inflate(layoutInflater)
        binding.serviceName.text = resources.getString(SERVICE_TITLES[serviceIndex])
        service.curTemp.observe(viewLifecycleOwner, { binding.currentTempTV.text = it })
        service.condition.observe(viewLifecycleOwner, { binding.conditionTV.text = it })
        service.targetTemp.observe(viewLifecycleOwner, { binding.targetTempTV.text = it })
        service.lastKnownGood.observe(viewLifecycleOwner, { binding.lastKnownGoodTV.text = it })
        service.boostTarget.observe(viewLifecycleOwner, { binding.boostToET.setText(it.toString()) })
        service.pinState.observe(viewLifecycleOwner, { binding.pinStateTV.text = it })
        service.reason.observe(viewLifecycleOwner, { binding.reasonTV.text = it })

        binding.boostButton.setOnClickListener {
            val s = binding.boostToET.text.toString()
            service.sendRequest(s.toDouble(), ServicesModel.BOOST)
        }
        binding.boostButton.isEnabled = false // remember this in prefs
        binding.boostToET.setOnEditorActionListener { textView: TextView?, i: Int, _: KeyEvent? ->
            if (i == EditorInfo.IME_ACTION_DONE) {
                val imm = textView!!.context.getSystemService(Activity.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(textView.windowToken, 0)
                val s = binding.boostToET.text.toString()
                binding.boostButton.isEnabled = s.isNotEmpty()
            }
            false
        }

        val arrayAdapter = RequestAdapter()
        binding.requestsLV.adapter = arrayAdapter
        service.requests.observe(viewLifecycleOwner, {
            arrayAdapter.notifyDataSetChanged()
        })
        return binding.root
    }

    override fun onResume() {
        services.addStateListener(this)
        super.onResume()
    }

    override fun onPause() {
        services.removeStateListener(this)
        super.onPause()
    }
}