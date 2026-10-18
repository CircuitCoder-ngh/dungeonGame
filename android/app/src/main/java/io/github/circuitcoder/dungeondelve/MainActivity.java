package io.github.circuitcoder.dungeondelve;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Fullscreen, landscape-only game host.
 *
 * - Immersive sticky mode: status + navigation bars hidden; a swipe from the edge reveals
 *   them temporarily (they auto-hide again).
 * - Draws into the display cutout (camera punch-hole) on the short edges.
 * - Keeps the screen on while the game is in the foreground.
 * - The WebView fills the whole window (Capacitor's SystemBars insets handling is
 *   disabled in capacitor.config.ts, so the WebView is never padded).
 */
public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = window.getAttributes();
            attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(attrs);
        }

        // Lay out behind the system bars (edge-to-edge) so the content uses the full display.
        WindowCompat.setDecorFitsSystemWindows(window, false);

        hideSystemBars();
    }

    @Override
    public void onResume() {
        super.onResume();
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemBars();
        }
    }

    private void hideSystemBars() {
        Window window = getWindow();
        View decorView = window.getDecorView();
        applyImmersive(window, decorView);
        // Re-apply after any pending main-thread work (e.g. plugin start-up) has run.
        decorView.post(() -> applyImmersive(window, decorView));
    }

    private static void applyImmersive(Window window, View decorView) {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decorView);
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
