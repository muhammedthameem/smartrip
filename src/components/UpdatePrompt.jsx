import React, { useEffect, useState, useCallback, useRef } from "react";
import { Sparkles, RefreshCw, X, ArrowRight, Zap } from "lucide-react";
import { Button } from "./ui";

export default function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  const initialBuildTimeRef = useRef(
    typeof __APP_BUILD_TIME__ !== "undefined" ? Number(__APP_BUILD_TIME__) : null
  );

  const checkVersion = useCallback(async (isManual = false) => {
    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return false;
      const data = await res.json();
      
      // If we don't have an initial build time yet, record it
      if (!initialBuildTimeRef.current && data.buildTime) {
        initialBuildTimeRef.current = Number(data.buildTime);
        return false;
      }

      // Check if server's build time is newer than current app build time
      if (
        data.buildTime &&
        initialBuildTimeRef.current &&
        Number(data.buildTime) > initialBuildTimeRef.current
      ) {
        setVersionInfo(data);
        setUpdateAvailable(true);
        setDismissed(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // 1. Initial check after 2 seconds
    const initialTimer = setTimeout(() => {
      checkVersion();
    }, 2000);

    // 2. Periodic poll every 30 seconds
    const interval = setInterval(() => {
      checkVersion();
    }, 30000);

    // 3. Check on tab focus or visibility change
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    // 4. Service Worker update check
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        // Periodically ping SW update
        const swInterval = setInterval(() => {
          reg.update().catch(() => {});
        }, 60000);

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdateAvailable(true);
                setDismissed(false);
              }
            });
          }
        });

        return () => clearInterval(swInterval);
      }).catch(() => {});
    }

    // 5. Custom event for manual checks (e.g. from Settings)
    const handleManualCheck = (e) => {
      if (e?.detail?.simulate) {
        setUpdateAvailable(true);
        setDismissed(false);
      } else {
        checkVersion(true);
      }
    };
    window.addEventListener("smarttrip-check-update", handleManualCheck);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
      window.removeEventListener("smarttrip-check-update", handleManualCheck);
    };
  }, [checkVersion]);

  const handleUpdateNow = async () => {
    setUpdating(true);
    try {
      // Notify waiting service worker to take over
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          await reg.update().catch(() => {});
        }
      }
      // Clear HTTP / cache storage to guarantee fresh assets
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("Update cleanup notice:", err);
    } finally {
      // Reload the application from server
      setTimeout(() => {
        window.location.reload();
      }, 250);
    }
  };

  if (!updateAvailable) return null;

  // If dismissed, show a sleek floating update pill in the bottom corner
  if (dismissed) {
    return (
      <div className="update-pill-container" role="region" aria-label="App update available">
        <button
          type="button"
          className="update-pill-btn"
          onClick={() => setDismissed(false)}
          title="Click to view update details"
        >
          <span className="update-pill-glow" />
          <Sparkles size={16} />
          <span>New update ready</span>
          <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="update-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div className="update-modal-card">
        <div className="update-modal-top">
          <div className="update-icon-box">
            <Sparkles size={24} />
          </div>
          <span className="update-chip-badge">
            <Zap size={13} /> LATEST RELEASE AVAILABLE
          </span>
          <button
            type="button"
            className="update-close-btn"
            onClick={() => setDismissed(true)}
            aria-label="Remind me later"
          >
            <X size={18} />
          </button>
        </div>

        <div className="update-content">
          <h2 id="update-title">Some features and updates are available</h2>
          <p>
            A new version of SmartTrip has been pushed to the server. Update now
            to smoothly refresh your workspace with the latest features, speed improvements, and fixes.
          </p>

          <div className="update-highlights">
            <div className="update-item">
              <span className="dot" />
              <div>
                <b>Fresh Features & Improvements</b>
                <small>New capabilities and refined workflows ready to use</small>
              </div>
            </div>
            <div className="update-item">
              <span className="dot" />
              <div>
                <b>Performance & Stability</b>
                <small>Faster navigation and optimized client storage</small>
              </div>
            </div>
            <div className="update-item">
              <span className="dot" />
              <div>
                <b>Instant Safe Refresh</b>
                <small>App reloads seamlessly; your stored records remain secure</small>
              </div>
            </div>
          </div>
        </div>

        <div className="update-actions">
          <Button
            variant="secondary"
            onClick={() => setDismissed(true)}
            disabled={updating}
          >
            Later
          </Button>
          <Button
            onClick={handleUpdateNow}
            disabled={updating}
            className="btn-update-primary"
          >
            <RefreshCw size={17} className={updating ? "animate-spin" : ""} />
            {updating ? "Updating & refreshing…" : "Update now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
