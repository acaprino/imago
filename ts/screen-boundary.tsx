// A screen that fails while it is drawn says so in its own place, and the frame around it stays: the window can still be
// moved and closed, and another view opened. React draws such a place only from a class.
import { Component, type ReactNode } from 'react';
import { Button, Column, Icon, Text } from '@acaprino/sigrid/primitives';
import { Note } from '@acaprino/sigrid/components';
import { focusContent } from './focus.js';
import { useShell } from './shell.js';

function Failed({ error, retry }: { error: unknown; retry: () => void }) {
  const { words } = useShell();
  return (
    <Column pad="lg">
      <Note tone="error" title={words.screenFailed} actions={<Button variant="outline" onClick={retry}><Icon name="refresh" />{words.retry}</Button>}>
        <Text pre data-selectable="">{error instanceof Error ? error.message : String(error)}</Text>
      </Note>
    </Column>
  );
}

/** Draws its children, or what failed in them with a button that draws them again. */
export class ScreenBoundary extends Component<{ children?: ReactNode }, { failed: boolean; error: unknown }> {
  override state = { failed: false, error: undefined as unknown };

  static getDerivedStateFromError(error: unknown): { failed: boolean; error: unknown } {
    return { failed: true, error };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    // The button goes with the message: the content takes the focus.
    return <Failed error={this.state.error} retry={() => { focusContent(); this.setState({ failed: false, error: undefined }); }} />;
  }
}
