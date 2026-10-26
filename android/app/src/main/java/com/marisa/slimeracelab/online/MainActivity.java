package com.marisa.slimeracelab.online;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import androidx.core.view.WindowCompat;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        registerPlugin(BackgroundExecutionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
