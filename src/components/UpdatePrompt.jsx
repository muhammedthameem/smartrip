import React, { useEffect, useState, useCallback } from "react";
import { Sparkles, RefreshCw, X, ArrowRight, Zap, GitCommit, GitBranch, ShieldCheck } from "lucide-react";
import { Button } from "./ui";

const currentCommit = typeof __APP_COMMIT_HASH__ !== "undefined" ? __APP_COMMIT_HASH__ : null;
const currentBuildTime = typeof __APP_BUILD_TIME__ !== "undefined" ? Number(__APP_BUILD_TIME__) : null;

export default function UpdatePrompt() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);

  const checkVersion = useCallback(async (isManual = false) => {
    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) return false;
      const data = await res.json();

      // 1. If server commit matches the running app's commit, we are already fully updated!
      if (
        data.commitHash &&
        currentCommit &&
        data.commitHash !== "latest" &&
        data.commitHash === currentCommit
      ) {
        setUpdateAvailable(false);
        return false;
      }

      // 2. If build time is not newer than our loaded build, no update is needed.
      if (
        data.buildTime &&
        currentBuildTime &&
        Number(data.buildTime) <= currentBuildTime
      ) {
        setUpdateAvailable(false);
        return false;
      }

      // 3. Check if user already refreshed to this exact commit in this tab session
      const lastUpdated = sessionStorage.getItem("smarttrip_updated_commit");
      if (lastUpdated && data.commitHash && lastUpdated === data.commitHash) {
        setUpdateAvailable(false);
        return false;
      }

      // A real new git commit or newer build exists!
      setVersionInfo(data);
      setUpdateAvailable(true);
      setDismissed(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    // 1. Initial check after 3 seconds
    const initialTimer = setTimeout(() => {
      checkVersion();
    }, 3000);

    // 2. Periodic poll every 45 seconds
    const interval = setInterval(() => {
      checkVersion();
    }, 45000);

    // 3. Check on tab visibility/focus
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersion();
      }
    };
    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    // 4. Service Worker update listener
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
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
                checkVersion();
              }
            });
          }
        });

        return () => clearInterval(swInterval);
      }).catch(() => {});
    }

    // 5. Custom event for manual preview or check
    const handleManualCheck = (e) => {
      if (e?.detail?.simulate) {
        setVersionInfo({
          commitHash: currentCommit ? currentCommit.slice(0, 7) : "2940963",
          commitMessage: "Fix update prompt & show latest git push changes",
          updatedAt: new Date().toISOString(),
          recentCommits: [
            { hash: currentCommit || "2940963", msg: "Fix update prompt & show latest git push changes" },
            { hash: "6ef67d4", msg: "stylefix and button styling updates" },
            { hash: "936279b", msg: "first commit" },
          ],
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

  const handleUpdateNow = async () => {
    setUpdating(true);
    try {
      if (versionInfo?.commitHash) {
        sessionStorage.setItem("smarttrip_updated_commit", versionInfo.commitHash);
      }
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: "SKIP_WAITING" });
          }
          await reg.update().catch(() => {});
        }
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (err) {
      console.warn("Update cleanup notice:", err);
    } finally {
      setTimeout(() => {
        window.location.reload();
      }, 200);
    }
  };

  if (!updateAvailable) return null;

  // Floating pill when dismissed
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
          <span>New update ready {versionInfo?.commitHash ? `(#${versionInfo.commitHash})` : ""}</span>
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
            <Zap size={13} /> GIT UPDATE AVAILABLE
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
          <h2 id="update-title">New updates pushed to SmartTrip</h2>
          <p>
            A new version has been deployed. Refresh now to smoothly update your workspace with the latest git changes.
          </p>

          <div className="update-git-box">
            <div className="update-git-header">
              <GitCommit size={16} />
              <span>Latest Git Commit</span>
              {versionInfo?.commitHash && (
                <code className="update-git-tag">#{versionInfo.commitHash}</code>
              )}
            </div>

            <div className="update-git-message">
              “{versionInfo?.commitMessage || "Latest enhancements, bug fixes, and performance updates"}”
            </div>

            {versionInfo?.recentCommits && versionInfo.recentCommits.length > 0 && (
              <div className="update-git-commits">
                <div className="update-git-title">
                  <GitBranch size={13} />
                  <span>Recent Git Changes:</span>
                </div>
                <ul className="update-commit-list">
                  {versionInfo.recentCommits.slice(0, 3).map((c, i) => (
                    <li key={c.hash || i} className="update-commit-item">
                      <code className="update-commit-hash">#{c.hash}</code>
                      <span className="update-commit-msg">{c.msg}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="update-safe-note">
            <ShieldCheck size={15} color="#165b49" />
            <span>Instant safe refresh: your active records and settings remain safe.</span>
          </div>
        </div>

        <div className="update-actions">
          <Button
            type="button"
            variant="secondary"
            className="btn-update-later"
            onClick={() => setDismissed(true)}
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
