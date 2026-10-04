import { createContext, useContext } from "react";
import { DARK_THEME, type Theme } from "./ThemeSystem";

/** The active colour theme (panel borders and focus accents follow it). */
export const ThemeContext = createContext<Theme>(DARK_THEME);

export const useTheme = () => useContext(ThemeContext);
