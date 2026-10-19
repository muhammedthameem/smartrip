import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

function getGitInfo() {
  let commitHash = (
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SUPABASE_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.COMMIT_REF ||
    ""
  ).slice(0, 7);
  let commitMessage =
    process.env.GITHUB_COMMIT_MESSAGE ||
    process.env.VERCEL_GIT_COMMIT_MESSAGE ||
    "";
  let commitDate = "";
  let recentCommits = [];

  try {
    if (!commitHash) {
      commitHash = execSync("git rev-parse --short HEAD").toString().trim();
    }
    if (!commitMessage) {
      commitMessage = execSync("git log -1 --pretty=%s").toString().trim();
    }
    commitDate = execSync("git log -1 --pretty=%cI").toString().trim();
  } catch {}

  try {
    const logs = execSync('git log -5 --pretty=format:"%h%x09%s%x09%cI"')
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [hash, msg, date] = line.split("\t");
        return { hash: hash?.trim(), msg: msg?.trim(), date: date?.trim() };
      });
    recentCommits = logs;
  } catch {}

  if (!commitHash) commitHash = "latest";
  if (!commitMessage) commitMessage = "Latest updates and enhancements";

  return { commitHash, commitMessage, commitDate, recentCommits };
}

const buildTimestamp = Date.now();
const gitInfo = getGitInfo();

const versionPayload = {
  version: process.env.npm_package_version || "0.1.0",
  commitHash: gitInfo.commitHash,
  commitMessage: gitInfo.commitMessage,
  commitDate: gitInfo.commitDate,
  recentCommits: gitInfo.recentCommits,
  buildTime: buildTimestamp,
  updatedAt: new Date(buildTimestamp).toISOString(),
};

function versionTrackerPlugin() {
  return {
    name: "version-tracker",
    buildStart() {
      // In production builds, make sure public/version.json is updated
      if (process.env.NODE_ENV === "production") {
        try {
          const pubDir = path.resolve(process.cwd(), "public");
          if (fs.existsSync(pubDir)) {
            fs.writeFileSync(
              path.join(pubDir, "version.json"),
              JSON.stringify(versionPayload, null, 2)
            );
          }
        } catch {}
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || "").split("?")[0];
        if (pathname === "/version.json") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.end(JSON.stringify(versionPayload, null, 2));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(versionPayload, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionTrackerPlugin()],
  define: {
    __APP_BUILD_TIME__: JSON.stringify(buildTimestamp),
    __APP_COMMIT_HASH__: JSON.stringify(gitInfo.commitHash),
    __APP_COMMIT_MSG__: JSON.stringify(gitInfo.commitMessage),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || "0.1.0"),
  },
  build: { chunkSizeWarningLimit: 450 },
});

