// Notes, in the browser. A note styles its own text only: the buttons, the chip and the key cap of a block note's actions
// draw exactly as they do outside any note, and read at 4.5:1 on the note. The compact note from noteHtml draws as the
// matrix's note. The gallery mounts the notes in gallery/mount/notes.ts.
import assert from 'node:assert/strict';

const LOOKS = ['smooth', 'oni'];
const THEMES = ['dark', 'light'];
const APPS = ['xiox', 'mukade', 'shinatama', 'muro', 'daodan'];
// The parts of the actions, each with what carries its text.
const PARTS = {
  'primary button': '.im-btn--primary > span',
  'neutral button': '.im-btn:not(.im-btn--primary) > span',
  chip: '.im-chip',
  'key cap': '.im-key',
};
// What a note must not change on the text of its actions.
const STYLE = ['fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'color', 'display', 'letterSpacing', 'textTransform'];

async function show(page, state) {
  await page.evaluate((s) => window.__imago.set(s), state);
  await page.waitForFunction(
    ({ look, theme, app }) => {
      const box = document.getElementById('im-gallery-notes');
      return box?.getAttribute('data-im-look') === look && box.getAttribute('data-im-theme') === theme && box.getAttribute('data-im-app') === app;
    },
    state,
  );
}

const measure = (page) =>
  page.evaluate(({ parts, style }) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const flatten = (colours) => {
      g.clearRect(0, 0, 1, 1);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 1, 1);
      for (const c of colours) {
        g.fillStyle = c;
        g.fillRect(0, 0, 1, 1);
      }
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    // The colours under an element, outermost first: every background, and over each the wash of a button (an inset shadow).
    const under = (el) => {
      const layers = [];
      for (let node = el; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        const own = [];
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') own.push(s.backgroundColor);
        for (const wash of s.boxShadow.matchAll(/((?:rgba?|color|oklch|hsla?)\([^)]*\)) 0px 0px 0px (\d+(?:\.\d+)?)px inset/g)) {
          if (Number(wash[2]) >= 50) own.push(wash[1]);
        }
        layers.unshift(...own);
      }
      return layers;
    };
    const channel = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const luminance = ([r, g2, b]) => 0.2126 * channel(r) + 0.7152 * channel(g2) + 0.0722 * channel(b);
    const ratio = (a, b) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const contrastOf = (el) => ratio(flatten([...under(el), getComputedStyle(el).color]), flatten(under(el)));
    // Whether the element's own ground hides what is under it: its contrast is then the same in a note and out of one.
    const opaqueGround = (el) => {
      const colour = getComputedStyle(el.closest('.im-btn, .im-chip, .im-key') ?? el).backgroundColor;
      return /^rgb\(/.test(colour) || /^rgba\([^)]*,\s*1\)$/.test(colour);
    };
    const worstText = (root) => {
      let worst = { ratio: Infinity, text: '' };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const holder = node.parentElement;
        if (getComputedStyle(holder).display === 'none') continue;
        const r = contrastOf(holder);
        if (r < worst.ratio) worst = { ratio: r, text: node.textContent.trim() };
      }
      return worst;
    };
    const pick = (el) => Object.fromEntries(style.map((name) => [name, getComputedStyle(el)[name]]));
    const box = document.getElementById('im-gallery-notes');
    const outside = box.querySelector('[data-g-note="outside"]');
    const twin = Object.fromEntries(Object.entries(parts).map(([name, selector]) => {
      const el = outside.querySelector(selector);
      return [name, { style: pick(el), contrast: contrastOf(el), opaque: opaqueGround(el) }];
    }));
    const notes = [...box.querySelectorAll('[data-g-note="block"]')].map((holder) => {
      const note = holder.querySelector('.im-note');
      return {
        tone: holder.dataset.gTone,
        block: note.classList.contains('im-note--block'),
        worst: worstText(note),
        parts: Object.fromEntries(Object.entries(parts).map(([name, selector]) => {
          const el = note.querySelector(`.im-action-row ${selector}`);
          return [name, el ? { style: pick(el), contrast: contrastOf(el) } : null];
        })),
        title: pick(note.querySelector(':scope > b')),
        label: pick(note.querySelector(':scope > ul b')),
      };
    });
    // The compact note from noteHtml, and the matrix's note: the same title and line.
    const compact = box.querySelector('[data-g-note="compact"] .im-note');
    const matrix = document.querySelector('#im-gallery-matrix [data-control="note"] .im-note');
    const text = (note) => (note ? { icon: Boolean(note.querySelector(':scope > .im-icon')), title: pick(note.querySelector(':scope > div > b')), line: pick(note.querySelector(':scope > div > span')) } : null);
    return { twin, notes, compact: text(compact), matrix: text(matrix), compactWorst: worstText(compact) };
  }, { parts: PARTS, style: STYLE });

export default async function (page) {
  for (const look of LOOKS) {
    for (const theme of THEMES) {
      for (const app of APPS) {
        await show(page, { app, look, theme, glass: false, width: 1160 });
        const where = (message) => `${look} ${theme} ${app}: ${message}`;
        const { twin, notes, compact, matrix, compactWorst } = await measure(page);
        assert.equal(notes.length, 4, where('a block note in each status tone'));

        for (const note of notes) {
          const at = (message) => where(`${note.tone} note: ${message}`);
          assert.ok(note.block, at('a note with a list and actions is a block'));
          assert.ok(note.worst.ratio >= 4.5, at(`"${note.worst.text}" is ${note.worst.ratio.toFixed(2)}:1`));
          for (const [name, part] of Object.entries(note.parts)) {
            assert.ok(part, at(`its actions hold the ${name}`));
            assert.deepEqual(part.style, twin[name].style, at(`the ${name} in a note draws its text as outside any note`));
            assert.ok(part.contrast >= 4.5, at(`the ${name} reads at ${part.contrast.toFixed(2)}:1`));
            if (twin[name].opaque) {
              assert.ok(Math.abs(part.contrast - twin[name].contrast) < 0.01, at(`the ${name} reads at ${part.contrast.toFixed(2)}:1, outside a note ${twin[name].contrast.toFixed(2)}:1`));
            }
          }
          // The note's own text: the title in the head font's weight and the high text colour; a list label the same, in the line.
          assert.equal(note.title.fontWeight, '600', at('the title is 600'));
          assert.equal(note.title.display, 'block', at('the title is a line of its own'));
          assert.equal(note.label.fontWeight, '600', at('a list label is 600'));
          assert.equal(note.label.display, 'inline', at('a list label stays in its line'));
          assert.equal(note.label.color, note.title.color, at('a list label has the colour of the title'));
        }

        assert.ok(compact.icon, where('the compact note has its icon'));
        assert.deepEqual(compact, matrix, where("noteHtml's compact note draws its icon, title and line as the matrix's note"));
        assert.equal(compact.line.fontSize, '12px', where("the note's line is 12"));
        assert.ok(compactWorst.ratio >= 4.5, where(`compact note: "${compactWorst.text}" is ${compactWorst.ratio.toFixed(2)}:1`));
      }
    }
  }
}
