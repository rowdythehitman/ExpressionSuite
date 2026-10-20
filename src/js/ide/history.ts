// Local history (like VS Code's Timeline): every version of every expression the panel applied or saw change in AE.

export type HistorySource = "before" | "apply" | "auto" | "file" | "batch" | "rename" | "ae";

export interface HistoryEntry {
  time: number;
  code: string;
  source: HistorySource;
}

/** Entries kept per property; the oldest go first. */
export const MAX_ENTRIES = 50;

/** Adds an entry unless it repeats the latest one's code; keeps at most MAX_ENTRIES (newest last). */
export function addEntry(list: HistoryEntry[] | undefined, entry: HistoryEntry): HistoryEntry[] {
  const prev = list ?? [];
  if (prev.length && prev[prev.length - 1]!.code === entry.code) return prev;
  const next = [...prev, entry];
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
}

export const SOURCE_LABEL: Record<HistorySource, string> = {
  before: "Before first apply",
  apply: "Applied",
  auto: "Auto-applied",
  file: "Applied from file",
  batch: "Batch apply",
  rename: "Reference update",
  ae: "Changed in After Effects",
};

// Saved projects keep history across sessions: { [projectPath]: { [key]: entries } }. Unsaved ones only in memory.
const KEY = "expression-ide.history";

export function loadHistory(project: string): Record<string, HistoryEntry[]> {
  if (!project) return {};
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Record<string, HistoryEntry[]>>;
    return all[project] ?? {};
  } catch {
    return {};
  }
}

export function saveHistory(project: string, history: Record<string, HistoryEntry[]>): void {
  if (!project) return;
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    all[project] = history;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full or unavailable: history stays in memory for this session.
  }
}
