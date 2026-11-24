// What makes an app of the suite that app: its name, its one colour, its words and where it keeps the person's choices.
import type { ThemeDef, WordsOverride } from '@acaprino/sigrid';
import { shellTheme } from './preset.js';
import type { ShellWords } from './words.js';

export interface AppDefinition {
  /** Its id, in lower case: the folder of `icons/` when the package has one for it. */
  id: string;
  /** Its name, as the title bar writes it. */
  name: string;
  /** The language of its words, for the page (`it`, `en`). */
  lang: string;
  /** Its one colour, as `#rrggbb`. It gives the app its hue; the theme is the suite's, light and dark. */
  accent: string;
  /** The words in its language: Sigrid's, and the shell's. Absent: English. */
  words?: { sigrid?: WordsOverride; shell?: Partial<ShellWords> };
  /** The keys of the browser's storage for the scheme (light, dark or the system's), for the zoom and for the collapsed sidebar. */
  storage: { scheme: string; zoom: string; sidebar: string };
}

/** An app, with the theme computed from its colour. */
export interface App extends AppDefinition {
  readonly theme: ThemeDef;
}

/** The definition of an app, checked, with its theme. */
export function defineApp(app: AppDefinition): App {
  if (!/^#[0-9a-f]{6}$/i.test(app.accent)) throw new Error(`the accent of ${app.id} is ${app.accent}, not a colour as #rrggbb`);
  return { ...app, theme: shellTheme(app) };
}
