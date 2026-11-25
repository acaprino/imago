// A page for a second window of the demo: a notice that floats over the desktop, in a transparent window of its own. It is started as
// a secondary page, so the shell asks the plugin nothing of this window, the page paints no ground and follows the scheme the main window
// keeps. The window is built and shown by the app (src-tauri), not by the shell.
import { Button, Card, Cluster, Column, Heading, Text } from '@acaprino/sigrid/primitives';
import { defineApp, startApp } from '@acaprino/imago';
import '@acaprino/sigrid/styles.css';

const DEMO = defineApp({
  id: 'imago-demo',
  name: 'Imago demo',
  lang: 'en',
  // design-check-ignore-next-line color-value: the demo's accent, the one colour an app gives
  accent: '#006398',
  storage: { scheme: 'imago.scheme', zoom: 'imago.zoom', sidebar: 'imago.sidebar' },
});

function Notice() {
  return (
    <Card as="section" aria-label="A notice">
      <Column gap="sm">
        <Heading size="small" level={2}>The job is done</Heading>
        <Text as="p" variant="soft">This page is a second window: no frame, no ground of its own.</Text>
        <Cluster><Button size="sm">Open</Button></Cluster>
      </Column>
    </Card>
  );
}

startApp(DEMO, document.getElementById('app')!, <Notice />, { secondary: true });
