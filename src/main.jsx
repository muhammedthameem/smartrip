import React, { Suspense, lazy, Component } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Provider, useApp } from "./lib/context";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import { Loading } from "./components/ui";
import "./styles.css";
import UpdatePrompt from "./components/UpdatePrompt";
import InstallPrompt from "./components/InstallPrompt";
const Dashboard = lazy(() => import("./pages/Dashboard")),

  Records = lazy(() => import("./pages/Records")),
  Trips = lazy(() => import("./pages/Trips")),
  TripForm = lazy(() => import("./pages/TripForm")),
  TripDetail = lazy(() => import("./pages/TripDetail")),
  Finance = lazy(() => import("./pages/Finance")),
  Reports = lazy(() => import("./pages/Reports")),
  Settings = lazy(() => import("./pages/Settings")),
  Documents = lazy(() => import("./pages/Documents")),
  Intelligence = lazy(() => import("./pages/Intelligence")),
  Notifications = lazy(() => import("./pages/Notifications")),
  DriverTrip = lazy(() => import("./pages/DriverTrip"));
class Boundary extends Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>Something went wrong</h1>
        <p>Your saved records are safe. Reload to try again.</p>
        <button className="btn" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const { demo, session, profile, loading } = useApp();
  if (loading) return <Loading />;
  if (!demo && (!session || !profile)) return <Login />;
  if (!demo && profile?.role === "driver")
    return (
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="*" element={<DriverTrip />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    );
  if (!demo && !["admin", "staff"].includes(profile.role))
    return (
      <div className="empty">
        <h1>Access restricted</h1>
        <p>
          This release supports owner, office staff, and driver access. Client
          portals are not enabled.
        </p>
      </div>
    );
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="trips" element={<Trips />} />
            <Route path="trips/new" element={<TripForm />} />
            <Route path="trips/:id/edit" element={<TripForm />} />
            <Route path="trips/:id" element={<TripDetail />} />
            {[
              "clients",
              "vehicles",
              "drivers",
              "bookings",
              "expenses",
              "maintenance",
              "fuel_logs",
            ].map((t) => (
              <Route key={t} path={t} element={<Records key={t} table={t} />} />
            ))}
            <Route
              path="invoices"
              element={<Finance key="invoices" table="invoices" />}
            />
            <Route
              path="payments"
              element={<Finance key="payments" table="payments" />}
            />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="documents" element={<Documents />} />
            <Route path="assistant" element={<Intelligence />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="driver" element={<DriverTrip />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Page not found</h1>
                  <a href="/">Return home</a>
                </div>
              }
            />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
const root =
  import.meta.hot?.data.root || createRoot(document.getElementById("root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <Boundary>
    <Provider>
      <App />
      <UpdatePrompt />
      <InstallPrompt />
    </Provider>
  </Boundary>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
