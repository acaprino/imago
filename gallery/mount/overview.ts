import { overviewStrip } from '../../ts/ui/index.ts';
import type { MountContext } from '../main.ts';

declare global {
  interface Window {
    /** What the sample strip reported, for tests/gallery/overview.mjs. */
    __overview?: { events: string[]; ink: () => { trace: string; band: string } };
  }
}

// A long list that scrolls by itself, with an overview strip at its right edge: the trace is one bar per row, the
// frame follows the scroll, a press or a drag on the strip scrolls the list, and the band stands for 40 rows that
// were archived above it.
export default function mount({ sections }: MountContext): () => void {
  const section = document.createElement('section');
  section.className = 'g-block';
  section.setAttribute('aria-label', 'Overview strip');
  const view = document.createElement('div');
  view.setAttribute('aria-label', 'Sample rows');
  view.style.cssText = 'position:relative;height:240px;';
  const list = document.createElement('div');
  list.style.cssText = 'position:absolute;inset:0 24px 0 0;overflow:auto;font:12px/20px monospace;';
  const ROWS = 400;
  for (let index = 0; index < ROWS; index++) {
    const row = document.createElement('div');
    row.textContent = `${'  '.repeat(index % 5)}row ${index}`;
    list.append(row);
  }
  const events: string[] = [];
  const BAND = 24;
  let hold = 0;
  const shape = () => ({ track: view.clientHeight - BAND, ratio: (view.clientHeight - BAND) / (ROWS * 20) });
  const scrollTo = (y: number) => {
    const { ratio } = shape();
    list.scrollTop = (y - BAND - hold) / ratio;
  };
  const strip = overviewStrip({
    press(y, on) {
      events.push(`press:${on}`);
      if (on === 'band') return false;
      const { ratio } = shape();
      const frameTop = BAND + list.scrollTop * ratio;
      const frameHeight = list.clientHeight * ratio;
      hold = on === 'frame' ? y - frameTop : frameHeight / 2;
      scrollTo(y);
      return true;
    },
    drag(y) { events.push('drag'); scrollTo(y); },
    release(completed) { events.push(`release:${completed}`); },
    wheel(delta) { events.push('wheel'); list.scrollTop += Math.sign(delta) * 60; },
  });
  const paint = () => {
    const { ratio } = shape();
    strip.setBand(BAND);
    strip.setFrame(BAND + list.scrollTop * ratio, Math.max(4, list.clientHeight * ratio));
    const { canvas } = strip;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ink = strip.ink();
    context.fillStyle = ink.band;
    context.fillRect(2, 2, width - 4, BAND - 4);
    context.fillStyle = ink.trace;
    for (let index = 0; index < ROWS; index++) context.fillRect(2 + (index % 5) * 2, BAND + index * 20 * ratio, 8, Math.max(1, 20 * ratio - 1));
  };
  list.addEventListener('scroll', paint);
  view.append(list, strip.element);
  section.append(view);
  sections.append(section);
  requestAnimationFrame(paint);
  window.__overview = { events, ink: strip.ink };
  return () => {
    strip.destroy();
    section.remove();
    delete window.__overview;
  };
}
