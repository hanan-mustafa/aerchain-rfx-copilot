"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";

const NAV_KEY = "rfx-copilot.nav-collapsed";

/** App frame: collapsible left nav (collapsed by default; the choice is remembered) + page content. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(NAV_KEY) === "0") setCollapsed(false);
    } catch {
      // storage unavailable: stay collapsed
    }
  }, []);

  function toggle() {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(NAV_KEY, c ? "0" : "1");
      } catch {
        // storage unavailable: the toggle still works for this session
      }
      return !c;
    });
  }

  return (
    <div className={`shell ${collapsed ? "shell-collapsed" : ""}`}>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
