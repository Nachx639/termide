import { test, expect, afterEach } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { setSessionDir } from "./SessionManager";
import { loadPreferences, savePreferences, DEFAULT_PREFERENCES } from "./Preferences";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "termide-prefs-"));
setSessionDir(dir);
afterEach(() => fs.rmSync(path.join(dir, "preferences.json"), { force: true }));

test("defaults when nothing saved, round-trips when saved", () => {
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  savePreferences({ ...DEFAULT_PREFERENCES, themeId: "nord", wordWrap: true });
  expect(loadPreferences()).toEqual({ ...DEFAULT_PREFERENCES, themeId: "nord", wordWrap: true });
});

test("ignores garbage and wrong types", () => {
  fs.writeFileSync(path.join(dir, "preferences.json"), '{"themeId": 3, "minimap": "yes", "autoSave": false}');
  expect(loadPreferences()).toEqual({ ...DEFAULT_PREFERENCES, autoSave: false });
  fs.writeFileSync(path.join(dir, "preferences.json"), "not json");
  expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
});
