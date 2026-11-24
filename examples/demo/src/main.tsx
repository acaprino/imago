// The demo: one page on Sigrid in the window of imago-shell, or in a browser, where nothing of Tauri is called. Every part
// is Sigrid's; the page has no class, no style and no stylesheet of its own.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { colorTheme, useDesktopGuard, useMedia } from '@acaprino/sigrid';
import { Badge, Button, Column, Icon, Spacer, Switch, Text, type IconName } from '@acaprino/sigrid/primitives';
import { ItemList, ItemRow, SettingRow, Toasts, type ToastItem } from '@acaprino/sigrid/components';
import {
  AppShell, Inspector, Panel, TitleBar, Toolbar, ToolbarBrand, ToolbarButton, ToolbarSpacer, ToolbarTab, ToolbarTabs,
  WindowControls,
} from '@acaprino/sigrid/layout';
import {
  applyKeptScheme, CommandPalette, CommandsProvider, formatKeys, KeyHints, PALETTE_COMMAND, useCommand, useCommandPalette,
  useSchemeCommands,
} from '@acaprino/sigrid/assemblies';
import {
  DRAG_REGION, readHost, useSnapLayouts, useWindowControls, useWindowTheme, useZoom, type TauriErrorHandler,
} from '@acaprino/sigrid/tauri';
import { defineApp } from '@acaprino/imago';
import '@acaprino/sigrid/styles.css';

const DEMO = defineApp({
  id: 'imago-demo',
  name: 'Imago demo',
  // design-check-ignore-next-line color-value: the demo's accent, the one colour the theme is computed from
  accent: '#006398',
  storage: { scheme: 'imago.scheme', zoom: 'imago.zoom' },
});
const LOOK = {
  theme: colorTheme({ id: DEMO.id, label: DEMO.name, color: DEMO.accent, spot: 'balanced' }),
  storageKey: DEMO.storage.scheme,
};

// The two commands and the event of src-tauri/src/main.rs.
const THEME_COMMAND = 'set_window_theme';
const CAPTION_COMMAND = 'window_caption_maximize';
const CAPTION_EVENT = 'caption-maximize';

const HOST = readHost();

type View = 'window' | 'settings';
const VIEWS: { id: View; label: string; command: string; icon: IconName }[] = [
  { id: 'window', label: 'Window', command: 'Go to Window', icon: 'layers' },
  { id: 'settings', label: 'Settings', command: 'Go to Settings', icon: 'settings' },
];

const PARTS = [
  { id: 'bar', title: 'Title bar', about: 'Its empty parts move the window, a double press maximizes it.' },
  { id: 'buttons', title: 'Window buttons', about: 'Minimize, maximize and close. Snap Layouts open on the middle one.' },
  { id: 'zoom', title: 'Zoom', about: 'Ctrl with + - 0 or the wheel, from 50% to 200%, kept on this machine.' },
  { id: 'theme', title: 'Light and dark', about: 'Three commands of the palette. The window is told, and keeps the choice for its first frame.' },
];

