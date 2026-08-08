import { Rocket, X } from "lucide-react";

export type QuickStartStep = 1 | 2 | 3 | 4 | 5 | 6;

interface QuickStartGuideProps {
  isDismissDisabled?: boolean;
  onDismiss(): void;
  phase?: "first-exposure" | "recall";
  showDismiss?: boolean;
  step: QuickStartStep;
}

const stepCopy: Record<QuickStartStep, { title: string; description: string }> = {
  1: {
    title: "Meet the sentence first",
    description: "Read the meaning, listen once, and notice how the sentence is built before you type.",
  },
  2: {
    title: "Try the recall",
    description: "The study panel is now closed. Type from memory, or press Ctrl+; to open the Answer and grammar support.",
  },
  3: {
    title: "Recall the next sentence",
    description: "Use the Prompt and word track first. Ctrl+; opens all written support only when you ask for it.",
  },
  4: {
    title: "Build it from the Prompt",
    description: "Keep the support area clear while you type, then check your complete answer with Enter.",
  },
  5: {
    title: "Recall independently",
    description: "The first three sentences now return for an Independent recall. A perfect answer creates their First Pass.",
  },
  6: {
    title: "Independent recall unlocks Review",
    description: "A perfect Independent recall creates a First Pass and places the sentence into spaced Review.",
  },
};

const firstExposureCopy: Partial<Record<QuickStartStep, { title: string; description: string }>> = {
  3: {
    title: "Meet the next sentence first",
    description: "Read the complete sentence first. Start recall when you're ready; the written support will close.",
  },
  4: {
    title: "Meet the next sentence first",
    description: "Read the complete sentence first. Start recall when you're ready to rebuild it from the Prompt.",
  },
};

export function QuickStartGuide({
  isDismissDisabled = false,
  onDismiss,
  phase = "recall",
  showDismiss = true,
  step,
}: QuickStartGuideProps) {
  const copy = phase === "first-exposure"
    ? firstExposureCopy[step] ?? stepCopy[step]
    : stepCopy[step];

  return (
    <aside aria-label={`Quick Start, step ${step} of 6`} className="quick-start-guide">
      <div className="quick-start-icon" aria-hidden="true">
        <Rocket size={19} />
      </div>
      <div className="quick-start-copy">
        <span>Quick Start · Step {step} of 6</span>
        <strong>{copy.title}</strong>
        <p>{copy.description}</p>
        <div aria-label={`${step} of 6 Quick Start steps`} className="quick-start-progress" role="progressbar" aria-valuemax={6} aria-valuemin={1} aria-valuenow={step}>
          <span style={{ width: `${Math.round((step / 6) * 100)}%` }} />
        </div>
      </div>
      {showDismiss && (
        <button
          className="quick-start-dismiss"
          disabled={isDismissDisabled}
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" size={15} />
          Skip Quick Start
        </button>
      )}
    </aside>
  );
}
