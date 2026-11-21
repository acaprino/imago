import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

type Props<T extends 'div' | 'main' | 'ol' | 'button'> = Omit<ComponentPropsWithoutRef<T>, 'className'>;
export function TabList<T extends string>(props: {
  label: string; value: T; onSelect: (value: T) => void;
  tabs: readonly { value: T; id: string; panel: string; label: ReactNode; disabled?: boolean }[];
}): ReactElement;
export function Disclosure(props: { label: ReactNode; children?: ReactNode }): ReactElement;

/**
 * The window: the `im-shell` root of docs/using-imago.md section 4. It writes the skip link (when `skipLabel` is given,
 * to the content region of the `Workbench`), then `titlebar`, then its children: put a `Workbench` in it. The app, the
 * look and the theme (`data-im-app`, `data-im-look`, `data-im-theme`) are written on the root element by `applyLook`,
 * not by the shell.
 */
export function Shell(props: Props<'div'> & {
  titlebar?: ReactNode;
  /** Whether the `Workbench` has a sidebar: writes `data-im-sidebar="on"`, or `"off"` when it is not set. */
  sidebar?: boolean;
  /** `"wide"` makes the inspector 360 wide instead of 300 (`data-im-inspector="wide"`). */
  inspector?: 'wide';
  /** The text of the skip link. Without it the shell has none. */
  skipLabel?: string;
}): ReactElement;

type WorkbenchSidebar =
  | { navigation?: null | false; navigationLabel?: undefined }
  | {
    /** The rows of the sidebar, `ListAction`s. A row's `icon` should be an `im-rail-item`: it is all the row shows in the rail. Without them there is no sidebar. */
    navigation: ReactNode;
    /** The sidebar's title and its accessible name. */
    navigationLabel: string;
  };

/**
 * The body of a `Shell`: the sidebar, the content region and the inspector. The attributes of a `main` (`aria-label`
 * and so on) go on the content region, whose id is `main`; the sidebar's id is `sidebar`.
 */
export function Workbench(props: Omit<Props<'main'>, 'id' | 'tabIndex'> & WorkbenchSidebar & {
  /** The inspector's children. While they are empty the inspector is `hidden`. */
  details?: ReactNode;
  /** The inspector's accessible name. */
  detailsLabel: string;
  /** @deprecated Ignored: a component cannot reach its shell. Write `inspector="wide"` on the `Shell`. */
  wide?: boolean;
}): ReactElement;

export function ListAction(props: Omit<Props<'button'>, 'title' | 'children' | 'type' | 'aria-pressed'> & {
  title: ReactNode; detail?: ReactNode; icon?: ReactNode; pressed?: boolean;
}): ReactElement;
export function Timeline(props: Omit<Props<'ol'>, 'children'> & {
  items: readonly { id: string | number; title: ReactNode; detail?: ReactNode }[];
}): ReactElement;
