import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Sparkles,
  RefreshCw,
  X,
  ArrowRight,
  Zap,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui";

const currentCommit =
  typeof __APP_COMMIT_HASH__ !== "undefined" && __APP_COMMIT_HASH__
    ? __APP_COMMIT_HASH__
    : null;
const currentBuildTime =
  typeof __APP_BUILD_TIME__ !== "undefined" && __APP_BUILD_TIME__
    ? Number(__APP_BUILD_TIME__)
    : null;

export default function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  const lastCheckTimeRef = useRef(0);

  // Clean cache-busting search param from URL on load
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("_v") || url.searchParams.has("_t")) {
        url.searchParams.delete("_v");
        url.searchParams.delete("_t");
        const cleanPath =
          url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash;
        window.history.replaceState({}, document.title, cleanPath);
      }
    } catch {}
  }, []);

  const checkVersion = useCallback(async (isManual = false) => {
    // 1. Skip automatic background checks in local Vite development mode
    if (!isManual && import.meta.env.DEV) {
      return false;
    }

    // Rate-limit checks to avoid rapid repeat requests
    const now = Date.now();
    if (!isManual && now - lastCheckTimeRef.current < 60000) {
      return false;
    }
    lastCheckTimeRef.current = now;

    try {
      const res = await fetch(`/version.json?_t=${now}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
      });
      if (!res.ok) return false;
      const data = await res.json();

      const serverCommit = data.commitHash && data.commitHash !== "latest" ? data.commitHash : null;
      const serverBuildTime = data.buildTime ? Number(data.buildTime) : null;

      // 2. Check if user ALREADY applied this commit or build in this browser
      const appliedCommit = localStorage.getItem("smarttrip_applied_commit");
      const appliedBuildTime = localStorage.getItem("smarttrip_applied_build_time");

      if (serverCommit && appliedCommit && serverCommit === appliedCommit) {
        setUpdateAvailable(false);
        return false;
      }
      if (serverBuildTime && appliedBuildTime && String(serverBuildTime) === appliedBuildTime) {
        setUpdateAvailable(false);
        return false;
      }

      // 3. If server commit matches the running app's commit, we are already fully updated!
      if (serverCommit && currentCommit && serverCommit === currentCommit) {
        setUpdateAvailable(false);
        return false;
      }

      // 4. Determine if there is truly a new git push or deployment:
      let isNewPush = false;

      if (serverCommit && currentCommit && serverCommit !== currentCommit) {
        // Genuine new git push detected!
        isNewPush = true;
      } else if (serverBuildTime && currentBuildTime) {
        // Fallback for hosting where commit SHA isn't embedded:
        // Only trigger if server build is at least 60 seconds newer than running build
        if (serverBuildTime - currentBuildTime > 60000) {
          isNewPush = true;
        }
      }

      if (!isNewPush) {
        setUpdateAvailable(false);
        return false;
      }

      // 5. Check if user already dismissed this specific commit in this session
      const dismissedCommit = sessionStorage.getItem("smarttrip_dismissed_commit");
      const isAlreadyDismissed =
        (serverCommit && dismissedCommit === serverCommit) ||
        (serverBuildTime && sessionStorage.getItem("smarttrip_dismissed_build") === String(serverBuildTime));

      setVersionInfo(data);
      setUpdateAvailable(true);
      if (isAlreadyDismissed) {
        // Respect dismissal; do not pop back up in a loop!
        setDismissed(true);
      } else {
        setDismissed(false);
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // 1. Initial check after 5 seconds
    const initialTimer = setTimeout(() => {
      checkVersion();
    }, 5000);

    // 2. Periodic poll every 5 minutes (300,000ms) - avoid aggressive loops
    const interval = setInterval(() => {
      checkVersion();
    }, 300000);

    // 3. Check on tab visibility/focus (rate-limited via lastCheckTimeRef)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    // 4. Service Worker update listener
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => {
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  checkVersion();
                }
              });
            }
          });
        })
        .catch(() => {});
    }

    // 5. Custom event for manual check or preview from Settings
    const handleManualCheck = (e) => {
      if (e?.detail?.simulate) {
        setVersionInfo({
          commitHash: currentCommit ? currentCommit.slice(0, 7) : "735a9fe",
          commitMessage: "Performance improvements & mobile shortcut enhancements",
          updatedAt: new Date().toISOString(),
        });
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

  const handleDismiss = () => {
    setDismissed(true);
    if (versionInfo?.commitHash) {
      sessionStorage.setItem("smarttrip_dismissed_commit", versionInfo.commitHash);
    }
    if (versionInfo?.buildTime) {
      sessionStorage.setItem("smarttrip_dismissed_build", String(versionInfo.buildTime));
    }
  };

  const handleUpdateNow = async () => {
    setUpdating(true);
    try {
      // 1. Mark this commit/build as applied so we NEVER prompt again for it
      if (versionInfo?.commitHash) {
        localStorage.setItem("smarttrip_applied_commit", versionInfo.commitHash);
        sessionStorage.setItem("smarttrip_updated_commit", versionInfo.commitHash);
      }
      if (versionInfo?.buildTime) {
        localStorage.setItem("smarttrip_applied_build_time", String(versionInfo.buildTime));
      }

      // 2. Clear all Service Worker caches and notify SW
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          if (reg.active) {
            reg.active.postMessage({ type: "CLEAR_CACHE" });
          }
          await reg.update().catch(() => {});
        }
      }

      // 3. Clear browser cache storage
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("Update cleanup notice:", err);
    } finally {
      // 4. Force browser to reload new index.html & assets with cache-busting timestamp
      setTimeout(() => {
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set("_v", String(Date.now()));
        window.location.replace(targetUrl.toString());
      }, 250);
    }
  };

  if (!updateAvailable) return null;

  // Floating pill when dismissed
  if (dismissed) {
    return (
      <div
        className="update-pill-container"
        role="region"
        aria-label="App update available"
      >
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
    <div
      className="update-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <div className="update-modal-card">
        <div className="update-modal-top">
          <div className="update-icon-box">
            <Sparkles size={24} />
          </div>
          <span className="update-chip-badge">
            <Zap size={13} /> UPDATE AVAILABLE
          </span>
          <button
            type="button"
            className="update-close-btn"
            onClick={handleDismiss}
            aria-label="Remind me later"
          >
            <X size={18} />
          </button>
        </div>

        <div className="update-content">
          <h2 id="update-title">Update available</h2>
          <p>
            A new version of SmartTrip has been deployed. Refresh now to apply
            the latest improvements and features.
          </p>

          <div className="update-git-box">
            <div className="update-git-header">
              <Sparkles size={14} />
              <span>What's new</span>
            </div>
            <div className="update-git-message">
              “{versionInfo?.commitMessage || "Performance enhancements, bug fixes, and latest updates"}”
            </div>
          </div>

          <div className="update-safe-note">
            <ShieldCheck size={15} color="#165b49" />
            <span>
              Instant safe refresh: your active records and settings remain safe.
            </span>
          </div>
        </div>

        <div className="update-actions">
          <Button
            type="button"
            variant="secondary"
            className="btn-update-later"
            onClick={handleDismiss}
            disabled={updating}
          >
            Later
          </Button>
          <Button
            type="button"
            onClick={handleUpdateNow}
            disabled={updating}
            className="btn-update-primary"
          >
            <RefreshCw size={16} className={updating ? "animate-spin" : ""} />
            <span>{updating ? "Updating & refreshing…" : "Update now"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
