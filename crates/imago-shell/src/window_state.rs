//! The window remembers where it was: position, size and whether it was maximized, in
//! `<data dir>/window.json`. A geometry that no longer fits the screens (a monitor was unplugged)
//! is brought back inside them; a corrupt file is ignored and the app places the window itself.
//!
//! Positions and sizes are physical pixels: the position is the window's outer corner, the size is
//! the page's (inner) size. The file is the one Xiox wrote before the shell was shared.
use serde::{Deserialize, Serialize};
use std::{fs, io, path::Path};

/// The saved place, next to the theme file.
const STATE_FILE: &str = "window.json";

/// Where the window was.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
}

/// A rectangle in physical pixels: a monitor, or the part of it that is not the taskbar.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

impl Rect {
    fn holds(&self, x: i32, y: i32) -> bool {
        let (left, top) = (i64::from(self.x), i64::from(self.y));
        let (x, y) = (i64::from(x), i64::from(y));
        x >= left
            && y >= top
            && x < left + i64::from(self.width)
            && y < top + i64::from(self.height)
    }
}

/// A monitor: its work area (the screen without the taskbar) and its full rectangle.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Screen {
    pub work: Rect,
    pub full: Rect,
}

impl Screen {
    /// A monitor whose work area is its whole rectangle.
    pub fn whole(rect: Rect) -> Self {
        Self {
            work: rect,
            full: rect,
        }
    }
}

/// The window brought inside one of `monitors` and to at least `min_width` x `min_height`. The
/// monitor is the one that holds the window's top-left corner; a corner on none (the monitor it
/// was saved on is gone) takes the first, so **pass the primary monitor first**. The window is cut
/// to the monitor and moved until all of it is inside. Without any monitor only the minimum is
/// applied.
///
/// Everything here is in physical pixels, the minimum too: the shell's own minimum width of 500
/// (`glass_window_config`) is in the window config's logical pixels, so the app multiplies it by
/// the monitor's scale factor before it passes it here.
///
/// For a window whose frame is not the page (a system title bar, a taskbar that is not on the
/// monitor's rectangle) see [`clamp_to_screens`].
pub fn clamp_to_monitors(
    state: WindowState,
    monitors: &[Rect],
    min_width: u32,
    min_height: u32,
) -> WindowState {
    let screens: Vec<Screen> = monitors.iter().copied().map(Screen::whole).collect();
    clamp_to_screens(state, &screens, (0, 0), min_width, min_height)
}

/// [`clamp_to_monitors`] for a window that has a frame, on monitors that have a taskbar.
///
/// The window is brought inside the work area of the monitor that holds its top-left corner. A
/// corner in the taskbar strip is in no work area but is on its monitor, so the full rectangles
/// are tried next, and a corner on no monitor takes the first. `frame` is the window's outer size
/// minus its inner size (title bar and borders), because the state holds the inner size: the
/// whole window, frame included, ends up in the area. A monitor smaller than the minimum wins
/// over the minimum. The first screen is the one a lost corner takes (the primary one), and every
/// size is in physical pixels, the minimum too.
///
/// Choose the app's minimum so it fits a 1366x768 laptop at 125 % (Xiox measured it): 1093 x 614
/// logical, 574 once the 48 px Windows 11 taskbar is out, and the page plus the title bar and
/// borders (about 31 logical pixels high) must fit in that. Xiox's 960 x 540 does.
pub fn clamp_to_screens(
    state: WindowState,
    screens: &[Screen],
    frame: (u32, u32),
    min_width: u32,
    min_height: u32,
) -> WindowState {
    let state = WindowState {
        width: state.width.max(min_width),
        height: state.height.max(min_height),
        ..state
    };
    let screen = screens
        .iter()
        .find(|screen| screen.work.holds(state.x, state.y))
        .or_else(|| {
            screens
                .iter()
                .find(|screen| screen.full.holds(state.x, state.y))
        })
        .or(screens.first());
    let Some(screen) = screen else {
        return state;
    };
    let area = screen.work;
    let width = state.width.min(area.width.saturating_sub(frame.0));
    let height = state.height.min(area.height.saturating_sub(frame.1));
    let (outer_width, outer_height) = (
        i64::from(width) + i64::from(frame.0),
        i64::from(height) + i64::from(frame.1),
    );
    // The corner as far as it can go and still keep the whole window in the area.
    let place = |at: i32, start: i32, room: u32, outer: i64| {
        let far = i64::from(start) + i64::from(room) - outer;
        i32::try_from(i64::from(at).clamp(i64::from(start), far.max(i64::from(start))))
            .unwrap_or(start)
    };
    WindowState {
        x: place(state.x, area.x, area.width, outer_width),
        y: place(state.y, area.y, area.height, outer_height),
        width,
        height,
        ..state
    }
}

