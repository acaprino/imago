//! A window never stays an empty shell. When WebView2 loses the process that draws a window, the
//! window is transparent glass with nothing in it and takes no input. A page that fails is
//! reloaded, at most three times a minute; past that the main window asks the person, so a page
//! that fails at once cannot reload forever.
//!
//! This is the counting, which needs no window. What to do on each WebView2 failure stays with the
//! app, whose terminals, sessions and dialogs differ:
//!
//! - The browser process exits: every webview of the application is dead. All configured windows
//!   are destroyed and built again, the main one where it was.
//! - A render process exits: only that page is dead. It is reloaded.
//! - The page fails to load: it is loaded again after a second.
//! - A render process stops responding: the main window asks whether to reload it.
//!
//! Other WebView2 processes (GPU, utility) are restarted by WebView2 itself. WebView2's own error
//! page ("can't reach this page") is turned off in the app: it has no way back into the app.
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};

/// Reloads allowed in one [`PERIOD`].
const LIMIT: usize = 3;
const PERIOD: Duration = Duration::from_secs(60);

/// The reloads of one window in the last minute. Keep one for each window: a window that fails
/// does not use up the reloads of another.
#[derive(Debug, Default)]
pub struct Recovery {
    reloads: VecDeque<Instant>,
}

impl Recovery {
    pub const fn new() -> Self {
        Self {
            reloads: VecDeque::new(),
        }
    }

    /// Whether the window may be reloaded at `now`. If it may, the reload is counted; a refusal is
    /// not, so it does not extend the wait.
    pub fn allow_reload(&mut self, now: Instant) -> bool {
        self.reloads.retain(|at| now.duration_since(*at) < PERIOD);
        if self.reloads.len() >= LIMIT {
            return false;
        }
        self.reloads.push_back(now);
        true
    }

    /// Starts the count again: the person answered the question and chose to reload, so the page
    /// has a fresh minute.
    pub fn reset(&mut self) {
        self.reloads.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    const SECOND: Duration = Duration::from_secs(1);

    #[test]
    fn three_reloads_a_minute_and_no_fourth() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        assert!(recovery.allow_reload(start));
        assert!(recovery.allow_reload(start + SECOND));
        assert!(recovery.allow_reload(start + 2 * SECOND));
        assert!(
            !recovery.allow_reload(start + 3 * SECOND),
            "a page that fails at once cannot reload forever"
        );
        assert!(!recovery.allow_reload(start + 59 * SECOND));
    }

    #[test]
    fn a_reload_is_allowed_again_once_the_minute_has_passed() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        for second in 0..3 {
            assert!(recovery.allow_reload(start + second * SECOND));
        }
        // The first of the three is a minute old: one place is free; the next two are still counted.
        assert!(recovery.allow_reload(start + 60 * SECOND));
        assert!(!recovery.allow_reload(start + 60 * SECOND));
        assert!(recovery.allow_reload(start + 61 * SECOND));
        assert!(recovery.allow_reload(start + 62 * SECOND));
        assert!(!recovery.allow_reload(start + 63 * SECOND));
    }

    #[test]
    fn a_refused_reload_does_not_extend_the_wait() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        for second in 0..3 {
            assert!(recovery.allow_reload(start + second * SECOND));
        }
        for second in 3..60 {
            assert!(!recovery.allow_reload(start + second * SECOND));
        }
        assert!(
            recovery.allow_reload(start + 60 * SECOND),
            "the refusals were not counted"
        );
    }

    #[test]
    fn answering_the_question_starts_the_count_again() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        for _ in 0..3 {
            assert!(recovery.allow_reload(start));
        }
        assert!(!recovery.allow_reload(start));
        // The person chose to reload: the page has a fresh minute.
        recovery.reset();
        assert!(recovery.allow_reload(start));
    }
}
