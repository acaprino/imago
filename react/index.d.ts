import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

type Props<T extends 'div' | 'main' | 'ol' | 'button'> = Omit<ComponentPropsWithoutRef<T>, 'className'>;
export function TabList<T extends string>(props: {
  label: string; value: T; onSelect: (value: T) => void;
  tabs: readonly { value: T; id: string; panel: string; label: ReactNode; disabled?: boolean }[];
}): ReactElement;
export function Disclosure(props: { label: ReactNode; children?: ReactNode }): ReactElement;

/**
 * The window: the `im-shell` root of docs/using-imago.md section 4. It writes the skip link to the content region of the
 * `Workbench` among its children (its `contentId`, `main` by default), then `titlebar`, then its children: put a
 * `Workbench` in it. Mount it in a root that carries `im-root` (`<div id="app" class="im-root">`, the element React
 * renders into): the shell then fills the window, as it does directly in the body; in a root without it, the content is
 * 0 pixels tall. The app, the look and the theme (`data-im-app`, `data-im-look`, `data-im-theme`) are written on the
 * root element by `applyLook`, not by the shell.
 */
export function Shell(props: Props<'div'> & {
  titlebar?: ReactNode;
  /** Whether the `Workbench` has a sidebar: writes `data-im-sidebar="on"`, or `"off"` when it is not set. */
  sidebar?: boolean;
  /** `"wide"` makes the inspector `--im-w-inspector-wide` (360) wide instead of 300 (`data-im-inspector="wide"`). */
  inspector?: 'wide';
  /** The text of the skip link, in the app's words. */
  skipLabel: string;
}): ReactElement;

type WorkbenchSidebar =
  | { navigation?: null | false; navigationLabel?: undefined }
  | {
    /** The rows of the sidebar, `ListAction`s. A row's `rail` is all it shows in the rail. Without them there is no sidebar. */
    navigation: ReactNode;
    /** The sidebar's title and its accessible name. */
    navigationLabel: string;
  };

/**
 * The body of a `Shell`: the sidebar, and the work area: the status row, the content region and the inspector, the
 * action bar and the footer, in the order of the string frame (`shellFrameHtml`). The attributes of a `main` go on the
 * content region, whose id is `contentId`; the sidebar's id is `sidebarId`.
 */
export function Workbench(props: Omit<Props<'main'>, 'id' | 'tabIndex'> & WorkbenchSidebar & {
  /** The content region's accessible name, in the app's words. */
  'aria-label': string;
  /** The inspector's children. While they are empty the inspector is `hidden`. A fragment or a component that draws nothing is not empty. */
  details?: ReactNode;
  /** The inspector's accessible name. */
  detailsLabel: string;
  /** The children of the status row (`im-status`), above the columns. Without it there is none. */
  status?: ReactNode;
  /** The children of the action bar (`im-actions`), under the columns. Without it there is none. */
  actions?: ReactNode;
  /** The children of the footer (`im-footer`), the window's last row. Without it there is none. */
  footer?: ReactNode;
  /** The id of the content region, which the skip link of the `Shell` goes to. Default `main`. */
  contentId?: string;
  /** The id of the sidebar, which the title bar's sidebar button controls. Default `sidebar`. */
  sidebarId?: string;
  /** @deprecated Ignored: a component cannot reach its shell. Write `inspector="wide"` on the `Shell`. */
  wide?: boolean;
}): ReactElement;

/**
 * A row of a list, a native button. `title` is the row's title and `tooltip` the button's HTML `title`. `rail` is what the
 * row shows in the rail (620 to 849, or folded): the children of a `span.im-rail-item`, an icon or the row's initials;
 * a row without it is blank there.
 */
export function ListAction(props: Omit<Props<'button'>, 'title' | 'children' | 'type' | 'aria-pressed'> & {
  title: ReactNode; detail?: ReactNode; icon?: ReactNode; pressed?: boolean;
  /** The HTML `title` of the button: its tooltip. */
  tooltip?: string;
  /** What the row shows in the rail, in a `span.im-rail-item`. */
  rail?: ReactNode;
}): ReactElement;
export function Timeline(props: Omit<Props<'ol'>, 'children'> & {
  items: readonly { id: string | number; title: ReactNode; detail?: ReactNode }[];
}): ReactElement;
