// The one window of an app of the suite: Sigrid's frame with its regions in one order, the views where the width puts them,
// and the keys every app has. An app fills the regions and draws its screen; it draws no frame.
import { useState, type ReactNode } from 'react';
import { useMedia, useWords } from '@acaprino/sigrid';
import { Icon, Spacer, type IconName } from '@acaprino/sigrid/primitives';
import { AppShell, DrawerButton, TitleBar, Toolbar, ToolbarBrand, ToolbarButton, ToolbarSpacer, ToolbarTab, ToolbarTabs, WindowControls } from '@acaprino/sigrid/layout';
import { CommandPalette, formatKeys, KeyHints, useCommand, useCommandPalette, type KeyHint } from '@acaprino/sigrid/assemblies';
import { DRAG_REGION, useSnapLayouts, useWindowControls } from '@acaprino/sigrid/tauri';
import { focusContent, useFocusKept } from './focus.js';
import { ScreenBoundary } from './screen-boundary.js';
import { useShell } from './shell.js';

/** A view of the app: a place in the bar, and a command of the palette. */
export interface AppView<Id extends string = string> {
  id: Id;
  label: string;
  icon: IconName;
  /** The name of its command («Go to the graph»). Absent: its label. */
  command?: string;
  /** After its word: a `Count`. */
  end?: ReactNode;
}

/** The state of the sidebar where it is a drawer: the props of Sigrid's `Sidebar`. */
export interface Drawer {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface AppWindowProps<Id extends string = string> {
  views: readonly AppView<Id>[];
  view: Id;
  /** The person chose a view, by its place or by its command. */
  onView: (view: Id) => void;
  /** The tools of the view in the title bar, before «Commands». */
  tools?: ReactNode;
  status?: ReactNode;
  /** The `Sidebar`, given the state of its drawer. The same in every view, so that the bar keeps its places. */
  sidebar?: (drawer: Drawer) => ReactNode;
  /** The `Inspector` of what is selected. */
  inspector?: ReactNode;
  /** The actions on the content, the primary one last. */
  actions?: ReactNode;
  /** The line at the start of the foot. A phone has no foot. */
  footer?: ReactNode;
  /** The keys of the app in the foot, before the shell's: ids of its commands, or keys with their words. */
  hints?: readonly (string | KeyHint)[];
  /** What Ctrl+F does in this view. Absent or null: the view has no search, and the shell says so. */
  search?: (() => void) | null;
  /** The name of the content, for screen readers. Absent: the label of the view. */
  contentLabel?: string;
  children?: ReactNode;
}

const SEARCH = 'imago.search';

/** A view as a command: from the palette the focus goes to the content, from the bar it stays on the view's place. */
function ViewCommand({ view, checked, run }: { view: AppView; checked: boolean; run: () => void }) {
  const { words } = useShell();
  useCommand({
    id: `imago.view.${view.id}`, label: view.command ?? view.label, group: words.views, icon: <Icon name={view.icon} />, checked,
    run: () => {
      run();
      focusContent();
    },
  });
  return null;
}

/** The window of the app, with its screen as the children. */
export function AppWindow<Id extends string>({ views, view, onView, tools, status, sidebar, inspector, actions, footer, hints = [], search, contentLabel, children }: AppWindowProps<Id>) {
  const { app, words, notify, window: { own }, failed } = useShell();
  const commands = useWords().palette.command;
  const palette = useCommandPalette();
  const [open, setOpen] = useState(false);
  const controls = useWindowControls({ onError: failed });
  const snap = useSnapLayouts({ command: 'plugin:imago-shell|caption', event: 'caption-maximize', onError: failed });

  // The views: in the bar from 860px, at the foot under 620px in a browser, in a row under the bar otherwise.
  const wide = useMedia('(width >= 860px)');
  const narrow = useMedia('(width < 620px)');
  const phone = narrow && !own;
  useFocusKept(view, wide, phone);

  useCommand({ id: SEARCH, label: words.search, group: words.views, keys: 'Ctrl+F', icon: <Icon name="search" />, run: () => { if (search) search(); else notify(words.noSearch, { id: SEARCH }); } });
  const go = (next: string): void => {
    setOpen(false);
    onView(next as Id);
  };
  // In a row too narrow for the words side by side the icon goes over the word.
  const tabs = (
    <ToolbarTabs aria-label={words.views} value={view} onValueChange={go} edge={phone ? 'top' : 'bottom'} layout={narrow ? 'stacked' : 'inline'}>
      {views.map(({ id, label, icon, end }) => <ToolbarTab key={id} value={id} icon={narrow ? <Icon name={icon} /> : undefined}>{label}{end ? <> {end}</> : null}</ToolbarTab>)}
    </ToolbarTabs>
  );
  const row = <Toolbar aria-label={words.views}>{tabs}</Toolbar>;
  const navigation = sidebar?.({ open, onOpenChange: setOpen });

  return (
    <>
      {views.map((item) => <ViewCommand key={item.id} view={item} checked={item.id === view} run={() => go(item.id)} />)}
      <AppShell
        frame="sheet"
        desktop={own}
        contentLabel={contentLabel ?? views.find(({ id }) => id === view)?.label ?? app.name}
        titleBar={
          <TitleBar dragProps={own ? DRAG_REGION : undefined} windowControls={own ? <WindowControls {...controls} {...snap} /> : undefined}>
            <Toolbar aria-label={app.name}>
              {navigation ? <DrawerButton onOpen={() => setOpen(true)} /> : null}
              <ToolbarBrand name={app.name} />
              {wide ? tabs : null}
              <ToolbarSpacer />
              {tools}
              <ToolbarButton label={commands} icon={<Icon name="search" />} shortcut={formatKeys('Ctrl+K')} variant="outline" onClick={() => palette.setOpen(true)}>{commands}</ToolbarButton>
            </Toolbar>
          </TitleBar>
        }
        tabs={wide || phone ? undefined : row}
        bottomBar={phone ? row : undefined}
        status={status}
        sidebar={navigation}
        inspector={inspector}
        actions={actions}
        footer={phone ? undefined : <>{footer}<Spacer /><KeyHints ids={[...hints, ...(search ? [SEARCH] : []), { keys: 'F6', label: words.nextRegion }]} /></>}
      >
        <ScreenBoundary key={view}>{children}</ScreenBoundary>
        {/* Inside the frame, so that in a window it opens under the title bar. */}
        <CommandPalette />
      </AppShell>
    </>
  );
}
