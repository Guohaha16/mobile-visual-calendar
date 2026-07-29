import { createVisualDiaryDb } from "../data/local/db";
import { createDiaryRepository } from "../data/local/diaryRepository";

const LOCAL_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export const applicationDatabase = createVisualDiaryDb(
  "mobile-visual-calendar",
  LOCAL_DEMO_USER_ID,
);

export const applicationRepository = createDiaryRepository(
  applicationDatabase,
  {
    clock: () => new Date().toISOString(),
    generateId: () => crypto.randomUUID(),
    userId: LOCAL_DEMO_USER_ID,
  },
);
