import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase, repository, configured } from "./repository";
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
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s);
      setProfile(null);
    });
    return () => data.subscription.unsubscribe();
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
