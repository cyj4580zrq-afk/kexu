package com.campusflow.schedule;

import android.os.Build;
import android.os.Bundle;
import android.window.BackEvent;
import android.window.OnBackAnimationCallback;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.annotation.NonNull;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private OnBackInvokedCallback predictiveBackCallback;
    private boolean predictiveBackRegistered;
    private boolean predictiveGestureActive;
    private boolean progressDispatchPending;
    private int predictiveGestureId;
    private float latestBackProgress;
    private int latestBackSwipeEdge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getBridge().getWebView().postDelayed(this::publishSystemBarInsets, 250);
    }

    @Override
    public void onResume() {
        super.onResume();
        setupPredictiveBack();
    }

    @Override
    public void onPause() {
        teardownPredictiveBack();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        if (hasWindowFocus) getBridge().getWebView().postDelayed(this::publishSystemBarInsets, 100);
    }

    private void setupPredictiveBack() {
        if (predictiveBackRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            predictiveBackCallback = new OnBackAnimationCallback() {
                @Override
                public void onBackStarted(@NonNull BackEvent event) {
                    predictiveGestureActive = true;
                    predictiveGestureId++;
                    sendPredictiveBackEvent("start", event.getProgress(), event.getSwipeEdge());
                }

                @Override
                public void onBackProgressed(@NonNull BackEvent event) {
                    queuePredictiveBackProgress(event.getProgress(), event.getSwipeEdge());
                }

                @Override
                public void onBackInvoked() {
                    invalidatePredictiveBackProgress();
                    sendPredictiveBackEvent("complete", 1f, 0);
                }

                @Override
                public void onBackCancelled() {
                    invalidatePredictiveBackProgress();
                    sendPredictiveBackEvent("cancel", 0f, 0);
                }
            };
        } else {
            predictiveBackCallback = () -> sendPredictiveBackEvent("complete", 1f, 0);
        }
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_OVERLAY,
            predictiveBackCallback
        );
        predictiveBackRegistered = true;
    }

    private void teardownPredictiveBack() {
        if (!predictiveBackRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(predictiveBackCallback);
        predictiveBackRegistered = false;
        predictiveBackCallback = null;
        invalidatePredictiveBackProgress();
    }

    private void queuePredictiveBackProgress(float progress, int swipeEdge) {
        latestBackProgress = progress;
        latestBackSwipeEdge = swipeEdge;
        if (progressDispatchPending || getBridge() == null || getBridge().getWebView() == null) return;
        progressDispatchPending = true;
        final int gestureId = predictiveGestureId;
        getBridge().getWebView().postOnAnimation(() -> {
            progressDispatchPending = false;
            if (!predictiveGestureActive || gestureId != predictiveGestureId) return;
            sendPredictiveBackEvent("progress", latestBackProgress, latestBackSwipeEdge);
        });
    }

    private void invalidatePredictiveBackProgress() {
        predictiveGestureActive = false;
        predictiveGestureId++;
        progressDispatchPending = false;
    }

    private void sendPredictiveBackEvent(String action, float progress, int swipeEdge) {
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            String script = String.format(
                Locale.US,
                "window.onPredictiveBackEvent && window.onPredictiveBackEvent('%s', %.4f, %d);",
                action, progress, swipeEdge
            );
            getBridge().getWebView().evaluateJavascript(script, null);
        });
    }

    private void publishSystemBarInsets() {
        WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(getBridge().getWebView());
        if (windowInsets == null) return;
        Insets bars = windowInsets.getInsets(
            WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.navigationBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = getResources().getDisplayMetrics().density;
        String script = "document.documentElement.style.setProperty('--native-safe-top','" + (bars.top / density) + "px');"
            + "document.documentElement.style.setProperty('--native-safe-bottom','" + (bars.bottom / density) + "px');"
            + "document.documentElement.classList.add('native-android');";
        getBridge().getWebView().evaluateJavascript(script, null);
    }
}
