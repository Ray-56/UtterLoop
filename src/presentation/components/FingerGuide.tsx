import { useEffect, useId, useState, type CSSProperties } from "react";
import { ChevronDown, Keyboard } from "lucide-react";
import type { FingerGuideMode } from "../../domain/backup/UtterLoopFullBackup";
import {
  FINGER_GUIDE_ROWS,
  type FingerGuideAssignment,
  type FingerGuideFinger,
  type FingerGuideHand,
  type FingerGuideStroke,
} from "../keyboard/resolveFingerGuideStroke";

interface FingerGuideProps {
  mode: FingerGuideMode;
  stroke: FingerGuideStroke | null;
  pulse: number;
  isMuted: boolean;
}

const FINGERS = ["pinky", "ring", "middle", "index", "thumb"] as const;
const HANDS = ["left", "right"] as const;
const ROW_REACH = [-70, -36, -2, 32, 12] as const;
const FINGER_ANCHORS: Record<string, number> = {
  "left-pinky": 17,
  "left-ring": 24,
  "left-middle": 31,
  "left-index": 38,
  "right-index": 55,
  "right-middle": 70,
  "right-ring": 77,
  "right-pinky": 84,
  "right-thumb": 50,
};

export function FingerGuide({ mode, stroke, pulse, isMuted }: FingerGuideProps) {
  const panelId = useId();
  const [manualExpansion, setManualExpansion] = useState<boolean | null>(null);

  useEffect(() => {
    setManualExpansion(null);
  }, [mode]);

  if (mode === "off") {
    return null;
  }

  const activeStroke = isMuted ? null : stroke;
  const isExpanded = !isMuted && (manualExpansion ?? mode === "full");
  const activeCodes = new Set(
    activeStroke
      ? [activeStroke.code, activeStroke.shift?.code].filter((code) => code !== undefined)
      : [],
  );
  const pulseClass = activeStroke && pulse > 0
    ? `finger-guide-pulse-${pulse % 2 === 0 ? "even" : "odd"}`
    : "";

  return (
    <section
      className={[
        "finger-guide",
        isMuted ? "is-muted" : "",
        isExpanded ? "is-expanded" : "",
        pulseClass,
      ].filter(Boolean).join(" ")}
      data-mode={mode}
    >
      <div className="finger-guide-compact">
        <div className="finger-guide-compact-heading">
          <Keyboard aria-hidden="true" size={17} />
          <span>Finger guide</span>
        </div>

        <kbd className="finger-guide-active-key">
          {activeStroke?.legend ?? "F J"}
        </kbd>

        <div className="finger-guide-recommendation">
          <span>{activeStroke ? `Pressed ${activeStroke.legend}` : "Home row"}</span>
          <strong>
            {activeStroke
              ? `Recommended: ${assignmentLabel(activeStroke.primary)}`
              : "Rest on ASDF · JKL;"}
          </strong>
          {activeStroke?.shift && (
            <small>Shift: {assignmentLabel(activeStroke.shift.assignment)}</small>
          )}
        </div>

        <FingerStrip stroke={activeStroke} />

        <button
          aria-controls={panelId}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse full finger guide" : "Show full finger guide"}
          className="finger-guide-toggle"
          onClick={() => setManualExpansion(!isExpanded)}
          title={isExpanded ? "Collapse keyboard" : "Show full keyboard"}
          type="button"
        >
          <ChevronDown aria-hidden="true" size={18} />
          <span>{isExpanded ? "Compact" : "Full"}</span>
        </button>
      </div>

      {isExpanded && (
        <div className="finger-guide-full" id={panelId}>
          <header className="finger-guide-full-heading">
            <div>
              <span>ANSI QWERTY map</span>
              <strong>{fullGuideLegend(activeStroke)}</strong>
            </div>
            <span>Primary key and modifier use different highlights</span>
          </header>
          <FullKeyboard activeCodes={activeCodes} activeStroke={activeStroke} />
        </div>
      )}
    </section>
  );
}

function FingerStrip({ stroke }: { stroke: FingerGuideStroke | null }) {
  return (
    <div className="finger-guide-strip" aria-hidden="true">
      {HANDS.flatMap((hand) => FINGERS.map((finger) => {
        const assignment: FingerGuideAssignment = { hand, finger };
        const isPrimary = Boolean(stroke && sameAssignment(stroke.primary, assignment));
        const isShift = Boolean(stroke?.shift && sameAssignment(stroke.shift.assignment, assignment));

        return (
          <span
            className={[
              `finger-guide-strip-finger finger-guide-strip-${finger}`,
              isPrimary ? "is-primary" : "",
              isShift ? "is-modifier" : "",
            ].filter(Boolean).join(" ")}
            key={`${hand}-${finger}`}
          />
        );
      }))}
    </div>
  );
}

