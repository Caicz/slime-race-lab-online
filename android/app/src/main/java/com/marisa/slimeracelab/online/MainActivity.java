package com.marisa.slimeracelab.online;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackgroundExecutionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
