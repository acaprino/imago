// An overview strip: the whole of a scrolling view in miniature, at its edge, with a frame over what is on screen
// and an optional band at the top for what has scrolled out of the view into an archive. The app paints the trace
// in the canvas, says where the frame and the band are, and turns the strip's positions into its own lines; Imago
// draws the strip, the band and the frame, and reports presses, drags and the wheel. The strip is a pointer
// shortcut beside a view that scrolls by itself, so it is hidden from assistive technology.

export type OverviewTarget = 'band' | 'frame' | 'track';

/**
 * Where the strip sits in its host (a positioned element): its distance from the host's top, its end (right) edge and
 * its bottom, and its width. A number is pixels, a string any CSS length (`var(--im-s-4)`). What is left out is the
 * default: the whole height at the end edge, 20px wide. The strip writes the custom properties it reads from these;
 * an app never sets a `--im-` property itself (`imago-check`, rule `im-selector`).
 */
export interface OverviewPlacement {
  top?: number | string;
  end?: number | string;
  bottom?: number | string;
  width?: number | string;
}

export interface OverviewStripOptions extends OverviewPlacement {
  /** A press `y` pixels from the top, on the band, the frame or the rest of the track. `true` holds it: the moves
   * that follow are drags until the release. */
  press(y: number, on: OverviewTarget): boolean;
  drag(y: number): void;
  /** The hold ended: `completed` is false when the press was cancelled (the window lost the pointer). */
  release(completed: boolean): void;
  wheel(deltaY: number): void;
}

export interface OverviewStrip {
  element: HTMLDivElement;
  /** The app paints the trace here, in device pixels, in the colours of `ink()`. */
  canvas: HTMLCanvasElement;
  /** The colours of the trace and of the band, as the look gives them now (plain rgb()). */
  ink(): { trace: string; band: string };
  /** The frame over what is on screen, in pixels from the top of the strip. */
  setFrame(top: number, height: number): void;
  /** The band of archived content at the top; 0 hides it. */
  setBand(height: number): void;
  /** Moves or resizes the strip: the sides given are changed, the others stay. */
  place(placement: OverviewPlacement): void;
  destroy(): void;
}

// The custom property of the stylesheet that each side of the placement is written to.
const PLACED: readonly (readonly [keyof OverviewPlacement, string])[] = [
  ['top', '--im-overview-top'],
  ['end', '--im-overview-end'],
  ['bottom', '--im-overview-bottom'],
  ['width', '--im-overview-width'],
];

export function overviewStrip(options: OverviewStripOptions): OverviewStrip {
  const element = document.createElement('div');
  element.className = 'im-overview';
  element.setAttribute('aria-hidden', 'true');
  const place = (placement: OverviewPlacement): void => {
    for (const [side, property] of PLACED) {
      const value = placement[side];
      if (value !== undefined) element.style.setProperty(property, typeof value === 'number' ? `${value}px` : value);
    }
  };
  place(options);
  const band = document.createElement('div');
  band.className = 'im-overview-band';
  band.hidden = true;
  const canvas = document.createElement('canvas');
  const frame = document.createElement('div');
  frame.className = 'im-overview-frame';
  element.append(band, canvas, frame);
  let bandHeight = 0;
  let frameTop = 0;
  let frameHeight = 0;
  let holding = false;

  const at = (event: PointerEvent): number => event.clientY - element.getBoundingClientRect().top;
  const onDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const y = at(event);
    const on: OverviewTarget = y < bandHeight ? 'band' : y >= frameTop && y < frameTop + frameHeight ? 'frame' : 'track';
    if (!options.press(y, on)) return;
    holding = true;
    element.dataset.imDragging = '';
    element.setPointerCapture?.(event.pointerId);
  };
  const onMove = (event: PointerEvent): void => { if (holding) options.drag(at(event)); };
  const end = (completed: boolean): void => {
    if (!holding) return;
    holding = false;
    delete element.dataset.imDragging;
    options.release(completed);
  };
  const onUp = (): void => end(true);
  const onCancel = (): void => end(false);
  const onWheel = (event: WheelEvent): void => { event.preventDefault(); options.wheel(event.deltaY); };
  element.addEventListener('pointerdown', onDown);
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onUp);
  element.addEventListener('pointercancel', onCancel);
  element.addEventListener('wheel', onWheel, { passive: false });

  return {
    element,
    canvas,
    ink: () => ({ trace: getComputedStyle(element).color, band: getComputedStyle(band).color }),
    setFrame(top, height) {
      frameTop = top;
      frameHeight = height;
      frame.style.top = `${top}px`;
      frame.style.height = `${height}px`;
    },
    place,
    setBand(height) {
      bandHeight = height;
      band.hidden = !height;
      band.style.height = `${height}px`;
    },
    destroy() {
      element.removeEventListener('pointerdown', onDown);
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onCancel);
      element.removeEventListener('wheel', onWheel);
      element.remove();
    },
  };
}