/// What to remember when the window closes. A maximized or minimized window reports the screen (or
/// `(-32000, -32000)` and size 0), so what is saved is the last normal state, which is what
/// restoring brings back, flagged maximized; only a normal window is measured (`live`). With no
/// normal state ever seen nothing is saved, rather than a wrong place.
pub fn state_to_save(
    maximized: bool,
    minimized: bool,
    normal: Option<WindowState>,
    live: impl FnOnce() -> Option<WindowState>,
) -> Option<WindowState> {
    if maximized || minimized {
        return normal.map(|state| WindowState { maximized, ..state });
    }
    live()
}

/// The saved state, or `None` when there is no file or it is not a state. The state is given back
/// as the file holds it, not checked against anything: it may be on a monitor that is gone, below
/// the minimum, or the (-32000, -32000, 0 x 0) of a minimized window, so the caller always passes
/// it through [`clamp_to_monitors`] or [`clamp_to_screens`] before it uses it.
pub fn load_state(data_dir: &Path) -> Option<WindowState> {
    serde_json::from_str(&fs::read_to_string(data_dir.join(STATE_FILE)).ok()?).ok()
}

/// Keeps the state in `<data_dir>/window.json`, whole or not at all, making the folder if needed.
pub fn save_state(data_dir: &Path, state: &WindowState) -> io::Result<()> {
    let text = serde_json::to_string_pretty(state).map_err(io::Error::other)?;
    crate::write_atomically(&data_dir.join(STATE_FILE), text.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SCREEN: Rect = Rect {
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
    };
    const SECOND: Rect = Rect {
        x: 1920,
        y: 0,
        width: 1280,
        height: 1024,
    };
    const BIG: WindowState = WindowState {
        x: 100,
        y: 80,
        width: 1280,
        height: 800,
        maximized: false,
    };

    // ---- clamp_to_monitors ------------------------------------------------------------------

    #[test]
    fn a_window_saved_on_a_monitor_that_is_gone_comes_back_inside_the_first() {
        let saved = WindowState {
            x: 2500,
            y: 100,
            width: 1000,
            height: 600,
            maximized: false,
        };
        let back = clamp_to_monitors(saved, &[SCREEN], 500, 400);
        assert_eq!(
            back,
            WindowState {
                x: 1920 - 1000,
                y: 100,
                width: 1000,
                height: 600,
                maximized: false
            }
        );
        // Two monitors left, the corner is on neither: the first one takes it.
        let lost = WindowState {
            x: 9000,
            y: 9000,
            ..saved
        };
        let back = clamp_to_monitors(lost, &[SCREEN, SECOND], 500, 400);
        assert_eq!((back.x, back.y), (1920 - 1000, 1080 - 600));
    }

    #[test]
    fn a_width_of_300_is_raised_to_the_minimum_of_500() {
        let narrow = WindowState {
            width: 300,
            height: 200,
            ..BIG
        };
        let back = clamp_to_monitors(narrow, &[SCREEN], 500, 400);
        assert_eq!((back.width, back.height), (500, 400));
        assert_eq!((back.x, back.y), (100, 80), "the corner stays where it was");
    }

    #[test]
    fn a_window_that_fits_is_left_alone() {
        let fits = WindowState {
            x: 10,
            y: 10,
            width: 1000,
            height: 600,
            maximized: true,
        };
        assert_eq!(
            clamp_to_monitors(fits, &[SCREEN], 500, 400),
            fits,
            "the maximized flag is not touched"
        );
        assert_eq!(clamp_to_monitors(BIG, &[SCREEN, SECOND], 500, 400), BIG);
    }

    #[test]
    fn a_window_larger_than_its_monitor_is_cut_to_it() {
        let huge = WindowState {
            x: -50,
            y: -50,
            width: 3000,
            height: 2000,
            maximized: false,
        };
        let back = clamp_to_monitors(huge, &[SCREEN], 500, 400);
        assert_eq!(
            back,
            WindowState {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                maximized: false
            }
        );
    }

    #[test]
    fn a_monitor_left_of_the_main_one_keeps_its_window() {
        let left = Rect {
            x: -1920,
            y: 0,
            width: 1920,
            height: 1080,
        };
        let on_left = WindowState {
            x: -1800,
            y: 100,
            width: 1000,
            height: 600,
            maximized: false,
        };
        assert_eq!(
            clamp_to_monitors(on_left, &[SCREEN, left], 500, 400),
            on_left
        );
        // Pushed past the right edge of the left monitor: kept on it, not thrown to the main one.
        let past = WindowState { x: -100, ..on_left };
        assert_eq!(clamp_to_monitors(past, &[SCREEN, left], 500, 400).x, -1000);
    }

    #[test]
    fn without_a_monitor_only_the_minimum_applies() {
        let back = clamp_to_monitors(WindowState { width: 300, ..BIG }, &[], 500, 400);
        assert_eq!(back, WindowState { width: 500, ..BIG });
    }

    // ---- clamp_to_screens: the frame and the taskbar -----------------------------------------

    /// The title bar and borders of a window at 100 %: 16 x 39 physical pixels around the page.
    const FRAME: (u32, u32) = (16, 39);
    /// A 1366x768 laptop at 100 %: the taskbar takes 40 pixels.
    const LAPTOP: Screen = Screen {
        work: Rect {
            x: 0,
            y: 0,
            width: 1366,
            height: 728,
        },
        full: Rect {
            x: 0,
            y: 0,
            width: 1366,
            height: 768,
        },
    };

    #[test]
    fn a_window_taller_than_the_work_area_is_shrunk_to_fit_with_its_frame() {
        let back = clamp_to_screens(BIG, &[LAPTOP], FRAME, 0, 0);
        assert_eq!(
            (back.width, back.height),
            (1280, 728 - 39),
            "the page plus the title bar is the work area"
        );
        assert_eq!(
            (back.x, back.y),
            (70, 0),
            "moved up and left until the whole window is in"
        );
        assert_eq!(back.maximized, BIG.maximized);
    }

    #[test]
    fn a_corner_in_the_taskbar_strip_is_clamped_on_its_own_monitor() {
        // The second monitor (1280x1024 at x = 1920) has a 48 px taskbar at the bottom.
        let second = Screen {
            work: Rect {
                height: 976,
                ..SECOND
            },
            full: SECOND,
        };
        let screens = [Screen::whole(SCREEN), second];
        let strip = WindowState {
            x: 2000,
            y: 1000,
            width: 1000,
            height: 600,
            maximized: false,
        };
        let back = clamp_to_screens(strip, &screens, FRAME, 0, 0);
        assert_eq!(
            back.x, 2000,
            "kept on the second monitor, not thrown to the first"
        );
        assert_eq!(back.y, 976 - 600 - 39, "moved up above its taskbar");
        // (corner, whether the result lands on the second monitor)
        for (x, y, on_second) in [
            (2000, 1000, true),
            (100, 1050, false),
            (2500, 10, true),
            (9000, 9000, false),
        ] {
            let state = WindowState {
                x,
                y,
                width: 800,
                height: 500,
                maximized: false,
            };
            let back = clamp_to_screens(state, &screens, FRAME, 0, 0);
            assert_eq!(back.x >= 1920, on_second, "corner ({x}, {y})");
        }
    }

    #[test]
    fn the_minimum_applies_to_the_page_and_the_area_to_the_whole_window() {
        let small = WindowState {
            x: 0,
            y: 0,
            width: 300,
            height: 200,
            maximized: false,
        };
        let back = clamp_to_screens(small, &[LAPTOP], FRAME, 500, 400);
        assert_eq!((back.width, back.height), (500, 400));
    }

    /// Xiox's own case: a window wider than the second monitor it was saved on.
    #[test]
    fn a_window_wider_than_the_area_is_cut_to_it_and_clamped_on_the_monitor_it_is_on() {
        // On the second monitor (1280x1024 at x = 1920) the 1400-wide window is cut to the area and
        // sits at its left edge.
        let wide = WindowState {
            x: 2000,
            y: 100,
            width: 1400,
            height: 900,
            maximized: false,
        };
        let back = clamp_to_screens(
            wide,
            &[Screen::whole(SCREEN), Screen::whole(SECOND)],
            FRAME,
            0,
            0,
        );
        assert_eq!((back.x, back.width), (1920, 1280 - 16));
        assert_eq!(
            (back.y, back.height),
            (85, 900),
            "the height fits; the window moves up just enough to have its frame in"
        );
        // A corner on no monitor: the first work area decides.
        let lost = WindowState { x: 9000, ..wide };
        assert_eq!(
            clamp_to_screens(lost, &[Screen::whole(SCREEN)], FRAME, 0, 0).x,
            1920 - 1400 - 16
        );
    }

    #[test]
    fn a_monitor_smaller_than_the_minimum_wins_over_the_minimum() {
        let small = Rect {
            x: 0,
            y: 0,
            width: 400,
            height: 300,
        };
        let state = WindowState {
            x: 10,
            y: 10,
            width: 300,
            height: 200,
            maximized: false,
        };
        let back = clamp_to_monitors(state, &[small], 500, 400);
        assert_eq!(
            back,
            WindowState {
                x: 0,
                y: 0,
                width: 400,
                height: 300,
                maximized: false
            },
            "raised to the minimum, then cut to the only monitor there is"
        );
        // With a frame the whole window, frame included, is what has to fit.
        let back = clamp_to_screens(state, &[Screen::whole(small)], FRAME, 500, 400);
        assert_eq!(
            (back.x, back.y, back.width, back.height),
            (0, 0, 400 - 16, 300 - 39)
        );
    }

    #[test]
    fn a_state_saved_while_minimized_is_brought_back_from_nowhere() {
        // What a minimized window reports, if it was ever written to the file as it was measured.
        let dir = tempfile::tempdir().unwrap();
        let gone = WindowState {
            x: -32000,
            y: -32000,
            width: 0,
            height: 0,
            maximized: true,
        };
        save_state(dir.path(), &gone).unwrap();
        // `load_state` gives the file back as it is; the caller clamps.
        let loaded = load_state(dir.path()).unwrap();
        assert_eq!(loaded, gone);
        let back = clamp_to_monitors(loaded, &[SCREEN, SECOND], 500, 400);
        assert_eq!(
            back,
            WindowState {
                x: 0,
                y: 0,
                width: 500,
                height: 400,
                maximized: true
            },
            "on the first monitor, at the minimum, still maximized"
        );
    }

    // ---- what to save ------------------------------------------------------------------------

    #[test]
    fn a_minimized_or_maximized_window_saves_the_last_normal_state() {
        let live = || {
            Some(WindowState {
                x: -32000,
                y: -32000,
                width: 0,
                height: 0,
                maximized: false,
            })
        };
        // Normal: measured now.
        assert_eq!(state_to_save(false, false, Some(BIG), live), live());
        // Minimized: the window reports (-32000, -32000) and size 0; the last normal one is kept.
        assert_eq!(
            state_to_save(false, true, Some(BIG), || panic!(
                "a minimized window is not measured"
            )),
            Some(BIG)
        );
        // Maximized, also when minimized from maximized: the normal state, flagged maximized.
        let maximized = WindowState {
            maximized: true,
            ..BIG
        };
        assert_eq!(
            state_to_save(true, false, Some(BIG), || panic!("not measured")),
            Some(maximized)
        );
        assert_eq!(
            state_to_save(true, true, Some(BIG), || panic!("not measured")),
            Some(maximized)
        );
        // Nothing normal was ever seen: nothing is saved rather than a wrong place.
        assert_eq!(
            state_to_save(false, true, None, || panic!("not measured")),
            None
        );
    }

    // ---- the file ----------------------------------------------------------------------------

    #[test]
    fn the_state_round_trips_through_its_file() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load_state(dir.path()), None, "no file yet");
        let state = WindowState {
            x: -8,
            y: 12,
            width: 1400,
            height: 900,
            maximized: true,
        };
        save_state(dir.path(), &state).unwrap();
        assert_eq!(load_state(dir.path()), Some(state));
        assert_eq!(
            crate::tests::names_in(dir.path()),
            ["window.json"],
            "the temporary file is renamed away"
        );
        // A later save replaces the earlier one.
        save_state(dir.path(), &BIG).unwrap();
        assert_eq!(load_state(dir.path()), Some(BIG));
        // The folder is made when it is not there yet.
        let nested = dir.path().join("a").join("b");
        save_state(&nested, &BIG).unwrap();
        assert_eq!(load_state(&nested), Some(BIG));
    }

    #[test]
    fn a_file_that_is_not_a_state_is_none() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("window.json");
        for content in [
            "{ not json",
            "",
            "[]",
            r#"{"x": 1}"#,
            r#"{"x":"a","y":0,"width":1,"height":1,"maximized":false}"#,
        ] {
            std::fs::write(&file, content).unwrap();
            assert_eq!(load_state(dir.path()), None, "{content:?}");
        }
    }

    #[test]
    fn xioxs_existing_file_is_read_as_it_is() {
        // Written by Xiox 0.2.1 before the shell was shared: the same name and the same fields.
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(
            dir.path().join("window.json"),
            "{\n  \"x\": 100,\n  \"y\": 80,\n  \"width\": 1280,\n  \"height\": 800,\n  \"maximized\": false\n}",
        )
        .unwrap();
        assert_eq!(load_state(dir.path()), Some(BIG));
    }
}
