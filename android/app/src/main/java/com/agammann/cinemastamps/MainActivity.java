package com.agammann.cinemastamps;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.View;
import android.webkit.*;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    // Packaged assets are intercepted locally. HTTP allows media from the trusted LAN hub.
    private static final String ORIGIN = "http://appassets.androidplatform.net/";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        web = new WebView(this);
        web.setBackgroundColor(0xff111310);
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Exports(), "CinemaNative");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep the JavaScript bridge restricted to our packaged application.
                if (request.getUrl().toString().startsWith(ORIGIN)) return false;
                if (request.isForMainFrame()) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                    catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "Open this link on your phone.", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!request.getUrl().toString().startsWith(ORIGIN)) return null;
                String relative = request.getUrl().getPath();
                if (relative == null || relative.equals("/")) relative = "/index.html";
                if (relative.contains("..")) return new WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                try {
                    String file = "web" + relative;
                    InputStream stream = getAssets().open(file);
                    String mime = relative.endsWith(".js") ? "application/javascript" : relative.endsWith(".css") ? "text/css" : relative.endsWith(".mp4") ? "video/mp4" : relative.endsWith(".jpg") ? "image/jpeg" : relative.endsWith(".png") ? "image/png" : relative.endsWith(".svg") ? "image/svg+xml" : relative.endsWith(".woff2") ? "font/woff2" : relative.endsWith(".woff") ? "font/woff" : "text/html";
                    Map<String,String> headers = new HashMap<>();
                    headers.put("Access-Control-Allow-Origin", ORIGIN.substring(0, ORIGIN.length()-1));
                    headers.put("Accept-Ranges", "bytes");
                    int length = stream.available();
                    String range = request.getRequestHeaders().get("Range");
                    if (range != null && relative.endsWith(".mp4") && range.matches("bytes=\\d+-\\d*")) {
                        String[] bounds = range.substring(6).split("-", -1);
                        long start = Long.parseLong(bounds[0]);
                        long end = bounds[1].isEmpty() ? length - 1L : Math.min(Long.parseLong(bounds[1]), length - 1L);
                        if (start >= length || end < start) { stream.close(); headers.put("Content-Range", "bytes */" + length); return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0])); }
                        long skipped = 0; while (skipped < start) { long n = stream.skip(start - skipped); if (n <= 0) break; skipped += n; }
                        headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
                        headers.put("Content-Length", String.valueOf(end - start + 1));
                        return new WebResourceResponse(mime, null, 206, "Partial Content", headers, new LimitedStream(stream, end - start + 1));
                    }
                    headers.put("Content-Length", String.valueOf(length));
                    return new WebResourceResponse(mime, mime.startsWith("text/") || mime.equals("application/javascript") ? "utf-8" : null, 200, "OK", headers, stream);
                } catch (Exception e) { return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream("Not found".getBytes(StandardCharsets.UTF_8))); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try { startActivityForResult(params.createIntent(), 10); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; Toast.makeText(MainActivity.this, "Pair your phone to send a video.", Toast.LENGTH_LONG).show(); }
                return true;
            }
        });
        web.loadUrl(ORIGIN + "index.html");
    }
    private static class LimitedStream extends FilterInputStream {
        long remaining;
        LimitedStream(InputStream input, long count) { super(input); remaining = count; }
        @Override public int read() throws IOException { if (remaining <= 0) return -1; int n = super.read(); if (n >= 0) remaining--; return n; }
        @Override public int read(byte[] b, int off, int len) throws IOException { if (remaining <= 0) return -1; int n = in.read(b, off, (int)Math.min(len, remaining)); if (n > 0) remaining -= n; return n; }
    }
    public class Exports {
        @JavascriptInterface public void exitApp() { runOnUiThread(() -> finish()); }
        @JavascriptInterface public String exportReview(String content, String format) {
            if (!Arrays.asList("csv", "json", "md").contains(format) || content.length() > 4_000_000) return "ERROR: Invalid report.";
            try {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), "reviews");
                if (!dir.exists() && !dir.mkdirs()) return "ERROR: Could not create reports folder.";
                File output = new File(dir, "cinemastamps-" + System.currentTimeMillis() + "." + format);
                try (FileOutputStream out = new FileOutputStream(output)) { out.write(content.getBytes(StandardCharsets.UTF_8)); }
                return "Saved " + output.getName() + ". Pair your phone for an easy download.";
            } catch (IOException e) { return "ERROR: Could not save report."; }
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 10 && fileCallback != null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileCallback = null; }
    }
    @Override public boolean dispatchKeyEvent(KeyEvent event) {
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK: key = "Escape"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_MEDIA_PLAY: case KeyEvent.KEYCODE_MEDIA_PAUSE: key = "MediaPlayPause"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND: key = "MediaRewind"; break;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: key = "MediaFastForward"; break;
        }
        if (key != null) { if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) web.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key + "',bubbles:true}))", null); return true; }
        return super.dispatchKeyEvent(event);
    }
    @Override protected void onPause() { super.onPause(); web.evaluateJavascript("var v=document.querySelector('video');if(v)v.pause()", null); web.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { if (web != null) { web.removeJavascriptInterface("CinemaNative"); web.destroy(); } super.onDestroy(); }
}
