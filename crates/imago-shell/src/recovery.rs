//! A window never stays an empty shell. When WebView2 loses the process that draws a window, the
//! window is transparent glass with nothing in it and takes no input. A page that fails is
//! reloaded, at most three times a minute; past that the main window asks the person, so a page
//! that fails at once cannot reload forever.
//!
//! Three parts, the first two needing no window:
//!
//! - [`Recovery`], the counting: three reloads a minute for one window.
//! - [`recovery_action`], the decision: what to do about a [`ProcessFailure`].
//! - [`watch_process_failures`], the WebView2 events that say what failed, and nothing more.
//!
//! What is done about it is in `main_window`. The rules, Shinatama's:
//!
//! - The browser process exits: every webview of the application is dead. The window is destroyed
//!   and built again where it was ([`RecoveryAction::Rebuild`]).
//! - A render process exits: only that page is dead. It is reloaded ([`RecoveryAction::Reload`]).
//! - The page fails to load: it is loaded again after a second (`Reload`, after
//!   [`ProcessFailure::reload_delay`]).
//! - A render process stops responding: the main window asks whether to reload it
//!   ([`RecoveryAction::GiveUp`]: it may be busy, not dead, so no automatic reload).
//!
//! Other WebView2 processes (GPU, utility) are restarted by WebView2 itself
//! ([`RecoveryAction::Ignore`]). WebView2's own error page ("can't reach this page") is turned off
//! by the watcher: it has no way back into the app.
//!
//! And Xiox's rule: while the application closes, WebView2 reports the processes that end with it
//! as failed, which is not a failure to recover from. Once the app has called [`Recovery::close`],
//! every failure of that window is `Ignore`.
use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
use tauri::{Runtime, WebviewWindow};

/// Reloads allowed in one [`PERIOD`].
const LIMIT: usize = 3;
const PERIOD: Duration = Duration::from_secs(60);
/// A page that failed to load waits a moment before it tries again.
const LOAD_RETRY_DELAY: Duration = Duration::from_secs(1);

/// The reloads of the window in the last minute, and whether it is closing. It is kept across a
/// rebuild (a window that failed three times a minute ago has still failed three times); a window
/// opened anew gets a new one.
#[derive(Debug, Default)]
pub(crate) struct Recovery {
    reloads: VecDeque<Instant>,
    /// The application or this window is closing: no failure is acted on any more.
    closing: bool,
}

impl Recovery {
    pub(crate) const fn new() -> Self {
        Self {
            reloads: VecDeque::new(),
            closing: false,
        }
    }

    /// Whether the window may be reloaded at `now`. If it may, the reload is counted; a refusal is
    /// not, so it does not extend the wait.
    fn allow_reload(&mut self, now: Instant) -> bool {
        self.reloads.retain(|at| now.duration_since(*at) < PERIOD);
        if self.reloads.len() >= LIMIT {
            return false;
        }
        self.reloads.push_back(now);
        true
    }

    /// Starts the count again: the person answered the question and chose to reload, so the page
    /// has a fresh minute.
    pub(crate) fn reset(&mut self) {
        self.reloads.clear();
    }

    /// The application is closing, or this window is. WebView2 reports the processes that end with
    /// them as failed, and that is not a failure to recover from: from now on [`recovery_action`]
    /// answers every failure of this window with [`RecoveryAction::Ignore`] (no reload, no rebuild,
    /// no question). There is no way back, and [`reset`](Recovery::reset) does not undo it.
    ///
    /// It is for a window that will not come back: a window destroyed to be built again is not
    /// closing, and neither is the application when an exit is prevented.
    pub(crate) fn close(&mut self) {
        self.closing = true;
    }
}

/// What WebView2 reported lost in the window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProcessFailure {
    /// The browser process exited: every webview of the application is dead, and each one reports
    /// it.
    Browser,
    /// The render process of this window exited: only this page is dead.
    Renderer,
    /// The render process of this window stopped responding.
    Unresponsive,
    /// The page did not load; WebView2's error status is kept for the message. A navigation that
    /// was cancelled (one the navigation guard refused, or one a newer replaced) is not this.
    NotLoaded(i32),
    /// Any other WebView2 process (GPU, utility, sandbox helper, a frame of the page): WebView2
    /// restarts those itself.
    Other,
}

impl ProcessFailure {
    /// How long to wait before the reload [`recovery_action`] allows: a failed load waits a moment
    /// before it tries again, the others reload at once.
    pub(crate) fn reload_delay(self) -> Duration {
        match self {
            ProcessFailure::NotLoaded(_) => LOAD_RETRY_DELAY,
            _ => Duration::ZERO,
        }
    }
}

