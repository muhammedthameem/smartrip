import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, repository, configured } from "./repository";

/**
 * Parse and clean any Supabase authentication errors from URL hash or query params
 * (e.g. #error=unauthorized_client&error_description=JWT+expired)
 */
export function parseAndClearAuthUrl() {
  if (typeof window === "undefined") return null;
  let authError = null;

  try {
    // 1. Check hash fragment: e.g. #error=unauthorized_client&error_description=JWT+expired
    if (window.location.hash) {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      if (params.has("error") || params.has("error_description")) {
        const desc = params.get("error_description") || params.get("error");
        authError = desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : "Authentication error";
      }
    }

    // 2. Check query string: e.g. ?error=...&error_description=...
    if (!authError && window.location.search) {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has("error") || searchParams.has("error_description")) {
        const desc = searchParams.get("error_description") || searchParams.get("error");
        authError = desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : "Authentication error";
      }
    }

    // Clean up the URL so the browser address bar stays clean
    if (authError || (window.location.hash && window.location.hash.includes("error"))) {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  } catch {}

  return authError;
}

/**
 * Convert raw Supabase JWT/auth technical errors into clear, friendly guidance
 */
export function formatAuthError(msg) {
  if (!msg) return "";
  const lower = String(msg).toLowerCase();
  if (
    lower.includes("jwt expired") ||
    lower.includes("token has expired") ||
    lower.includes("invalid token") ||
    lower.includes("refresh_token_not_found")
  ) {
    return "Your login session or verification link has expired. Please sign in with your email and password.";
  }
  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credentials")
  ) {
    return "Incorrect email or password. Please try again.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email address before signing in, or check your spam folder.";
  }
  return msg;
}

const Context = import.meta.hot?.data.context || createContext();
if (import.meta.hot) import.meta.hot.data.context = Context;
export const useApp = () => useContext(Context);
export function Provider({ children }) {
  const [demo, setDemo] = useState(
      sessionStorage.getItem("smarttrip-demo") === "yes",
    ),
    [session, setSession] = useState(null),
    [profile, setProfile] = useState(null),
    [loading, setLoading] = useState(configured),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [toast, setToast] = useState("");
  useEffect(() => {
    // 1. Check and clean any error in the URL (like #error_description=JWT+expired)
    const urlAuthError = parseAndClearAuthUrl();
    if (urlAuthError) {
      setError(formatAuthError(urlAuthError));
      // Wipe stale local session token so it doesn't get stuck in a loop
      if (supabase) {
        supabase.auth.signOut().catch(() => {});
      }
    }

    if (!supabase) return;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) {
          const friendly = formatAuthError(error.message);
          setError(friendly);
          if (error.message?.toLowerCase().includes("jwt expired")) {
            supabase.auth.signOut().catch(() => {});
          }
        }
        setSession(data?.session || null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setProfile(null);
      if (s) setError("");
    });
    return () => data?.subscription?.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || demo) return;
    let active = true;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (active) {
          setProfile(data);
          if (error) setError(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [session, demo, version]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const api = useMemo(
    () => repository(demo, profile?.org_id),
    [demo, profile?.org_id],
  );
  const enterDemo = () => {
    sessionStorage.setItem("smarttrip-demo", "yes");
    setDemo(true);
  };
  const signOut = async () => {
    if (!demo) await supabase.auth.signOut();
    sessionStorage.removeItem("smarttrip-demo");
    setDemo(false);
    setProfile(null);
  };
  return (
    <Context.Provider
      value={{
        demo,
        session,
        profile,
        loading,
        error,
        api,
        version,
        refresh: () => setVersion((v) => v + 1),
        notify: setToast,
        enterDemo,
        signOut,
      }}
    >
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
export function useList(table, options = {}) {
  const { api, version } = useApp(),
    [state, setState] = useState({
      rows: [],
      count: 0,
      loading: true,
      error: "",
    });
  const key = JSON.stringify(options);
  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    api
      .list(table, JSON.parse(key))
      .then((r) => active && setState({ ...r, loading: false, error: "" }))
      .catch(
        (e) =>
          active &&
          setState({ rows: [], count: 0, loading: false, error: e.message }),
      );
    return () => {
      active = false;
    };
  }, [api, table, key, version]);
  return state;
}
export function useDebounce(value) {
  const [v, set] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => set(value), 250);
    return () => clearTimeout(t);
  }, [value]);
  return v;
}
