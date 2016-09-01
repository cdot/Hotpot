/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.res.Resources;
import android.os.Bundle;
import android.preference.Preference;
import android.preference.PreferenceActivity;
import android.preference.PreferenceFragment;
import android.preference.PreferenceManager;
import android.support.v4.content.LocalBroadcastManager;
import android.util.Log;

/**
 * Hotpot preferences activity
 * Layout is in res.xml.preferences.xml
 */
public class SettingsActivity extends PreferenceActivity {

    private static final String TAG = "HOTPOT/SettingsActivity";

    public static class SettingsFragment extends PreferenceFragment
            implements SharedPreferences.OnSharedPreferenceChangeListener {

        @Override
        public void onCreate(Bundle savedInstanceState) {
            Log.d(TAG, ".SettingsFragment onCreate");
            super.onCreate(savedInstanceState);

            // Load the preferences from XML
            addPreferencesFromResource(R.xml.preferences);

            // Force initialisation from shared preferences
            SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(getActivity());
            onSharedPreferenceChanged(prefs, MainActivity.PREF_URL);
            onSharedPreferenceChanged(prefs, MainActivity.PREF_FREQ);
        }

        @Override
        public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
            String val = prefs.getString(key, null);
            Preference pref = findPreference(key);
            Resources res = getResources();
            key = key.substring(key.lastIndexOf('.') + 1);
            int id = res.getIdentifier(key, "string", "uk.co.c_dot.hotpot");
            String format = res.getString(id, val);
            pref.setSummary(format);
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        Log.d(TAG, "onCreate");
        super.onCreate(savedInstanceState);
        // Display the fragment as the main content
        SettingsFragment frag = new SettingsFragment();
        getFragmentManager().beginTransaction()
                .replace(android.R.id.content, frag)
                .commit();
        SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(this);
        prefs.registerOnSharedPreferenceChangeListener(frag);
    }
}