/// What is done about a [`ProcessFailure`].
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RecoveryAction {
    /// Reload the page, after [`ProcessFailure::reload_delay`].
    Reload,
    /// Destroy the window and build it again where it was, once for each loss. Meanwhile its end is
    /// not the end of the application and not the person closing it: an exit with no code is
    /// prevented, and nothing of its place is saved. The place is read before it is destroyed, and a
    /// label is free again only once its window is gone.
    Rebuild,
    /// No automatic reload: the person is asked. Either the page failed more than three times in a
    /// minute, or the render process is unresponsive.
    GiveUp,
    /// Nothing to do: WebView2 restarts the process itself, the window is being rebuilt, or the
    /// application or the window is closing ([`Recovery::close`]).
    Ignore,
}

/// The decision for `failure` in the window whose reloads `recovery` counts. A reload that is
/// allowed is counted, so ask once for each failure. A rebuild is not a reload and is not counted:
/// the browser process only dies for the whole application.
///
/// `rebuilding`: the window is being destroyed and built again (see [`RecoveryAction::Rebuild`]). A
/// page that fails to load in a window that is going away is `Ignore`, and spends no reload. Every
/// other failure is the same either way: a second `Browser` report is `Rebuild` again.
///
/// Once [`Recovery::close`] was called, every failure is `Ignore` and nothing is counted.
pub(crate) fn recovery_action(
    failure: ProcessFailure,
    recovery: &mut Recovery,
    now: Instant,
    rebuilding: bool,
) -> RecoveryAction {
    if recovery.closing {
        return RecoveryAction::Ignore;
    }
    match failure {
        ProcessFailure::Browser => RecoveryAction::Rebuild,
        ProcessFailure::NotLoaded(_) if rebuilding => RecoveryAction::Ignore,
        ProcessFailure::Renderer | ProcessFailure::NotLoaded(_) => {
            if recovery.allow_reload(now) {
                RecoveryAction::Reload
            } else {
                RecoveryAction::GiveUp
            }
        }
        ProcessFailure::Unresponsive => RecoveryAction::GiveUp,
        ProcessFailure::Other => RecoveryAction::Ignore,
    }
}

/// Watches the window's WebView2 and calls `on_failure` with what failed, for the answer to be decided
/// with [`recovery_action`]. It also turns WebView2's built-in error page off: it has no way back
/// into the app, so a page that failed to load is blank until the answer (a reload) comes.
///
/// `on_failure` runs on a thread of its own for every report, never inside WebView2's callback, so
/// it may destroy the window, build it, ask the person and sleep.
///
/// The `Ok` of a window that exists means the watcher was handed to the thread that owns the
/// webview, where COM can still fail; nothing reports that. On other targets this does nothing.
pub(crate) fn watch_process_failures<R: Runtime>(
    window: &WebviewWindow<R>,
    on_failure: impl Fn(ProcessFailure) + Send + Sync + 'static,
) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        win::watch(window, std::sync::Arc::new(on_failure))
    }
    #[cfg(not(windows))]
    {
        let _ = (window, on_failure);
        Ok(())
    }
}

