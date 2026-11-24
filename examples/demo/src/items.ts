// The data of the demo.
import type { BadgeTone, IconName } from '@acaprino/sigrid/primitives';

export type State = 'done' | 'running' | 'late' | 'failed';
export type Item = { id: string; title: string; about: string; state: State; size: string };

export const STATES: { id: State; label: string; tone: BadgeTone; icon: IconName }[] = [
  { id: 'done', label: 'Done', tone: 'success', icon: 'check' },
  { id: 'running', label: 'Running', tone: 'info', icon: 'refresh' },
  { id: 'late', label: 'Late', tone: 'warning', icon: 'alert' },
  { id: 'failed', label: 'Failed', tone: 'danger', icon: 'error' },
];

export const ITEMS: Item[] = [
  { id: 'a', title: 'Browser cache', about: 'Pages and images saved to load faster', state: 'done', size: '1.50 GB' },
  { id: 'b', title: 'Model cache', about: 'Models downloaded for local tools', state: 'running', size: '14.0 GB' },
  { id: 'c', title: 'Package cache', about: 'Packages a package manager downloaded, with every version that was ever asked for by a project of this machine', state: 'late', size: '2.10 GB' },
  { id: 'd', title: 'Temporary files', about: 'Left behind by installers', state: 'failed', size: '640 MB' },
  { id: 'e', title: 'Cookies', about: 'Sites in the keep list stay signed in', state: 'done', size: '40 MB' },
  { id: 'f', title: 'Thumbnails', about: 'Small pictures of the files in a folder', state: 'done', size: '212 MB' },
];
