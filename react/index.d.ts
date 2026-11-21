import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from 'react';

type Props<T extends 'main' | 'ol' | 'section' | 'button'> = Omit<ComponentPropsWithoutRef<T>, 'className'>;
export function TabList<T extends string>(props: {
  label: string; value: T; onSelect: (value: T) => void;
  tabs: readonly { value: T; id: string; panel: string; label: ReactNode; disabled?: boolean }[];
}): ReactElement;
export function Disclosure(props: { label: ReactNode; children?: ReactNode }): ReactElement;
export function Workbench(props: Props<'main'> & { navigation: ReactNode; details: ReactNode }): ReactElement;
export function DetailPanel(props: Props<'section'>): ReactElement;
export function ListAction(props: Omit<Props<'button'>, 'title' | 'children' | 'type' | 'aria-pressed'> & {
  title: ReactNode; detail?: ReactNode; icon?: ReactNode; pressed?: boolean;
}): ReactElement;
export function Timeline(props: Omit<Props<'ol'>, 'children'> & {
  items: readonly { id: string | number; title: ReactNode; detail?: ReactNode }[];
}): ReactElement;
