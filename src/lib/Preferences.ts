/**
 * App-wide preferences (theme, editor toggles), persisted in the session dir
 * (~/.termide/preferences.json, or TERMIDE_SESSION_DIR) so they survive restarts.
 */
import * as fs from "fs";
import * as path from "path";
import { getSessionDir } from "./SessionManager";

export interface Preferences {
  themeId: string;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  autoSave: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  themeId: "dark",
  wordWrap: false,
  minimap: true,
  lineNumbers: true,
  autoSave: true,
};

const file = () => path.join(getSessionDir(), "preferences.json");

export function loadPreferences(): Preferences {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8"));
    const out = { ...DEFAULT_PREFERENCES };
    for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
      if (typeof raw?.[key] === typeof DEFAULT_PREFERENCES[key]) (out as any)[key] = raw[key];
    }
    return out;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: Preferences): void {
  try {
    fs.mkdirSync(getSessionDir(), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(prefs, null, 2));
  } catch {
    // Preferences are a convenience; never fail the app over them.
  }
}
