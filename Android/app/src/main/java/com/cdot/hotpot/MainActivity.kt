package com.cdot.hotpot

import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import com.cdot.hotpot.databinding.MainActivityBinding
import com.google.android.material.snackbar.Snackbar
import okhttp3.Call
import okhttp3.Callback
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException

class MainActivity : AppCompatActivity() {

    companion object {
        private val TAG = MainActivity::class.simpleName
    }

    lateinit var hotpot : Hotpot
    lateinit var binding : MainActivityBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hotpot = application as Hotpot

        val model = ViewModelProvider(this).get(ServicesModel::class.java)
        model.hotpot = hotpot

        binding = MainActivityBinding.inflate(layoutInflater)
        setContentView(binding.root)
        val viewPager = binding.viewPager
        viewPager.adapter = TabFragmentsAdapter(this)

        model.pollState(this)
    }
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_activity, menu)
        return true
    }

    override fun onOptionsItemSelected(menuItem: MenuItem): Boolean {
        when (menuItem.itemId) {
            R.id.updateCalendars -> {
                hotpot.GET("/ajax/refresh_calendars", object : Callback {
                    override fun onFailure(call: Call, e: IOException) {
                        Log.e(TAG, "GET /ajax/refresh_calendars", e)
                        runOnUiThread {
                            Toast.makeText(
                                this@MainActivity,
                                "Error updating calendars ${e.message}",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }

                    override fun onResponse(call: Call, response: Response) {
                        if (response.code == 200) {
                            runOnUiThread {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Calendars updating",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        } else
                            runOnUiThread {
                                Toast.makeText(
                                    this@MainActivity,
                                    "Error updating calendars ${response.message}",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                    }
                })
            }
            R.id.about ->
                Snackbar.make(binding.root, resources.getString(R.string.about_snack, BuildConfig.VERSION_NAME, BuildConfig.VERSION_CODE, BuildConfig.BUILD_TIME / 3600000.0), Snackbar.LENGTH_INDEFINITE).show()

        }
        return true
    }
}