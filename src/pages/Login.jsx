import React, { useState } from "react";
import { Navigation, ArrowRight, ShieldCheck, Eye, EyeOff, KeyRound } from "lucide-react";
import { useApp, formatAuthError } from "../lib/context";
import { supabase, configured } from "../lib/repository";
import { Button, Field } from "../components/ui";

const REMEMBERED_CREDENTIALS_KEY = "smarttrip_saved_credentials";
const REMEMBER_FLAG_KEY = "smarttrip_remember_enabled";

export default function Login() {
  const { enterDemo, session, refresh, error: sessionError } = useApp();

  const [remember, setRemember] = useState(() => {
    try {
      const flag = localStorage.getItem(REMEMBER_FLAG_KEY);
      return flag === null ? true : flag === "true";
    } catch {
      return true;
    }
  });

  const [email, setEmail] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBERED_CREDENTIALS_KEY));
      return saved?.email || "";
    } catch {
      return "";
    }
  });

  const [password, setPassword] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(REMEMBERED_CREDENTIALS_KEY));
      return saved?.password || "";
    } catch {
      return "";
    }
  });

  const [showPassword, setShowPassword] = useState(false);
  const [signup, setSignup] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [business, setBusiness] = useState("");

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!email) {
      setMessage("Please enter your email address first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMessage("Password reset email sent! Check your inbox or spam folder.");
    } catch (err) {
      setMessage(formatAuthError(err.message));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (session) {
        const { error } = await supabase.rpc("create_business", {
          business_name: business,
        });
        if (error) throw error;
        refresh();
      } else {
        const { error } = signup
          ? await supabase.auth.signUp({ email, password })
          : await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        // Store or clear remembered credentials
        if (remember) {
          localStorage.setItem(REMEMBER_FLAG_KEY, "true");
          localStorage.setItem(
            REMEMBERED_CREDENTIALS_KEY,
            JSON.stringify({ email, password })
          );
        } else {
          localStorage.setItem(REMEMBER_FLAG_KEY, "false");
          localStorage.removeItem(REMEMBERED_CREDENTIALS_KEY);
        }

        if (signup)
          setMessage("Check your email to confirm your account, then sign in.");
      }
    } catch (e) {
      setMessage(formatAuthError(e.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <Navigation size={30} /> smarttrip.
        </div>
        <span className="eyebrow">LESS PAPERWORK. MORE POSSIBILITY.</span>
        <h1>
          Every journey.
          <br />
          All together.
        </h1>
        <p>
          Your trips, fleet and finances, in one calm workspace. From the first
          booking to the final payment.
        </p>
        <div className="road-art">
          <div />
          <span>A</span>
          <span>B</span>
        </div>
        <small>Built for the people who keep things moving.</small>
      </div>
      <section className="login-card">
        <span className="eyebrow">WELCOME TO SMARTTRIP</span>
        <h1>
          {session
            ? "Set up your business"
            : signup
              ? "Create your account"
              : "Your next journey starts here."}
        </h1>
        <p>
          {configured
            ? "Sign in to your secure operations workspace."
            : "Your workspace is ready for setup. Connect Supabase to enable secure sign-in and real data storage."}
        </p>
        {configured && (
          forgot ? (
            <form onSubmit={handleResetPassword}>
              <div style={{ marginBottom: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: "650", margin: "0 0 6px", color: "#182c23" }}>
                  Reset your password
                </h2>
                <p className="muted" style={{ margin: 0, fontSize: "13px", lineHeight: "1.4" }}>
                  Enter your email address and we'll send you a password reset link.
                </p>
              </div>
              <Field label="Email address">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@business.com"
                />
              </Field>
              <Button disabled={busy}>
                {busy ? "Sending link…" : "Send password reset link"}
                <ArrowRight size={17} />
              </Button>
              <div style={{ marginTop: "12px", textAlign: "center" }}>
                <Button
                  type="button"
                  variant="text"
                  onClick={() => {
                    setForgot(false);
                    setMessage("");
                  }}
                >
                  Back to Sign in
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={submit}>
              {session ? (
                <Field label="Business name">
                  <input
                    required
                    value={business}
                    onChange={(e) => setBusiness(e.target.value)}
                  />
                </Field>
              ) : (
                <>
                  <Field label="Email address">
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Field label="Password">
                    <div className="password-input-wrap">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        autoComplete={signup ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Field>

                  {!signup && !session && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-6px", marginBottom: "8px" }}>
                      <button
                        type="button"
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--green)",
                          fontSize: "12px",
                          fontWeight: "600",
                          cursor: "pointer",
                          padding: 0,
                        }}
                        onClick={() => {
                          setForgot(true);
                          setMessage("");
                        }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {!session && (
                    <div className="login-remember-row">
                      <label className="remember-checkbox-label">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRemember(checked);
                            if (!checked) {
                              localStorage.setItem(REMEMBER_FLAG_KEY, "false");
                              localStorage.removeItem(REMEMBERED_CREDENTIALS_KEY);
                            }
                          }}
                        />
                        <span>Remember password on this device</span>
                      </label>
                    </div>
                  )}
                </>
              )}
              <Button disabled={busy}>
                {busy
                  ? "Please wait…"
                  : session
                    ? "Create workspace"
                    : signup
                      ? "Create account"
                      : "Sign in"}
                <ArrowRight size={17} />
              </Button>
            </form>
          )
        )}
        {!configured && (
          <div className="setup-note">
            <ShieldCheck size={22} />
            <div>
              <b>Supabase not connected</b>
              <p>
                Setup instructions and SQL migrations are included with the
                source. No live business records are stored yet.
              </p>
            </div>
          </div>
        )}
        {(message || sessionError) && (
          <p role="alert" className="error">
            {message || sessionError}
          </p>
        )}
        {configured && !session && !forgot && (
          <Button variant="text" onClick={() => { setSignup(!signup); setMessage(""); }}>
            {signup
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </Button>
        )}
        <div className="divider">
          <span>Explore first</span>
        </div>
        <Button variant="secondary w-full" onClick={enterDemo}>
          Open demo workspace <ArrowRight size={17} />
        </Button>
        <small className="muted block mt-4">
          Demo uses fictional records, stored only in this browser.
        </small>
      </section>
    </div>
  );
}
