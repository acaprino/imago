// The React binding's types, as an app writes against them. tests/react.test.ts compiles this file with tsc against
// @types/react: every line below a @ts-expect-error must be a type error (tsc fails on a directive with nothing to
// expect), and every other line must compile.
import { useRef } from 'react';
import { ListAction, Shell, Workbench } from '../../react/index.js';

export function App() {
  // The element `mountApp(shell, registry, ...)` takes.
  const shell = useRef<HTMLDivElement>(null);
  const callback = (element: HTMLDivElement | null): void => void element;
  return (
    <>
      <Shell ref={shell} skipLabel="Skip to content" inspector="wide">
        <Workbench aria-label="Viewer" detailsLabel="Details" navigation={<ListAction title="First" rail="F" />} navigationLabel="Threads" />
      </Shell>
      <Shell ref={callback} skipLabel="Skip to content" sidebar={false} />
      {/* @ts-expect-error the skip link's words are the app's */}
      <Shell />
      {/* @ts-expect-error a ref to another element */}
      <Shell ref={useRef<HTMLButtonElement>(null)} skipLabel="Skip to content" />
      {/* @ts-expect-error the inspector's width is inspector="wide" on the Shell: Workbench has no wide */}
      <Workbench aria-label="Viewer" detailsLabel="Details" wide />
      {/* @ts-expect-error navigation comes with its label */}
      <Workbench aria-label="Viewer" detailsLabel="Details" navigation={<ListAction title="First" />} />
    </>
  );
}
