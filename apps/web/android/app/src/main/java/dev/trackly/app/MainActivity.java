package dev.trackly.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // If a page is ever wider than the screen, scroll sideways instead of shrinking the whole
    // app to fit (which makes the phone show the desktop layout, tiny).
    WebSettings settings = getBridge().getWebView().getSettings();
    settings.setLoadWithOverviewMode(false);
  }
}
