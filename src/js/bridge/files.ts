// Files on disk for "link a tab to a .js file" (spec: File watch mode). In CEP this is Node's fs (enabled in the
// manifest) plus CEP's save dialog; in a plain browser an in-memory stand-in driven through window.__mockFS.
import { fs, os, path } from "../lib/cep/node";

export interface Files {
  /** Asks where to keep the file (a save dialog); null if cancelled. */
  choose(defaultName: string): Promise<string | null>;
  /** The file's text, or null if it doesn't exist. */
  read(file: string): Promise<string | null>;
  write(file: string, text: string): Promise<void>;
  /** Calls `onChange` with the new text whenever the file is saved; returns a function that stops watching. */
  watch(file: string, onChange: (text: string) => void): () => void;
  displayName(file: string): string;
}

export interface MockFiles {
  /** Simulates saving the file in another editor. */
  save(file: string, text: string): void;
  read(file: string): string | undefined;
  /** What the next save dialog returns (null = cancel); default `/mock/<name>`. */
  nextChoice(file: string | null): void;
}

declare global {
  interface Window {
    __mockFS?: MockFiles;
  }
}

function cepFiles(): Files {
  return {
    async choose(defaultName) {
      const res = window.cep.fs.showSaveDialogEx("Link expression to a file", os.homedir(), ["js"], defaultName) as { data?: string };
      if (!res?.data) return null;
      return /\.js$/i.test(res.data) ? res.data : `${res.data}.js`;
    },
    async read(file) {
      try {
        return fs.readFileSync(file, "utf-8");
      } catch {
        return null;
      }
    },
    async write(file, text) {
      fs.writeFileSync(file, text, "utf-8");
    },
    watch(file, onChange) {
      // watchFile polls the file's stats, so it survives editors that save by replacing the file.
      let last: string | null = null;
      const listener = () => {
        let text: string;
        try {
          text = fs.readFileSync(file, "utf-8");
        } catch {
          return; // mid-save, or deleted: wait for the next change
        }
        if (text !== last) {
          last = text;
          onChange(text);
        }
      };
      try {
        last = fs.readFileSync(file, "utf-8");
      } catch {
        last = null;
      }
      fs.watchFile(file, { interval: 250 }, listener);
      return () => fs.unwatchFile(file, listener);
    },
    displayName: (file) => path.basename(file),
  };
}

function mockFiles(): Files {
  const files = new Map<string, string>();
  const watchers = new Map<string, Set<(text: string) => void>>();
  let next: string | null | undefined;
  window.__mockFS = {
    save(file, text) {
      files.set(file, text);
      for (const w of watchers.get(file) ?? []) w(text);
    },
    read: (file) => files.get(file),
    nextChoice(file) {
      next = file;
    },
  };
  return {
    async choose(defaultName) {
      const choice = next === undefined ? `/mock/${defaultName}` : next;
      next = undefined;
      return choice;
    },
    read: async (file) => files.get(file) ?? null,
    async write(file, text) {
      files.set(file, text);
    },
    watch(file, onChange) {
      const set = watchers.get(file) ?? new Set();
      set.add(onChange);
      watchers.set(file, set);
      return () => set.delete(onChange);
    },
    displayName: (file) => file.split(/[\\/]/).pop() ?? file,
  };
}

let instance: Files | null = null;
export function getFiles(): Files {
  if (!instance) instance = window.cep ? cepFiles() : mockFiles();
  return instance;
}

/** A file name for a tab: "Title_Text - Position.js", with characters Windows and macOS refuse replaced. */
export function suggestFileName(layerName: string, propName: string): string {
  return `${layerName} - ${propName}`.replace(/[\\/:*?"<>|]+/g, "_").trim() + ".js";
}
