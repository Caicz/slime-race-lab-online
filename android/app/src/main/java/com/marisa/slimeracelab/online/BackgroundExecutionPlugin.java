package com.marisa.slimeracelab.online;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundExecution",
    permissions = {@Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})}
)
public class BackgroundExecutionPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void start(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
            return;
        }

        startService(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        // Android permits foreground services after notification denial, but shows them only in the active-apps panel.
        startService(call);
    }

    private void startService(PluginCall call) {
        Intent intent = new Intent(getContext(), AutomationForegroundService.class);
        ContextCompat.startForegroundService(getContext(), intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), AutomationForegroundService.class));
        call.resolve();
    }

    @PluginMethod
    public void delay(PluginCall call) {
        Long milliseconds = call.getLong("milliseconds");
        if (milliseconds == null || milliseconds < 0 || milliseconds > 60000) {
            call.reject("等待时间必须在 0–60000 毫秒之间");
            return;
        }

        handler.postDelayed(() -> call.resolve(new JSObject()), milliseconds);
    }
}
