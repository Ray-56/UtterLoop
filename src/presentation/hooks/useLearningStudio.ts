import { useCallback, useEffect, useMemo, useState } from "react";
import { LearningStudioService } from "../../application/studio/LearningStudioService";
import type { LearningStudioDocument } from "../../domain/studio/LearningStudio";
import type { SentenceCard } from "../../domain/content/SentenceCard";
import { deriveLanguagePatterns } from "../../domain/studio/weaknessPractice";
import type { LearningStudioStore } from "../../application/ports/LearningStudioStore";
import type { PracticeLogEntry } from "../../domain/practice/PracticeLogEntry";

export function useLearningStudio(enabled: boolean, store: LearningStudioStore,
  readPracticeHistory: () => Promise<PracticeLogEntry[]>,
) {
  const service = useMemo(() => new LearningStudioService(store), [store]);
  const [document, setDocument] = useState<LearningStudioDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reload = useCallback(async () => {
    try {
      const next = await service.read();
      setDocument((current) => !current || next.revision >= current.revision ? next : current);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Local Studio data could not be loaded.");
    }
  }, [service]);

  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);

  const run = useCallback(async (operation: (service: LearningStudioService) => Promise<LearningStudioDocument>, quiet = false) => {
    if (!quiet) setPending(true);
    try {
      const next = await operation(service);
      setDocument((current) => !current || next.revision >= current.revision ? next : current);
      setError(null);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your Studio change could not be saved. Keep this page open and retry.");
      throw caught;
    } finally {
      if (!quiet) setPending(false);
    }
  }, [service]);

  const loadWeaknesses = useCallback(async (cards: readonly SentenceCard[]) => {
    return deriveLanguagePatterns(cards, await readPracticeHistory(), new Date());
  }, [readPracticeHistory]);

  return { document, error, pending, run, reload, loadWeaknesses };
}

export type LearningStudioController = ReturnType<typeof useLearningStudio>;
