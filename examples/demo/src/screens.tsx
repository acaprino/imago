// The screens of the demo: a list with its details, a form, the words of two views, and one that fails.
import { useState, type RefObject } from 'react';
import { useMedia } from '@acaprino/sigrid';
import { Badge, Button, Cluster, Column, Icon, Input, Select, Switch, Text, Textarea, ToggleGroup, ToggleGroupItem } from '@acaprino/sigrid/primitives';
import { DescriptionList, Empty, FormField, ItemList, ItemRow, SearchField, SettingRow } from '@acaprino/sigrid/components';
import { Inspector, Panel } from '@acaprino/sigrid/layout';
import { useGlass, useNotify, useWindow } from '@acaprino/imago';
import { KINDS, STATES, type Item, type Kind, type State } from './items';

function StateBadge({ state }: { state: State }) {
  const { tone, label } = STATES.find(({ id }) => id === state)!;
  return <Badge tone={tone}>{label}</Badge>;
}

type ItemsProps = {
  items: readonly Item[]; chosen: Item | null; choose: (item: Item) => void;
  asked: string; ask: (text: string) => void; field: RefObject<HTMLInputElement | null>;
  kind: Kind; filter: (kind: Kind) => void;
};

export function Items({ items, chosen, choose, asked, ask, field, kind, filter }: ItemsProps) {
  // The filter is beside the search where both fit, and under it elsewhere.
  const beside = useMedia('(width >= 620px)');
  const tools = (
    <>
      <Column fill={beside} width={beside ? undefined : 'page'}>
        <SearchField ref={field} aria-label="Search the items" placeholder="Search the items" value={asked} onValueChange={ask} />
      </Column>
      <ToggleGroup aria-label="Which items" value={kind} onValueChange={filter}>
        {KINDS.map(({ id, label }) => <ToggleGroupItem key={id} value={id}>{label}</ToggleGroupItem>)}
      </ToggleGroup>
    </>
  );
  return (
    <Panel title="Items" subtitle={`${items.length} shown`} tools={tools}>
      {items.length === 0 ? <Empty fill title="No items" description="No item is in this state and has these words." /> : (
        <Column pad="md">
          <ItemList aria-label="Items">
            {items.map((item) => <ItemRow key={item.id} title={item.title} description={item.about} meta={item.size} end={<StateBadge state={item.state} />} current={item === chosen} onClick={() => choose(item)} />)}
          </ItemList>
        </Column>
      )}
    </Panel>
  );
}

export function ItemDetails({ item, close }: { item: Item | null; close: () => void }) {
  const notify = useNotify();
  return (
    <Inspector
      title="Item"
      open={item !== null}
      onOpenChange={(open) => { if (!open) close(); }}
      footer={<><Button variant="outline" onClick={close}>Close</Button><Button variant="outline" onClick={() => notify(`«${item?.title}» is being checked.`)}><Icon name="refresh" />Check</Button></>}
    >
      {item && (
        <Column gap="lg">
          <Cluster><Text variant="strong">{item.title}</Text><StateBadge state={item.state} /></Cluster>
          <Text as="p">{item.about}</Text>
          <DescriptionList items={[{ name: 'Size', value: item.size }, { name: 'Id', value: item.id, code: true }]} />
        </Column>
      )}
    </Inspector>
  );
}

let made = 0;

export function Form({ add, cancel }: { add: (item: Item) => void; cancel: () => void }) {
  const [title, setTitle] = useState('');
  const [about, setAbout] = useState('');
  const [state, setState] = useState<State>('running');
  const [tried, setTried] = useState(false);
  const missing = title.trim() === '';
  const save = () => {
    setTried(true);
    if (!missing) add({ id: `new-${++made}`, title: title.trim(), about, state, size: '0 MB' });
  };
  return (
    <Panel title="New item" footer={<><Button variant="outline" onClick={cancel}>Cancel</Button><Button onClick={save}>Add the item</Button></>}>
      <Column gap="lg" pad="lg" width="prose">
        <FormField label="Name" required error={tried && missing ? 'Write a name.' : undefined}><Input value={title} onChange={(event) => setTitle(event.target.value)} /></FormField>
        <FormField label="What it is" help="A sentence for the list."><Textarea value={about} onChange={(event) => setAbout(event.target.value)} /></FormField>
        <FormField label="State"><Select value={state} onValueChange={(value) => setState(value as State)} options={STATES.map(({ id, label }) => ({ value: id, label }))} /></FormField>
        <SettingRow label="Check it every day" description="Off: only when you ask" control={<Switch aria-label="Check it every day" defaultChecked />} />
      </Column>
    </Panel>
  );
}

/** The screen of two views: the words typed in it are said in a notice, or are the title of the window, whose glass is set there. */
export function Words({ view }: { view: 'notices' | 'window' }) {
  const notify = useNotify();
  const window_ = useWindow();
  const [glass, setGlass] = useGlass();
  const [words, setWords] = useState('3 items · Imago demo');
  const about = view === 'window'
    ? 'The words are the title of the window, until it has its own again.'
    : 'A notice goes by itself. An error stays until it is closed. A notice with the id of one that is there takes its place, and is read again.';
  return (
    <Panel title={view === 'window' ? 'Window' : 'Notices'}>
      <Column gap="lg" pad="lg" width="prose">
        <Text as="p">{about}</Text>
        <FormField label="Words"><Input value={words} onChange={(event) => setWords(event.target.value)} /></FormField>
        {view === 'window' ? (
          <>
            <Cluster>
              <Button variant="outline" onClick={() => window_.setTitle(words)}>Title of the window</Button>
              <Button variant="outline" onClick={() => window_.setTitle(null)}>Its own title</Button>
            </Cluster>
            {/* A browser has no glass: the setting is in a window of its own. */}
            {window_.own && <SettingRow label="Glass" description="What is behind the window shows through it" control={<Switch aria-label="Glass" checked={glass} onCheckedChange={setGlass} />} />}
          </>
        ) : (
          <>
            <Cluster>
              <Button variant="outline" onClick={() => notify(words)}>The words</Button>
              <Button variant="outline" onClick={() => notify('The item is saved.')}>A notice</Button>
              <Button variant="outline" onClick={() => notify('The item is gone.', { undo: { onClick: () => notify('The item is back.') } })}>One with Undo</Button>
              <Button variant="outline" onClick={() => notify('The server did not answer.', { kind: 'error' })}>An error</Button>
              <Button variant="outline" onClick={() => notify('The server is busy.', { id: 'busy' })}>Always the same</Button>
            </Cluster>
            <Cluster>{STATES.map(({ id }) => <StateBadge key={id} state={id} />)}<Badge variant="secondary">Neutral</Badge></Cluster>
          </>
        )}
      </Column>
    </Panel>
  );
}

let broken = true;
export const mend = () => { broken = false; };

/** A screen that fails while it is drawn, until it is mended. */
export function Broken() {
  if (broken) throw new Error('The file of this screen could not be read:\nitems.json, line 12');
  return <Panel title="Failure"><Empty fill title="The screen is drawn" description="It failed until it was mended." /></Panel>;
}
