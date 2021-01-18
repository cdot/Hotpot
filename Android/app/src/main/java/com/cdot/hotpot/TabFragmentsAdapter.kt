package com.cdot.hotpot

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter

/**
 * A [FragmentStateAdapter] that manages the fragments corresponding to
 * one of the tabs.
 */
class TabFragmentsAdapter(fa: FragmentActivity) : FragmentStateAdapter(fa) {

    /**
     * Returns the total number of items in the data set held by the adapter.
     * @return The total number of items in this adapter.
     */
    override fun getItemCount(): Int {
        return ServicesModel.SERVICE_NAMES.size + 1
    }

    /**
     * Provide a new Fragment associated with the specified position.
     */
    override fun createFragment(position: Int): Fragment {
        return if (position < ServicesModel.SERVICE_NAMES.size) ServiceFragment(position)
        else SharedPreferencesFragment()
    }
}