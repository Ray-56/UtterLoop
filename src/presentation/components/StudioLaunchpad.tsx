import { ChevronRight } from "lucide-react";
import type { StudioView } from "../appUrlState";
import "./StudioLaunchpad.css";

export function StudioLaunchpad({ onOpen }: { onOpen(tab: StudioView): void }) {
  return <section className="studio-entry" aria-labelledby="studio-entry-title">
    <div><p className="eyebrow">Use what you learn</p><h3 id="studio-entry-title">Learning Studio</h3>
      <p>Try a new situation, prepare a real task, or practise your own expressions.</p></div>
    <button className="secondary-button" onClick={() => onOpen("home")} type="button">Open Learning Studio <ChevronRight aria-hidden="true" size={17} /></button>
  </section>;
}
