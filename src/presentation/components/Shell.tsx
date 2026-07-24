import type { ComponentType, ReactNode } from "react";
import type { AppView } from "../App";
import type { TrainingSnapshot } from "../../application/use-cases/getTrainingSnapshot";

interface NavigationItem {
  id: AppView;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

interface ShellProps {
  activeView: AppView;
  navigation: NavigationItem[];
  onNavigate(view: AppView): void;
  snapshot: TrainingSnapshot | null;
  status: "loading" | "ready" | "error";
  children: ReactNode;
}

export function Shell({ activeView, navigation, onNavigate, snapshot, status, children }: ShellProps) {
  const dueCount = snapshot?.queue.due.length ?? 0;
  const totalCards = snapshot?.cards.length ?? 0;
  const activeIndex = navigation.findIndex((item) => item.id === activeView) + 1;

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span>U</span>
            <span>L</span>
          </div>
          <div>
            <h1>UtterLoop</h1>
            <p>Sentence training lab</p>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${activeView === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => onNavigate(item.id)}
                title={item.label}
                type="button"
              >
                <Icon size={18} strokeWidth={2} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-summary" aria-live="polite">
          <p>Today</p>
          <div className="sidebar-metrics">
            <div>
              <span className="metric-value">{dueCount}</span>
              <span className="metric-label">due now</span>
            </div>
            <div>
              <span className="metric-value">{totalCards}</span>
              <span className="metric-label">cards</span>
            </div>
          </div>
        </div>
      </aside>

      <main className={`workspace workspace-${activeView}`}>
        <header className="workspace-header">
          <div className="workspace-heading">
            <span className="view-number" aria-hidden="true">
              {String(activeIndex).padStart(2, "0")}
            </span>
            <div>
              <p className="eyebrow">{labelForView(activeView)}</p>
              <h2>{titleForView(activeView)}</h2>
            </div>
          </div>
          <span className={`sync-pill sync-pill-${status}`}>
            <span aria-hidden="true" />
            {statusLabel(status)}
          </span>
        </header>
        {children}
      </main>
    </div>
  );
}

function titleForView(view: AppView): string {
  switch (view) {
    case "practice":
      return "Practice session";
    case "courses":
      return "Courses & learning path";
    case "review":
      return "Review queue";
    case "progress":
      return "Learning progress";
    case "settings":
      return "Data & settings";
  }
}

function labelForView(view: AppView): string {
  switch (view) {
    case "practice":
      return "Focus mode";
    case "courses":
      return "Curriculum";
    case "review":
      return "Schedule";
    case "progress":
      return "Signals";
    case "settings":
      return "Local first";
  }
}

function statusLabel(status: ShellProps["status"]): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "ready":
      return "Saved locally";
    case "error":
      return "Storage error";
  }
}
