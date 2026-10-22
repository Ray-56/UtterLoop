import { Component, type ReactNode } from "react";

interface OptionalActivityBoundaryProps {
  title: string;
  onRetry(): void;
  children: ReactNode;
}

export class OptionalActivityBoundary extends Component<OptionalActivityBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    return this.state.failed ? <OptionalActivityLoadError title={this.props.title} onRetry={this.props.onRetry} /> : this.props.children;
  }
}

export function OptionalActivityLoading({ title }: { title: string }) {
  return <section className="center-panel" role="status" aria-live="polite">
    <h3>Opening {title}</h3>
    <p>Loading this optional activity. Your saved learning stays on this device.</p>
  </section>;
}

export function OptionalActivityLoadError({ title, onRetry }: { title: string; onRetry(): void }) {
  return <section className="center-panel" role="alert">
    <h3>{title} could not be opened</h3>
    <p>The activity could not be loaded. Retry reloads this page; saved learning and recoverable drafts remain on this device.</p>
    <div className="practice-actions">
      <button className="primary-button" onClick={onRetry} type="button">Retry loading activity</button>
    </div>
  </section>;
}
