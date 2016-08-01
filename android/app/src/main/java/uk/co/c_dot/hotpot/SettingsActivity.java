/**
 * @copyright 2016 Crawford Currie, All Rights Reserved
 */
package uk.co.c_dot.hotpot;

import android.content.SharedPreferences;
import android.content.res.Resources;
import android.os.Bundle;
import android.preference.PreferenceActivity;
import android.preference.PreferenceFragment;
import android.preference.PreferenceManager;
import android.util.Log;

/**
 * Hotpot preferences activity
 * Layout is in res.xml.preferences.xml
 */
public class SettingsActivity extends PreferenceActivity {

    public static final String TAG = "HOTPOT/SettingsActivity";

    // User preferences
    public static final String PREF_URL = MainActivity.DOMAIN + "URL";
    public static final String PREF_ACCURACY = MainActivity.DOMAIN + "ACCURACY";
    // Hidden preferences
    public static final String PREF_URL_WARNING = MainActivity.DOMAIN + "URL_WARNING";
    public static final String PREF_CERTS = MainActivity.DOMAIN + "CERTS";

    public static class SettingsFragment extends PreferenceFragment
            implements SharedPreferences.OnSharedPreferenceChangeListener {

        @Override
        public void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);

            // Load the preferences from an XML resource
            addPreferencesFromResource(R.xml.preferences);

            SharedPreferences prefs = PreferenceManager.getDefaultSharedPreferences(getActivity());
            setSummary(PREF_URL, getSummaryFor(PREF_URL, prefs));
            setSummary(PREF_ACCURACY, getSummaryFor(PREF_ACCURACY, prefs));
            prefs.registerOnSharedPreferenceChangeListener(this);
        }

        private String getSummaryFor(String key, SharedPreferences prefs) {
            String s = prefs.getString(key, null);
            switch (key) {
                case PREF_URL:
                case PREF_URL_WARNING:
                    if (s != null) {
                        String w = prefs.getString(PREF_URL_WARNING, null);
                        if (w != null)
                            s += " " + w;
                        return s;
                    }
                    break;
                case PREF_ACCURACY:
                    Resources res = getResources();
                    String[] nameMap = res.getStringArray(R.array.accuracy_names);
                    for (int i = 0; i < nameMap.length; i += 2) {
                        if (s == null || s.equals(nameMap[i])) {
                            s = nameMap[i + 1];
                            return s;
                        }
                    }
                    break;
            }
            return null;
        }

        private void setSummary(String key, String value) {
            if (value != null)
                findPreference(key).setSummary(value);
        }

        @Override
        public void onSharedPreferenceChanged(SharedPreferences prefs, String key) {
            String s = getSummaryFor(key, prefs);
            Log.d(TAG, key + " summary changed to " + s);
            setSummary(key, s);
        }
    }


    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Display the fragment as the main content.
        getFragmentManager().beginTransaction()
                .replace(android.R.id.content, new SettingsFragment())
                .commit();
    }
}