import React, { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Route,
  Users,
  Wallet,
  Menu,
  CarFront,
  Contact,
  CalendarDays,
  Receipt,
  IndianRupee,
  ChartNoAxesCombined,
  Settings,
  Files,
  Wrench,
  Fuel,
  ArrowUpRight,
  LogOut,
  Bell,
  WifiOff,
  Navigation,
  Sparkles,
} from "lucide-react";
import { useApp } from "../lib/context";
import { Button, Modal } from "./ui";
export const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/trips", "Trips", Route],
  ["/bookings", "Bookings", CalendarDays],
  ["/clients", "Clients", Users],
  ["/vehicles", "Vehicles", CarFront],
  ["/drivers", "Drivers", Contact],
  ["/expenses", "Expenses", Wallet],
  ["/invoices", "Invoices", Receipt],
  ["/payments", "Payments", IndianRupee],
  ["/reports", "Reports", ChartNoAxesCombined],
  ["/maintenance", "Maintenance", Wrench],
  ["/fuel_logs", "Fuel logs", Fuel],
  ["/documents", "Documents", Files],
  ["/assistant", "Smart assistant", Sparkles],
  ["/settings", "Settings", Settings],
];
function NavItems({ close }) {
  return nav.map(([path, name, Icon]) => (
    <NavLink onClick={close} key={path} to={path} end={path === "/"}>
      <Icon size={19} />
      <span>{name}</span>
    </NavLink>
  ));
}
export default function Layout() {
  const { demo, signOut, profile } = useApp(),
    [menu, setMenu] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine),
    loc = useLocation();
  useEffect(() => {
    const change = () => setOffline(!navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Navigation size={24} fill="currentColor" />
          </span>
          smarttrip<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">OPERATIONS WORKSPACE</div>
        <nav>
          <NavItems />
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">ST</div>
          <div>
            <b>{demo ? "Demo workspace" : "Your business"}</b>
            <small>{demo ? "Sample data only" : profile?.role}</small>
          </div>
          <Button variant="icon ghost" aria-label="Sign out" onClick={signOut}>
            <LogOut size={17} />
          </Button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span>{" "}
            <b>
              {nav.find((n) => n[0] === loc.pathname)?.[1] || "Trip details"}
            </b>
          </span>
          <div>
            <Link
              className="notification-button"
              to="/notifications"
              aria-label="Notifications"
            >
              <Bell size={19} />
            </Link>
            <span className="avatar small">ST</span>
          </div>
        </header>
        {demo && (
          <div className="demo-strip">
            <span>
              <b>Demo workspace</b> · Sample data saved in this browser only
            </span>
            <Link to="/settings">
              Connect Supabase <ArrowUpRight size={14} />
            </Link>
          </div>
        )}
        {offline && (
          <div className="offline">
            <WifiOff size={16} /> Offline · Live changes cannot be saved. Keep
            this page open.
          </div>
        )}
        <main>
          <Outlet />
        </main>
        <footer className="app-footer">
          SmartTrip <span>Thoughtfully built for the journey.</span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {[nav[0], nav[1], nav[3], nav[6]].map(([path, name, Icon]) => (
          <NavLink key={path} to={path} end={path === "/"}>
            <Icon size={20} />
            <span>{name === "Overview" ? "Home" : name}</span>
          </NavLink>
        ))}
        <button onClick={() => setMenu(true)} aria-expanded={menu}>
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
      {menu && (
        <Modal title="Your workspace" onClose={() => setMenu(false)}>
          <nav className="mobile-menu">
            <NavItems close={() => setMenu(false)} />
          </nav>
          <Button variant="secondary w-full" onClick={signOut}>
            Leave workspace <LogOut size={16} />
          </Button>
        </Modal>
      )}
    </div>
  );
}
