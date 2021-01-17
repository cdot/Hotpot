package com.cdot.hotpot

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import com.cdot.hotpot.databinding.MainActivityBinding

class MainActivity : AppCompatActivity() {

    companion object {
        private val TAG = MainActivity::class.simpleName
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val binding = MainActivityBinding.inflate(layoutInflater)
        setContentView(binding.root)
        val viewPager = binding.viewPager
        viewPager.adapter = SectionsPagerAdapter(this)
        val model = ViewModelProvider(this).get(ServicesModel::class.java)
        model.hotpot = application as Hotpot
        model.pollState()
    }
}