function FullKeyboard({
  activeCodes,
  activeStroke,
}: {
  activeCodes: ReadonlySet<string>;
  activeStroke: FingerGuideStroke | null;
}) {
  return (
    <div className="finger-guide-visual" aria-hidden="true">
      <div className="finger-guide-keyboard">
        {FINGER_GUIDE_ROWS.map((row, rowIndex) => (
          <div className="finger-guide-row" key={rowIndex}>
            {row.map((definition) => {
              const isPrimary = definition.code === activeStroke?.code;
              const isShift = definition.code === activeStroke?.shift?.code;

              return (
                <span
                  className={[
                    "finger-guide-key",
                    isPrimary ? "is-primary-target" : "",
                    isShift ? "is-shift-target" : "",
                  ].filter(Boolean).join(" ")}
                  data-code={definition.code}
                  key={definition.code}
                  style={{ "--finger-guide-key-units": definition.units } as CSSProperties}
                >
                  <span className="finger-guide-key-label">
                    {definition.shiftedLabel && (
                      <span className="finger-guide-key-shifted">{definition.shiftedLabel}</span>
                    )}
                    <span>{definition.label}</span>
                  </span>
                  {(definition.code === "KeyF" || definition.code === "KeyJ") && (
                    <span className="finger-guide-home-mark" />
                  )}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className="finger-guide-hands">
        <GhostHand activeCodes={activeCodes} hand="left" stroke={activeStroke} />
        <GhostHand activeCodes={activeCodes} hand="right" stroke={activeStroke} />
      </div>
    </div>
  );
}

function GhostHand({
  activeCodes,
  hand,
  stroke,
}: {
  activeCodes: ReadonlySet<string>;
  hand: FingerGuideHand;
  stroke: FingerGuideStroke | null;
}) {
  return (
    <span className={`finger-guide-hand finger-guide-hand-${hand}`}>
      <span className="finger-guide-palm" />
      {FINGERS.map((finger) => {
        const assignment: FingerGuideAssignment = { hand, finger };
        const targetCode = codeForAssignment(stroke, assignment);
        const isActive = targetCode !== null && activeCodes.has(targetCode);

        return (
          <span
            className={`finger-guide-finger finger-guide-finger-${finger} ${isActive ? "is-active" : ""}`}
            key={finger}
            style={{
              "--finger-guide-reach": `${targetCode ? reachForCode(targetCode) : 0}px`,
              "--finger-guide-reach-x": `${targetCode ? horizontalReach(targetCode, assignment) : 0}%`,
            } as CSSProperties}
          />
        );
      })}
    </span>
  );
}

function codeForAssignment(
  stroke: FingerGuideStroke | null,
  assignment: FingerGuideAssignment,
): string | null {
  if (!stroke) {
    return null;
  }

  if (sameAssignment(stroke.primary, assignment)) {
    return stroke.code;
  }

  return stroke.shift && sameAssignment(stroke.shift.assignment, assignment)
    ? stroke.shift.code
    : null;
}

function sameAssignment(left: FingerGuideAssignment, right: FingerGuideAssignment): boolean {
  return left.hand === right.hand && left.finger === right.finger;
}

function reachForCode(code: string): number {
  const rowIndex = FINGER_GUIDE_ROWS.findIndex((row) =>
    row.some((definition) => definition.code === code)
  );
  return ROW_REACH[Math.min(Math.max(rowIndex, 0), ROW_REACH.length - 1)];
}

function horizontalReach(code: string, assignment: FingerGuideAssignment): number {
  const target = horizontalPosition(code);
  const anchor = FINGER_ANCHORS[`${assignment.hand}-${assignment.finger}`] ?? target;
  return Math.max(-320, Math.min(320, (target - anchor) * 22));
}

function horizontalPosition(code: string): number {
  if (code === "Space") {
    return 50;
  }

  for (const row of FINGER_GUIDE_ROWS) {
    const index = row.findIndex((definition) => definition.code === code);

    if (index >= 0) {
      const totalUnits = row.reduce((total, definition) => total + definition.units, 0);
      const precedingUnits = row
        .slice(0, index)
        .reduce((total, definition) => total + definition.units, 0);
      return ((precedingUnits + row[index].units / 2) / totalUnits) * 100;
    }
  }

  return 50;
}

function fullGuideLegend(stroke: FingerGuideStroke | null): string {
  if (!stroke) {
    return "Home row · ASDF / JKL;";
  }

  const shift = stroke.shift ? ` · Shift: ${assignmentLabel(stroke.shift.assignment)}` : "";
  return `${stroke.legend} · Recommended: ${assignmentLabel(stroke.primary)}${shift}`;
}

function assignmentLabel(assignment: FingerGuideAssignment): string {
  return `${capitalize(assignment.hand)} ${fingerLabel(assignment.finger)}`;
}

function fingerLabel(finger: FingerGuideFinger): string {
  return finger === "pinky" ? "little finger" : finger;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
