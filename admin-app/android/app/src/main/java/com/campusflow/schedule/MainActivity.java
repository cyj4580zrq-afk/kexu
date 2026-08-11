package com.campusflow.schedule;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private OnBackInvokedCallback backCallback;
    private boolean backCallbackRegistered;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private DownloadManager downloadManager;
    private BroadcastReceiver updateDownloadReceiver;
    private long updateDownloadId = -1L;
    private File updateApkFile;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getBridge().getWebView().addJavascriptInterface(new UpdateBridge(), "KexuUpdater");
        getBridge().getWebView().postDelayed(this::publishSystemBarInsets, 250);
    }

    @Override
    public void onDestroy() {
        unregisterUpdateReceiver();
        updateExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override
    public void onResume() {
        super.onResume();
        setupBackCallback();
    }

    @Override
    public void onPause() {
        teardownBackCallback();
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(hasWindowFocus);
        if (hasWindowFocus) getBridge().getWebView().postDelayed(this::publishSystemBarInsets, 100);
    }

    private void setupBackCallback() {
        if (backCallbackRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        backCallback = this::sendBackEvent;
        getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            OnBackInvokedDispatcher.PRIORITY_OVERLAY,
            backCallback
        );
        backCallbackRegistered = true;
    }

    private void teardownBackCallback() {
        if (!backCallbackRegistered || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        backCallbackRegistered = false;
        backCallback = null;
    }

    private void sendBackEvent() {
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            getBridge().getWebView().evaluateJavascript(
                "window.onNativeBackEvent && window.onNativeBackEvent();",
                null
            );
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
            + "document.documentElement.classList.add('native-android');"
            + "window.__kexuNativeBackBridge = true;";
        getBridge().getWebView().evaluateJavascript(script, null);
    }

    private final class UpdateBridge {
        @JavascriptInterface
        public void checkForUpdate() {
            fetchLatestRelease();
        }

        @JavascriptInterface
        public void downloadAndInstall(String downloadUrl) {
            runOnUiThread(() -> startApkDownload(downloadUrl));
        }

        @JavascriptInterface
        public void requestInstallPermission() {
            runOnUiThread(MainActivity.this::requestUnknownSourcesPermission);
        }
    }

    private void fetchLatestRelease() {
        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(
                    "https://api.github.com/repos/cyj4580zrq-afk/kexu/releases?per_page=20"
                ).openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "Kexu-Android-Updater");
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("更新服务返回 " + connection.getResponseCode());
                }
                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
                JSONArray releases = new JSONArray(body.toString());
                JSONObject release = null;
                JSONObject apk = null;
                for (int releaseIndex = 0; releaseIndex < releases.length() && apk == null; releaseIndex++) {
                    JSONObject candidateRelease = releases.optJSONObject(releaseIndex);
                    JSONArray assets = candidateRelease == null ? null : candidateRelease.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int assetIndex = 0; assetIndex < assets.length(); assetIndex++) {
                        JSONObject candidate = assets.optJSONObject(assetIndex);
                        if (candidate != null && candidate.optString("name").endsWith(".apk")) {
                            release = candidateRelease;
                            apk = candidate;
                            break;
                        }
                    }
                }
                if (apk == null) throw new IllegalStateException("最新版本未附带 Android 安装包");
                dispatchUpdateEvent(new JSONObject()
                    .put("type", "release")
                    .put("version", release.optString("tag_name"))
                    .put("notes", release.optString("body"))
                    .put("releaseUrl", release.optString("html_url"))
                    .put("downloadUrl", apk.optString("browser_download_url"))
                    .put("fileName", apk.optString("name"))
                );
            } catch (Exception error) {
                dispatchUpdateEvent(updateEvent("error", error.getMessage() == null ? "无法连接更新服务" : error.getMessage()));
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void startApkDownload(String downloadUrl) {
        if (downloadUrl == null || !downloadUrl.startsWith("https://")) {
            dispatchUpdateEvent(updateEvent("error", "更新地址无效"));
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            dispatchUpdateEvent(updateEvent("permission_required"));
            return;
        }
        File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (directory == null) {
            dispatchUpdateEvent(updateEvent("error", "无法创建更新文件"));
            return;
        }
        updateApkFile = new File(directory, "Kexu-update.apk");
        if (updateApkFile.exists() && !updateApkFile.delete()) {
            dispatchUpdateEvent(updateEvent("error", "无法替换旧安装包"));
            return;
        }
        downloadManager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(downloadUrl))
            .setTitle("课序更新包")
            .setDescription("下载完成后将打开系统安装页")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "Kexu-update.apk");
        updateDownloadId = downloadManager.enqueue(request);
        registerUpdateReceiver();
        dispatchUpdateEvent(updateEvent("downloading"));
    }

    private void registerUpdateReceiver() {
        unregisterUpdateReceiver();
        updateDownloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (completedId != updateDownloadId) return;
                handleDownloadComplete();
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateDownloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateDownloadReceiver, filter);
        }
    }

    private void unregisterUpdateReceiver() {
        if (updateDownloadReceiver == null) return;
        try {
            unregisterReceiver(updateDownloadReceiver);
        } catch (IllegalArgumentException ignored) {
            // The receiver may already have been removed after a completed download.
        }
        updateDownloadReceiver = null;
    }

    private void handleDownloadComplete() {
        Cursor cursor = downloadManager.query(new DownloadManager.Query().setFilterById(updateDownloadId));
        int status = DownloadManager.STATUS_FAILED;
        if (cursor != null) {
            try {
                if (cursor.moveToFirst()) status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            } finally {
                cursor.close();
            }
        }
        unregisterUpdateReceiver();
        if (status != DownloadManager.STATUS_SUCCESSFUL || updateApkFile == null || !updateApkFile.exists()) {
            dispatchUpdateEvent(updateEvent("error", "更新包下载失败"));
            return;
        }
        openSystemInstaller();
    }

    private void requestUnknownSourcesPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
            dispatchUpdateEvent(updateEvent("ready"));
            return;
        }
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
        intent.setData(Uri.parse("package:" + getPackageName()));
        startActivity(intent);
    }

    private void openSystemInstaller() {
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", updateApkFile);
            Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(apkUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            dispatchUpdateEvent(updateEvent("installing"));
        } catch (Exception error) {
            dispatchUpdateEvent(updateEvent("error", "无法打开系统安装页：" + error.getMessage()));
        }
    }

    private JSONObject updateEvent(String type) {
        return updateEvent(type, null);
    }

    private JSONObject updateEvent(String type, String message) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("type", type);
            if (message != null) payload.put("message", message);
        } catch (Exception ignored) {
            // A fallback empty JSON object is safer than losing an updater callback.
        }
        return payload;
    }

    private void dispatchUpdateEvent(JSONObject payload) {
        runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            String script = "window.onKexuUpdateEvent && window.onKexuUpdateEvent(" + payload + ");";
            getBridge().getWebView().evaluateJavascript(script, null);
        });
    }
}
