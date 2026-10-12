import React, { useState } from "react";
import { Navigation, ArrowRight, ShieldCheck } from "lucide-react";
import { useApp } from "../lib/context";
import { supabase, configured } from "../lib/repository";
import { Button, Field } from "../components/ui";
export default function Login() {
  const { enterDemo, session, refresh, error: sessionError } = useApp(),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [business, setBusiness] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
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
        if (signup)
          setMessage("Check your email to confirm your account, then sign in.");
      }
    } catch (e) {
      setMessage(e.message);
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
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete={signup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
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
        {configured && !session && (
          <Button variant="text" onClick={() => setSignup(!signup)}>
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
