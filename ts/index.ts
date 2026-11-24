/** What makes an app of the suite that app: its names, its one colour and where it keeps the person's choices. */
export interface AppDefinition {
  /** Its id, in lower case: the folder of `icons/` when the package has one for it. */
  id: string;
  /** Its name, as the title bar writes it. */
  name: string;
  /** Its one colour, as `#rrggbb`. The theme is computed from it, light and dark. */
  accent: string;
  /** The keys of the browser's storage for the scheme (light, dark or the system's) and for the zoom. */
  storage: { scheme: string; zoom: string };
}

/** The definition of an app, checked by its type and given back as it is. */
export const defineApp = (app: AppDefinition): AppDefinition => app;