#[cfg(windows)]
mod win {
    use super::ProcessFailure;
    use std::sync::Arc;
    use tauri::{Runtime, WebviewWindow};
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_PROCESS_FAILED_KIND,
            COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
            COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
            COREWEBVIEW2_WEB_ERROR_STATUS, COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
        },
        NavigationCompletedEventHandler, ProcessFailedEventHandler,
    };

    /// What the app is told: called on a thread of its own.
    pub type Report = Arc<dyn Fn(ProcessFailure) + Send + Sync>;

    pub fn failure_of_kind(kind: COREWEBVIEW2_PROCESS_FAILED_KIND) -> ProcessFailure {
        if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED {
            ProcessFailure::Browser
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED {
            ProcessFailure::Renderer
        } else if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE {
            ProcessFailure::Unresponsive
        } else {
            ProcessFailure::Other
        }
    }

    /// A finished navigation as a failure, or `None` when the page loaded. Cancelled is not
    /// failed: a navigation the policy refused, or one a newer replaced.
    pub fn load_failure(success: bool, status: i32) -> Option<ProcessFailure> {
        (!success && status != COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED.0)
            .then_some(ProcessFailure::NotLoaded(status))
    }

    /// Off WebView2's thread: the callback of a failure must return before windows are destroyed.
    /// A thread the system refuses is a failure not reported, never a panic inside a COM callback.
    fn deliver(report: &Report, failure: ProcessFailure) {
        let report = report.clone();
        let _ = std::thread::Builder::new()
            .name("imago-webview-failure".into())
            .spawn(move || report(failure));
    }

    pub fn watch<R: Runtime>(window: &WebviewWindow<R>, report: Report) -> tauri::Result<()> {
        window.with_webview(move |webview| {
            // SAFETY: called on the thread that owns the webview, on live COM objects.
            unsafe {
                let Ok(core) = webview.controller().CoreWebView2() else {
                    return;
                };
                // WebView2's default is TRUE. From the next navigation a failed load shows a blank
                // page, and NavigationCompleted below takes over.
                if let Ok(settings) = core.Settings() {
                    let _ = settings.SetIsBuiltInErrorPageEnabled(false);
                }
                let failed = report.clone();
                let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                    args.ProcessFailedKind(&mut kind)?;
                    deliver(&failed, failure_of_kind(kind));
                    Ok(())
                }));
                let mut token = 0i64;
                let _ = core.add_ProcessFailed(&handler, &mut token);
                let loaded = report;
                let handler = NavigationCompletedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    let mut success = windows_core::BOOL(1);
                    args.IsSuccess(&mut success)?;
                    let mut status = COREWEBVIEW2_WEB_ERROR_STATUS::default();
                    args.WebErrorStatus(&mut status)?;
                    if let Some(failure) = load_failure(success.as_bool(), status.0) {
                        deliver(&loaded, failure);
                    }
                    Ok(())
                }));
                let _ = core.add_NavigationCompleted(&handler, &mut token);
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    const SECOND: Duration = Duration::from_secs(1);

    /// The decision while the windows are not being rebuilt, which is nearly always.
    fn decide(failure: ProcessFailure, recovery: &mut Recovery, now: Instant) -> RecoveryAction {
        recovery_action(failure, recovery, now, false)
    }

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

    // ---- what to do about a failure ----------------------------------------------------------

    #[test]
    fn a_lost_browser_process_rebuilds_every_window_whatever_the_count() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        // Every webview of the application reports the same loss, and a rebuild is not a reload.
        for second in 0..10 {
            assert_eq!(
                decide(
                    ProcessFailure::Browser,
                    &mut recovery,
                    start + second * SECOND
                ),
                RecoveryAction::Rebuild
            );
        }
        assert!(
            recovery.allow_reload(start + 10 * SECOND),
            "a rebuild does not use up a reload"
        );
    }

    #[test]
    fn a_stopped_renderer_or_a_page_that_did_not_load_is_reloaded_three_times_a_minute() {
        for failure in [
            ProcessFailure::Renderer,
            ProcessFailure::NotLoaded(-2_147_012_889),
        ] {
            let mut recovery = Recovery::default();
            let start = Instant::now();
            for second in 0..3 {
                assert_eq!(
                    decide(failure, &mut recovery, start + second * SECOND),
                    RecoveryAction::Reload,
                    "{failure:?} at {second} s"
                );
            }
            assert_eq!(
                decide(failure, &mut recovery, start + 3 * SECOND),
                RecoveryAction::GiveUp,
                "{failure:?}: a page that fails at once cannot reload forever"
            );
            assert_eq!(
                decide(failure, &mut recovery, start + 60 * SECOND),
                RecoveryAction::Reload,
                "{failure:?}: a place is free once the minute has passed"
            );
        }
    }

    #[test]
    fn the_two_kinds_of_failure_share_one_budget_of_reloads() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        let mut act =
            |failure, seconds: u32| decide(failure, &mut recovery, start + seconds * SECOND);
        assert_eq!(act(ProcessFailure::Renderer, 0), RecoveryAction::Reload);
        assert_eq!(act(ProcessFailure::NotLoaded(1), 1), RecoveryAction::Reload);
        assert_eq!(act(ProcessFailure::Renderer, 2), RecoveryAction::Reload);
        assert_eq!(act(ProcessFailure::NotLoaded(1), 3), RecoveryAction::GiveUp);
    }

    #[test]
    fn a_renderer_that_stops_responding_is_asked_about_never_reloaded_at_once() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        assert_eq!(
            decide(ProcessFailure::Unresponsive, &mut recovery, start),
            RecoveryAction::GiveUp,
            "the person is asked: it may be busy, not dead"
        );
        for second in 0..3 {
            assert!(
                recovery.allow_reload(start + second * SECOND),
                "being asked does not use up a reload"
            );
        }
    }

    #[test]
    fn processes_that_webview2_restarts_itself_are_left_alone() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        for second in 0..5 {
            assert_eq!(
                decide(
                    ProcessFailure::Other,
                    &mut recovery,
                    start + second * SECOND
                ),
                RecoveryAction::Ignore
            );
        }
        for second in 0..3 {
            assert!(
                recovery.allow_reload(start + second * SECOND),
                "and nothing was counted"
            );
        }
    }

    #[test]
    fn a_page_that_did_not_load_waits_a_second_before_it_is_tried_again() {
        assert_eq!(ProcessFailure::NotLoaded(1).reload_delay(), SECOND);
        for failure in [
            ProcessFailure::Renderer,
            ProcessFailure::Browser,
            ProcessFailure::Unresponsive,
            ProcessFailure::Other,
        ] {
            assert_eq!(failure.reload_delay(), Duration::ZERO, "{failure:?}");
        }
    }

    #[test]
    fn a_page_that_fails_to_load_while_the_windows_are_rebuilt_is_ignored_and_not_counted() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        // The window is being destroyed: reloading it would spend a reload on a page that is
        // going away, and ask a question about a window the person never saw fail.
        for second in 0..5 {
            assert_eq!(
                recovery_action(
                    ProcessFailure::NotLoaded(1),
                    &mut recovery,
                    start + second * SECOND,
                    true
                ),
                RecoveryAction::Ignore
            );
        }
        for second in 0..3 {
            assert!(
                recovery.allow_reload(start + second * SECOND),
                "and nothing was counted"
            );
        }
        // The same failure once the windows are built is a failure again.
        let mut fresh = Recovery::default();
        assert_eq!(
            recovery_action(ProcessFailure::NotLoaded(1), &mut fresh, start, false),
            RecoveryAction::Reload
        );
    }

    #[test]
    fn rebuilding_changes_only_what_a_failed_load_does() {
        let start = Instant::now();
        for failure in [
            ProcessFailure::Browser,
            ProcessFailure::Renderer,
            ProcessFailure::Unresponsive,
            ProcessFailure::Other,
        ] {
            let (mut resting, mut rebuilding) = (Recovery::default(), Recovery::default());
            for second in 0..5 {
                let now = start + second * SECOND;
                assert_eq!(
                    recovery_action(failure, &mut rebuilding, now, true),
                    recovery_action(failure, &mut resting, now, false),
                    "{failure:?} at {second} s"
                );
            }
        }
    }

    /// WebView2's own numbers, turned into the app's words.
    #[cfg(windows)]
    mod webview2 {
        use super::super::win::{failure_of_kind, load_failure};
        use super::super::ProcessFailure;
        use webview2_com::Microsoft::Web::WebView2::Win32::*;

        #[test]
        fn the_kinds_of_failed_process_are_four_words() {
            for (kind, failure) in [
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
                    ProcessFailure::Browser,
                ),
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
                    ProcessFailure::Renderer,
                ),
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
                    ProcessFailure::Unresponsive,
                ),
                // Restarted by WebView2 itself, or a frame of the page, which has none (`frame-src 'none'`).
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_GPU_PROCESS_EXITED,
                    ProcessFailure::Other,
                ),
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_UTILITY_PROCESS_EXITED,
                    ProcessFailure::Other,
                ),
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_SANDBOX_HELPER_PROCESS_EXITED,
                    ProcessFailure::Other,
                ),
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_FRAME_RENDER_PROCESS_EXITED,
                    ProcessFailure::Other,
                ),
                (
                    COREWEBVIEW2_PROCESS_FAILED_KIND_UNKNOWN_PROCESS_EXITED,
                    ProcessFailure::Other,
                ),
            ] {
                assert_eq!(failure_of_kind(kind), failure, "{kind:?}");
            }
        }

        #[test]
        fn a_page_that_loaded_or_was_cancelled_did_not_fail() {
            assert_eq!(load_failure(true, 0), None);
            // A navigation the policy refused, or one a newer one replaced.
            assert_eq!(
                load_failure(false, COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED.0),
                None
            );
            let aborted = COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED.0;
            assert_eq!(
                load_failure(false, aborted),
                Some(ProcessFailure::NotLoaded(aborted))
            );
        }
    }

    #[test]
    fn once_the_application_is_closing_no_failure_is_acted_on() {
        let mut recovery = Recovery::default();
        let start = Instant::now();
        assert_eq!(
            decide(ProcessFailure::Browser, &mut recovery, start),
            RecoveryAction::Rebuild,
            "before closing, a lost browser process rebuilds the windows"
        );
        // The application exits: WebView2 reports the processes that end with it as failed.
        recovery.close();
        for failure in [
            ProcessFailure::Browser,
            ProcessFailure::Renderer,
            ProcessFailure::Unresponsive,
            ProcessFailure::NotLoaded(1),
            ProcessFailure::Other,
        ] {
            for rebuilding in [false, true] {
                assert_eq!(
                    recovery_action(failure, &mut recovery, start + SECOND, rebuilding),
                    RecoveryAction::Ignore,
                    "{failure:?}: no reload, no rebuild, no question"
                );
            }
        }
        recovery.reset();
        assert_eq!(
            decide(ProcessFailure::Browser, &mut recovery, start + 2 * SECOND),
            RecoveryAction::Ignore,
            "answering a question does not undo the closing"
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
