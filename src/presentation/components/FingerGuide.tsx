import type { CSSProperties } from "react";
import {
  FINGER_GUIDE_ROWS,
  type FingerGuideAssignment,
  type FingerGuideHand,
  type FingerGuideStroke,
} from "../keyboard/resolveFingerGuideStroke";

interface FingerGuideProps {
  stroke: FingerGuideStroke | null;
  pulse: number;
  isMuted: boolean;
}

const FINGERS = ["pinky", "ring", "middle", "index", "thumb"] as const;
const HOME_ROW_LABEL = "Home row · ASDF / JKL;";
const ROW_REACH = [-96, -60, -28, 8, 35, 12] as const;
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

export function FingerGuide({ stroke, pulse, isMuted }: FingerGuideProps) {
  const activeStroke = stroke;
  const activeCodes = new Set(
    activeStroke
      ? [activeStroke.code, activeStroke.shift?.code].filter((code) => code !== undefined)
      : [],
  );
  const pulseClass = activeStroke && pulse > 0 && !isMuted
    ? `finger-guide-pulse-${pulse % 2 === 0 ? "even" : "odd"}`
    : "";

  return (
    <section className={`finger-guide ${isMuted ? "is-muted" : ""} ${pulseClass}`}>
      <header className="finger-guide-header">
        <span>Finger guide</span>
        <strong>{activeStroke ? legendForStroke(activeStroke) : HOME_ROW_LABEL}</strong>
      </header>

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
          <GhostHand
            activeCodes={activeCodes}
            hand="left"
            stroke={activeStroke}
          />
          <GhostHand
            activeCodes={activeCodes}
            hand="right"
            stroke={activeStroke}
          />
        </div>
      </div>
    </section>
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
  if (code === "Escape") {
    return 100 / 30;
  }

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

function legendForStroke(stroke: FingerGuideStroke): string {
  const primary = assignmentLabel(stroke.primary);
  const shift = stroke.shift ? ` + ${assignmentLabel(stroke.shift.assignment)} Shift` : "";
  return `${stroke.legend} · ${primary}${shift}`;
}

function assignmentLabel(assignment: FingerGuideAssignment): string {
  return `${assignment.hand} ${assignment.finger}`.toUpperCase();
}
