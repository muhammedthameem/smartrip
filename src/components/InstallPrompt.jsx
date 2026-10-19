import React, { useEffect, useState, useCallback } from "react";
import {
  Download,
  Smartphone,
  Share,
  SquarePlus,
  X,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Apple,
} from "lucide-react";
import { Button } from "./ui";

/**
 * Check if the application is currently running as an installed PWA.
 * If installed, the install popup is NEVER shown.
 */
export function isAppInstalled() {
  if (typeof window === "undefined") return false;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const isIOSStandalone = window.navigator.standalone === true;
  const isAndroidApp =
    document.referrer && document.referrer.includes("android-app://");
  return Boolean(isStandalone || isIOSStandalone || isAndroidApp);
}

/**
 * Detect mobile platform: "android" | "ios" | null
 */
export function getMobilePlatform() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isAndroid) return "android";
  if (isIOS) return "ios";
  return null;
}

export default function InstallPrompt() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState(null); // 'android' | 'ios'
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [showAndroidManualHelp, setShowAndroidManualHelp] = useState(false);

  useEffect(() => {
    // 1. If already installed on phone in standalone mode, DO NOT SHOW POPUP
    if (isAppInstalled()) {
      return;
    }

    const detectedPlatform = getMobilePlatform();
    setPlatform(detectedPlatform);

    // 2. Check if user recently cancelled/dismissed the prompt (48h snooze)
    const dismissedUntil = localStorage.getItem("smarttrip_install_dismissed_until");
    const isDismissed = dismissedUntil && Number(dismissedUntil) > Date.now();

    // 3. Capture Android / Chromium beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Only auto-open if mobile phone, not installed, and not snoozed
      if (!isAppInstalled() && detectedPlatform === "android" && !isDismissed) {
        // Smooth 2-second delay after load
        setTimeout(() => {
          if (!isAppInstalled()) {
            setOpen(true);
          }
        }, 2000);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Also listen for appinstalled event
    const handleAppInstalled = () => {
      localStorage.setItem("smarttrip_pwa_installed", "true");
      setOpen(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // 4. iOS Safari doesn't have beforeinstallprompt.
    // Show iOS home screen guide if on iPhone/iPad Safari, not installed, and not snoozed
    if (detectedPlatform === "ios" && !isAppInstalled() && !isDismissed) {
      const iosTimer = setTimeout(() => {
        if (!isAppInstalled()) {
          setOpen(true);
        }
      }, 2500);
      return () => {
        clearTimeout(iosTimer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
      };
    }

    // 5. Allow manual trigger from Settings page or preview testing
    const handleCustomTrigger = (e) => {
      const targetPlatform = e?.detail?.platform || detectedPlatform || "android";
      setPlatform(targetPlatform);
      setOpen(true);
      setShowAndroidManualHelp(false);
    };
    window.addEventListener("smarttrip-open-install-prompt", handleCustomTrigger);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("smarttrip-open-install-prompt", handleCustomTrigger);
    };
  }, []);

  // Handle Cancel / Dismiss button
  const handleCancel = () => {
    setOpen(false);
    // Snooze for 48 hours so the user isn't spammed every page reload
    localStorage.setItem(
      "smarttrip_install_dismissed_until",
      String(Date.now() + 48 * 60 * 60 * 1000)
    );
  };

  // Handle Android Install button
  const handleAndroidInstall = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === "accepted") {
          localStorage.setItem("smarttrip_pwa_installed", "true");
          setOpen(false);
        }
      } catch (err) {
        console.warn("Install prompt error:", err);
      } finally {
        setInstalling(false);
        setDeferredPrompt(null);
      }
    } else {
      // In case beforeinstallprompt hasn't fired or user is on Firefox/other Android browser
      setShowAndroidManualHelp(true);
    }
  };

  // If already installed or popup closed, render nothing
  if (!open || isAppInstalled()) {
    return null;
  }

  const isAndroid = platform === "android";
  const isIOS = platform === "ios";

  return (
    <div
      className="install-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-dialog-title"
    >
      <div className="install-modal-card">
        {/* Top bar with icon badge & dismiss */}
        <div className="install-modal-top">
          <div className="install-app-icon-wrap">
            <img
              src="/icon-192.png"
              alt="SmartTrip App"
              className="install-app-icon-img"
              onError={(e) => {
                // Fallback to SVG icon
                e.target.src = "/icon.svg";
              }}
            />
            <span className="install-app-status-badge">
              <Sparkles size={11} />
            </span>
          </div>

          <div className="install-modal-badge-group">
            <span className="install-chip-badge">
              {isIOS ? (
                <>
                  <Apple size={12} /> iOS Web App
                </>
              ) : (
                <>
                  <Smartphone size={12} /> Android App
                </>
              )}
            </span>
          </div>

          <button
            type="button"
            className="install-close-btn"
            onClick={handleCancel}
            aria-label="Cancel and close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content body */}
        <div className="install-content">
          <h2 id="install-dialog-title" className="install-title">
            {isIOS
              ? "Add SmartTrip to Home Screen"
              : "Install SmartTrip on your phone"}
          </h2>
          <p className="install-desc">
            {isIOS
              ? "Create a 1-tap shortcut on your iPhone home screen for an ultra-fast, fullscreen workspace."
              : "Install the SmartTrip app directly to your home screen for quick offline access and high-speed operations."}
          </p>

          {/* Key perks */}
          <div className="install-benefits-list">
            <div className="install-benefit-item">
              <CheckCircle2 size={15} className="benefit-icon" />
              <span>Instant 1-tap launch from home screen</span>
            </div>
            <div className="install-benefit-item">
              <CheckCircle2 size={15} className="benefit-icon" />
              <span>Full-screen view with zero browser clutter</span>
            </div>
            <div className="install-benefit-item">
              <CheckCircle2 size={15} className="benefit-icon" />
              <span>Offline-ready & faster data synchronization</span>
            </div>
          </div>

          {/* iOS Specific Instructions Card */}
          {isIOS && (
            <div className="install-steps-card">
              <div className="install-steps-title">
                <span>3 Quick Steps in Safari:</span>
              </div>
              <ol className="install-steps-list">
                <li className="install-step">
                  <span className="step-num">1</span>
                  <span className="step-text">
                    Tap the <strong>Share</strong> button{" "}
                    <span className="ios-pill">
                      <Share size={13} />
                    </span>{" "}
                    at the bottom of Safari.
                  </span>
                </li>
                <li className="install-step">
                  <span className="step-num">2</span>
                  <span className="step-text">
                    Scroll down and tap{" "}
                    <strong>
                      Add to Home Screen{" "}
                      <span className="ios-pill">
                        <SquarePlus size={13} />
                      </span>
                    </strong>
                    .
                  </span>
                </li>
                <li className="install-step">
                  <span className="step-num">3</span>
                  <span className="step-text">
                    Tap <strong>Add</strong> at top right. SmartTrip is ready on your home screen!
                  </span>
                </li>
              </ol>
            </div>
          )}

          {/* Android Manual Steps if browser doesn't expose deferred prompt */}
          {isAndroid && showAndroidManualHelp && (
            <div className="install-steps-card">
              <div className="install-steps-title">
                <span>Add shortcut via Chrome menu:</span>
              </div>
              <ol className="install-steps-list">
                <li className="install-step">
                  <span className="step-num">1</span>
                  <span className="step-text">
                    Tap the <strong>Menu (⋮)</strong> icon at top right in Chrome.
                  </span>
                </li>
                <li className="install-step">
                  <span className="step-num">2</span>
                  <span className="step-text">
                    Select <strong>“Install app”</strong> or <strong>“Add to Home screen”</strong>.
                  </span>
                </li>
                <li className="install-step">
                  <span className="step-num">3</span>
                  <span className="step-text">
                    Confirm <strong>Install</strong> to place the SmartTrip shortcut.
                  </span>
                </li>
              </ol>
            </div>
          )}

          <div className="install-safe-row">
            <ShieldCheck size={14} color="#165b49" />
            <span>Lightweight PWA • No storage bloat • Auto updates</span>
          </div>
        </div>

        {/* Action buttons: Install & Cancel */}
        <div className="install-actions">
          <Button
            type="button"
            variant="secondary"
            className="btn-install-cancel"
            onClick={handleCancel}
          >
            Cancel
          </Button>

          {isAndroid ? (
            <Button
              type="button"
              className="btn-install-primary"
              onClick={handleAndroidInstall}
              disabled={installing}
            >
              <Download size={16} />
              <span>{installing ? "Installing…" : "Install App"}</span>
            </Button>
          ) : (
            <Button
              type="button"
              className="btn-install-primary"
              onClick={handleCancel}
            >
              <CheckCircle2 size={16} />
              <span>Got it, I'll add it</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
