// The demo: a small app on the shell, as an app of the suite writes it. It has its identity, its views and its screens; the
// frame, the palette, the notices, the look and the window are the shell's.
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Count, Icon, Progress, Spacer, Text } from '@acaprino/sigrid/primitives';
import { NavItem, Sidebar, SidebarGroup, SidebarRow, ToolbarButton } from '@acaprino/sigrid/layout';
import { useCommand } from '@acaprino/sigrid/assemblies';
import { AppWindow, defineApp, startApp, useNotify, useWindow, type AppView } from '@acaprino/imago';
import '@acaprino/sigrid/styles.css';
import { ITEMS, KINDS, STATES, type Item, type Kind, type State } from './items';
import { Broken, Form, ItemDetails, Items, mend, Words } from './screens';

const DEMO = defineApp({
  id: 'imago-demo',
  name: 'Imago demo',
  lang: 'en',
  // design-check-ignore-next-line color-value: the demo's accent, the one colour an app gives
  accent: '#006398',
  storage: { scheme: 'imago.scheme', zoom: 'imago.zoom', sidebar: 'imago.sidebar' },
});

type View = 'items' | 'new' | 'notices' | 'broken' | 'window';

function Demo() {
  const notify = useNotify();
  const window_ = useWindow();
  const [view, setView] = useState<View>('items');
  const [state, setState] = useState<State | null>(null);
  const [items, setItems] = useState<readonly Item[]>(ITEMS);
  const [chosen, setChosen] = useState<Item | null>(null);
  const [asked, setAsked] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => window_.onShown(() => notify('The window is back.')), [notify, window_]);
  // The job of the app: how far it is, in percent, while it runs.
  const [job, setJob] = useState<number | null>(null);
  useEffect(() => {
    window_.setProgress(job);
    if (job === null) return;
    const timer = setTimeout(() => {
      setJob(job >= 100 ? null : job + 10);
      if (job >= 100) notify('All items are checked.');
    }, 300);
    return () => clearTimeout(timer);
  }, [job, notify, window_]);

  const { holds } = KINDS.find(({ id }) => id === kind)!;
  const shown = items.filter((item) => (state === null || item.state === state) && holds(item) && item.title.toLowerCase().includes(asked.toLowerCase()));
  const go = (next: View) => {
    setChosen(null);
    setView(next);
  };
  const filter = (next: State | null) => {
    setState(next);
    go('items');
  };
  const add = (item: Item) => {
    setItems((now) => [item, ...now]);
    filter(null);
    notify(`«${item.title}» is in the list.`, { undo: { onClick: () => setItems((now) => now.filter((other) => other !== item)) } });
  };
  useCommand({ id: 'demo.check', label: 'Check all items', group: 'Items', keys: 'Ctrl+Enter', icon: <Icon name="refresh" />, when: job === null, run: () => setJob(0) });
  useCommand({ id: 'demo.close', label: 'Close the details', group: 'Items', keys: 'Escape', icon: <Icon name="close" />, when: chosen !== null, run: () => setChosen(null) });

  const views: AppView<View>[] = [
    { id: 'items', label: 'Items', command: 'Go to Items', icon: 'layers', count: items.length },
    { id: 'new', label: 'New item', command: 'Go to New item', icon: 'plus' },
    { id: 'notices', label: 'Notices', command: 'Go to Notices', icon: 'info' },
    { id: 'broken', label: 'Failure', command: 'Go to Failure', icon: 'alert' },
    { id: 'window', label: 'Window', command: 'Go to Window', icon: 'windowMaximize' },
  ];
  return (
    <AppWindow
      views={views}
      view={view}
      onView={go}
      tools={view === 'broken' && <ToolbarButton label="Mend the screen" icon={<Icon name="check" />} onClick={() => { mend(); notify('The screen is mended. Try it again.'); }} />}
      search={view === 'items' ? () => field.current?.focus() : null}
      status={
        <>
          {job === null ? <Badge tone="success">Ready</Badge> : <Badge tone="info">Checking</Badge>}
          {job === null ? <Text variant="soft">{items.length} items</Text> : <Progress aria-label="Items checked" value={job} size="sm" inline />}
          <Spacer />
          <Text>{window_.own ? 'Window' : 'Browser'}</Text>
        </>
      }
      sidebar={(sidebar) => (
        <Sidebar aria-label="States" header={<SidebarRow>States <Count value={STATES.length} label="states" /></SidebarRow>} {...sidebar}>
          <SidebarGroup>
            <NavItem icon={<Icon name="all" />} current={view === 'items' && state === null} end={<Count value={items.length} label="items" reserve />} onClick={() => { sidebar.onOpenChange(false); filter(null); }}>All</NavItem>
            {STATES.map(({ id, label, icon }) => (
              <NavItem key={id} icon={<Icon name={icon} />} current={view === 'items' && state === id} end={<Count value={items.filter((item) => item.state === id).length} label="items" reserve />} onClick={() => { sidebar.onOpenChange(false); filter(id); }}>{label}</NavItem>
            ))}
          </SidebarGroup>
        </Sidebar>
      )}
      inspector={view === 'items' && <ItemDetails item={chosen} close={() => setChosen(null)} />}
      actions={view === 'items' && (
        <>
          <Button variant="outline" disabled={job !== null} onClick={() => setJob(0)}><Icon name="refresh" />Check all</Button>
          <Button onClick={() => go('new')}><Icon name="plus" />New item</Button>
        </>
      )}
      footer={<Text>{shown.length} of {items.length} shown</Text>}
      hints={['demo.check']}
    >
      {view === 'items' && <Items items={shown} chosen={chosen} choose={setChosen} asked={asked} ask={setAsked} field={field} kind={kind} filter={setKind} />}
      {view === 'new' && <Form add={add} cancel={() => go('items')} />}
      {/* One screen of two views: it is kept between them, with what was typed in it. */}
      {(view === 'notices' || view === 'window') && <Words view={view} />}
      {view === 'broken' && <Broken />}
    </AppWindow>
  );
}

startApp(DEMO, document.getElementById('app')!, <Demo />);
