import { ChangeEvent, useState } from "react";
import { Download, RefreshCcw, RotateCcw, Trash2, Upload } from "lucide-react";
import type { CourseBundle } from "../../application/UtterLoopService";
import type { TrainingController } from "../hooks/useTrainingController";

interface SettingsViewProps {
  controller: TrainingController;
}

export function SettingsView({ controller }: SettingsViewProps) {
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const snapshot = controller.snapshot;

  async function exportCatalog() {
    try {
      const bundle = await controller.exportCourseBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "utterloop-course-bundle-v2.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${bundle.courses.length} courses and ${bundle.categories.length} categories.`);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Export failed.");
    }
  }

  async function importCatalog() {
    try {
      const parsed = JSON.parse(importText) as CourseBundle;
      await controller.importCourseBundle(parsed);
      setMessage(`Imported ${parsed.courses.length} courses and ${parsed.cards.length} cards.`);
      setImportText("");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Import failed.");
    }
  }

  async function runAction(action: () => Promise<void>, successMessage: string) {
    try {
      await action();
      setMessage(successMessage);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setImportText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  return (
    <section className="settings-layout">
      <div className="settings-panel">
        <p className="eyebrow">Portable curriculum</p>
        <h3>Import and export complete courses</h3>
        <p className="muted-copy">A course bundle includes its learning paths, outlines, lessons, and sentence cards.</p>
        <textarea
          className="import-box"
          onChange={(event) => setImportText(event.target.value)}
          placeholder='Paste a v2 bundle like { "schemaVersion": 2, "categories": [...], "learningPaths": [...], "courses": [...], "cards": [...] }'
          value={importText}
        />
        <div className="practice-actions">
          <label className="secondary-button file-button">
            <Upload size={18} />
            Load file
            <input accept="application/json,.json" onChange={handleFile} type="file" />
          </label>
          <button className="primary-button" disabled={!importText.trim()} onClick={() => void importCatalog()} type="button">
            <Upload size={18} />
            Import
          </button>
          <button className="secondary-button" disabled={!snapshot} onClick={() => void exportCatalog()} type="button">
            <Download size={18} />
            Export
          </button>
        </div>
        {message && <p className="settings-message">{message}</p>}
      </div>

      <div className="settings-panel">
        <p className="eyebrow">Local browser data</p>
        <h3>Manage this device</h3>
        <p className="muted-copy">
          UtterLoop stores courses, review state, and attempts in IndexedDB on this browser. Nothing is uploaded.
        </p>
        <div className="practice-actions">
          <button
            className="secondary-button"
            onClick={() => void runAction(controller.restoreDefaultCourses, "Default courses restored.")}
            type="button"
          >
            <RotateCcw size={18} />
            Restore defaults
          </button>
          <button
            className="secondary-button"
            onClick={() => void runAction(controller.resetLearningProgress, "Learning progress reset.")}
            type="button"
          >
            <RefreshCcw size={18} />
            Reset progress
          </button>
          <button
            className="danger-button"
            onClick={() => void runAction(controller.clearAll, "All local course data cleared.")}
            type="button"
          >
            <Trash2 size={18} />
            Clear all
          </button>
        </div>
      </div>

      <div className="settings-panel license-panel">
        <p className="eyebrow">Default content licenses</p>
        <h3>Open content, with sources kept visible</h3>
        <p className="muted-copy">
          UtterLoop's original courses are released under{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noreferrer" target="_blank">CC0 1.0</a>.
          The VOA course uses VOA Learning English material identified as public domain and credits each source lesson.
        </p>
        <a href="https://learningenglish.voanews.com/p/6861.html" rel="noreferrer" target="_blank">
          Read VOA reuse guidance
        </a>
      </div>
    </section>
  );
}
