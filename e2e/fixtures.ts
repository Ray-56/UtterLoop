import { expect, test as base, type Page } from "@playwright/test";

/**
 * Playwright creates a fresh BrowserContext for every test, which gives each
 * case an empty IndexedDB. Clearing the two synchronous stores before the app
 * bundle runs also keeps preferences and future session flags deterministic.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await use(page);
  },
});

export { expect };

export const STARTER_LESSON_URL =
  "/?view=practice&scope=lesson&practiceCourse=starter-foundations"
  + "&practiceLesson=sf-u1-l1&practiceMode=learn";

export async function expectAppReady(page: Page): Promise<void> {
  await expect(page.locator(".app-shell")).toHaveAttribute("data-storage-status", "ready");
}

export async function openReadyApp(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await expectAppReady(page);
}

type SeedableUtterLoopStore =
  | "appPreferences"
  | "appMetadata"
  | "reviewStates"
  | "practiceLog"
  | "practiceSessionCheckpoints"
  | "practiceSessionEvidence"
  | "sentenceCards"
  | "vocabularyEntries"
  | "sentenceLearningStates";

type ReadableUtterLoopStore = SeedableUtterLoopStore;

/**
 * Seeds durable learner-owned rows after the real app has opened/upgraded its
 * IndexedDB. The helper uses one browser transaction and never replaces the
 * catalog, so seeded card references stay tied to the production default data.
 */
export async function seedUtterLoopIndexedDb(
  page: Page,
  recordsByStore: Partial<Record<SeedableUtterLoopStore, readonly Record<string, unknown>[]>>,
): Promise<void> {
  const seed = () => page.evaluate(async (records) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("utterloop-courses");
      request.onerror = () => reject(request.error ?? new Error("Could not open test database."));
      request.onsuccess = () => resolve(request.result);
    });
    const storeNames = Object.keys(records);

    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(storeNames, "readwrite");
        transaction.onerror = () => reject(
          transaction.error ?? new Error("Could not seed test database."),
        );
        transaction.onabort = () => reject(
          transaction.error ?? new Error("Test database seed was aborted."),
        );
        transaction.oncomplete = () => resolve();

        for (const [storeName, storeRecords] of Object.entries(records)) {
          const store = transaction.objectStore(storeName);
          for (const record of storeRecords ?? []) {
            store.put(record);
          }
        }
      });
    } finally {
      database.close();
    }
  }, recordsByStore);

  try {
    await seed();
  } catch (caught) {
    const navigationInterruptedSeed = caught instanceof Error
      && /Execution context was destroyed|Cannot find context with specified id/.test(caught.message);
    if (!navigationInterruptedSeed) throw caught;

    // Every seed write is an idempotent put. If Vite performs an initial full
    // reload while Chromium workers start in parallel, repeat the transaction
    // only after the replacement document is ready.
    await page.waitForLoadState("domcontentloaded");
    await expectAppReady(page);
    await seed();
  }
}

export async function readUtterLoopIndexedDbRecord(
  page: Page,
  storeName: ReadableUtterLoopStore,
  key: string,
): Promise<Record<string, unknown> | undefined> {
  return page.evaluate(async ({ key, storeName }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("utterloop-courses");
      request.onerror = () => reject(request.error ?? new Error("Could not open test database."));
      request.onsuccess = () => resolve(request.result);
    });

    try {
      return await new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
        request.onerror = () => reject(request.error ?? new Error("Could not read test database row."));
        request.onsuccess = () => resolve(
          request.result as Record<string, unknown> | undefined,
        );
      });
    } finally {
      database.close();
    }
  }, { key, storeName });
}