function App() {
  const [view, setView] = useState<View>('window');
  const [part, setPart] = useState<(typeof PARTS)[number] | null>(null);
  const [notices, setNotices] = useState<ToastItem[]>([]);
  const palette = useCommandPalette();
  const { choice, scheme } = useSchemeCommands(LOOK);

  const say = (text: string, kind?: 'error') => setNotices((list) => [...list, { id: crypto.randomUUID(), text, kind }]);
  const onError: TauriErrorHandler = (what, error) => say(`${what} failed: ${String(error)}`, 'error');
  // Reload and the developer tools stay in development.
  useDesktopGuard(HOST.ownWindow && !import.meta.env.DEV);
  const controls = useWindowControls({ onError });
  const snap = useSnapLayouts({ command: CAPTION_COMMAND, event: CAPTION_EVENT, onError });
  const { zoom } = useZoom({ storageKey: DEMO.storage.zoom, onError });
  // shortcut: a choice that leaves the scheme drawn as it was (from dark to the system's, on a dark Windows) is not sent, and
  // the window keeps the choice before it; until the shell has its own hook, which sends both.
  useWindowTheme(scheme, { command: THEME_COMMAND, args: (resolved) => ({ theme: choice, resolved }), onError });

  // The views: in the bar from 860px, at the foot under 620px in a browser, in a row under the bar otherwise.
  const wide = useMedia('(width >= 860px)');
  const phone = useMedia('(width < 620px)') && !HOST.ownWindow;
  const go = (next: View) => {
    setPart(null);
    setView(next);
  };
  for (const { id, command, icon } of VIEWS) { // the list never changes, so neither does the order of the hooks
    useCommand({ id: `demo.view.${id}`, label: command, group: 'Views', icon: <Icon name={icon} />, checked: view === id, run: () => go(id) });
  }
  const tabs = (
    <ToolbarTabs aria-label="Views" value={view} onValueChange={(next) => go(next as View)} edge={phone ? 'top' : 'bottom'} layout={phone ? 'stacked' : 'inline'}>
      {VIEWS.map(({ id, label, icon }) => <ToolbarTab key={id} value={id} icon={phone ? <Icon name={icon} /> : undefined}>{label}</ToolbarTab>)}
    </ToolbarTabs>
  );
  const row = <Toolbar aria-label="Views of the window">{tabs}</Toolbar>;

  return (
    <>
      <AppShell
        frame="sheet"
        desktop={HOST.ownWindow}
        contentLabel={VIEWS.find(({ id }) => id === view)!.label}
        titleBar={
          <TitleBar dragProps={HOST.ownWindow ? DRAG_REGION : undefined} windowControls={HOST.ownWindow ? <WindowControls {...controls} {...snap} /> : undefined}>
            <Toolbar aria-label={DEMO.name}>
              <ToolbarBrand name={DEMO.name} />
              {wide && tabs}
              <ToolbarSpacer />
              <ToolbarButton label="Commands" icon={<Icon name="search" />} shortcut={formatKeys('Ctrl+K')} variant="outline" onClick={() => palette.setOpen(true)}>Commands</ToolbarButton>
            </Toolbar>
          </TitleBar>
        }
        tabs={!wide && !phone && row}
        bottomBar={phone && row}
        status={
          <>
            <Badge variant="secondary">{HOST.ownWindow ? 'Window' : 'Browser'}</Badge>
            <Spacer />
            <Text>{scheme === 'dark' ? 'Dark' : 'Light'} · zoom {Math.round(zoom * 100)}%</Text>
          </>
        }
        inspector={view === 'window' && (
          <Inspector title="Part" open={part !== null} onOpenChange={(open) => { if (!open) setPart(null); }}>
            {part && <Column gap="md"><Text variant="strong">{part.title}</Text><Text as="p">{part.about}</Text></Column>}
          </Inspector>
        )}
        actions={view === 'window' && <Button onClick={() => say('A notice of the demo')}>Show a notice</Button>}
        footer={!phone && <><Text>{PARTS.length} parts</Text><Spacer /><KeyHints ids={[PALETTE_COMMAND, { keys: 'F6', label: 'Next region' }]} /></>}
      >
        {view === 'window' ? (
          <Panel title="Parts of the window" subtitle={`${PARTS.length} parts`}>
            <Column pad="md">
              <ItemList aria-label="Parts of the window">
                {PARTS.map((item) => <ItemRow key={item.id} title={item.title} description={item.about} current={item === part} onClick={() => setPart(item)} />)}
              </ItemList>
            </Column>
          </Panel>
        ) : (
          <Panel title="Settings">
            <Column gap="md" pad="lg" width="prose">
              <SettingRow label="Say hello" description="A switch of Sigrid" control={<Switch aria-label="Say hello" defaultChecked />} />
              <Text as="p" variant="soft">Light, dark and the system's look are in the palette.</Text>
            </Column>
          </Panel>
        )}
      </AppShell>
      <Toasts items={notices} durationMs={5000} onDismiss={(id) => setNotices((list) => list.filter((notice) => notice.id !== id))} />
    </>
  );
}

applyKeptScheme(LOOK);
createRoot(document.getElementById('app')!).render(
  <StrictMode><CommandsProvider><App /><CommandPalette /></CommandsProvider></StrictMode>,
);
