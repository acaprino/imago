//! The demo: the gallery of Imago in a real glass window. It is the first place where the page side of the shell
//! (`ts/shell`, wired by `gallery/mount/desktop.ts`) and the native side (the `imago-shell` crate) run together, and
//! what the screen capture (`npm run capture`) photographs.
//!
//! The wiring is the one the crate documents, window by window:
//!
//! 1. before the window exists: its config with the glass material and the saved window theme, and the navigation
//!    guard on the builder;
//! 2. right after it is built: the browser accelerators off and the context menu trimmed to editing (a release build
//!    only), the WebView2 failure watcher, the Snap Layouts overlay, kept by window label, and the "Reload interface"
//!    item of the window menu;
//! 3. two commands the page calls: `set_window_theme` and `window_caption_maximize`;
//! 4. while the application or a window closes, the failures WebView2 reports are not acted on.
#![cfg_attr(windows, windows_subsystem = "windows")]

use imago_shell::{
    apply_theme, disable_browser_accelerators, drawn_by_page, glass_window_config,
    guard_navigation_with_scheme, install_reload_menu, install_snap_layouts, parse_theme,
    recovery_action, save_theme, saved_theme, trim_context_menu, watch_process_failures,
    ProcessFailure, Recovery, RecoveryAction, SnapLayouts,
};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Instant,
};
use tauri::{AppHandle, Manager, RunEvent, State, WebviewWindow, WebviewWindowBuilder};

/// The one window of the demo. Its config is in `tauri.conf.json`, with `"create": false`: it is built in `setup`.
const MAIN: &str = "main";

/// The dev server of the gallery (`beforeDevCommand`); the only page, besides the app's own, a window may show.
const DEV_ORIGIN: &str = "http://127.0.0.1:1420";

/// The Snap Layouts overlay of each window, by label. A window built again gets its entry replaced.
#[derive(Default)]
struct Overlays(Mutex<HashMap<String, SnapLayouts>>);

/// What the failure watcher needs to decide: the reloads of each window in the last minute (and whether it is
/// closing), kept across rebuilds, and whether the windows are being rebuilt. The demo does not rebuild (it logs what
/// a real app would do), so the flag stays false; an app that does sets it for the time it takes.
#[derive(Default)]
struct Failures {
    recoveries: Mutex<HashMap<String, Recovery>>,
    rebuilding: AtomicBool,
}

/// The folder for what the shell keeps (the window theme). `IMAGO_DEMO_HOME` moves it, which the capture uses to run
/// on a clean folder.
fn data_dir(app: &AppHandle) -> tauri::Result<PathBuf> {
    match std::env::var_os("IMAGO_DEMO_HOME") {
        Some(home) => Ok(PathBuf::from(home)),
        None => app.path().app_data_dir(),
    }
}

/// The page tells the window the theme of its look (`light`, `dark` or `system`), and the window keeps it for the
/// first frame of the next start. With it come the look (`smooth` or `oni`) and the theme the page draws (`light` or
/// `dark`), from which the window tints the acrylic on Windows 10; what an older page leaves out, `drawn_by_page`
/// fills in.
#[tauri::command]
fn set_window_theme(
    window: WebviewWindow,
    theme: String,
    look: Option<String>,
    resolved: Option<String>,
) -> Result<(), String> {
    let theme = parse_theme(&theme).ok_or_else(|| format!("unknown window theme \"{theme}\""))?;
    let (look, resolved) = drawn_by_page(theme, look.as_deref(), resolved.as_deref());
    apply_theme(&window, theme, look, resolved).map_err(|error| error.to_string())?;
    let dir = data_dir(window.app_handle()).map_err(|error| error.to_string())?;
    save_theme(&dir, theme).map_err(|error| error.to_string())
}

/// The page reports where its maximize button is, in physical pixels of the client area: the numbers go to the
/// Snap Layouts overlay as they come. An error is sent back so the page sends the rectangle again at its next change
/// (the overlay does not exist yet while the window is still being built).
#[tauri::command]
fn window_caption_maximize(
    window: WebviewWindow,
    overlays: State<'_, Overlays>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    let overlays = overlays
        .0
        .lock()
        .map_err(|_| "overlays are unavailable".to_string())?;
    let overlay = overlays.get(window.label()).ok_or_else(|| {
        format!(
            "window \"{}\" has no Snap Layouts overlay yet",
            window.label()
        )
    })?;
    overlay.set_rect(x, y, width, height);
    Ok(())
}

/// What the demo does about a WebView2 failure: reload a page whose renderer stopped, and say what a real app would
/// do otherwise (rebuild its windows after the browser process died, ask the person after three reloads in a minute).
fn on_failure(app: &AppHandle, window: &WebviewWindow, failure: ProcessFailure) {
    let failures = app.state::<Failures>();
    let action = {
        let Ok(mut recoveries) = failures.recoveries.lock() else {
            return;
        };
        let recovery = recoveries.entry(window.label().to_owned()).or_default();
        recovery_action(
            failure,
            recovery,
            Instant::now(),
            failures.rebuilding.load(Ordering::SeqCst),
        )
    };
    match action {
        RecoveryAction::Reload => {
            thread::sleep(failure.reload_delay());
            let _ = window.reload();
        }
        RecoveryAction::Rebuild | RecoveryAction::GiveUp => eprintln!(
            "imago-demo: window \"{}\": {failure:?} is {action:?}; a real app rebuilds its windows or asks the person here",
            window.label()
        ),
        RecoveryAction::Ignore => {}
    }
}

/// Everything a window gets right after it is built, a rebuilt one included.
fn wire(app: &AppHandle, window: &WebviewWindow) -> tauri::Result<()> {
    // A development build keeps reload, DevTools and the engine's whole context menu (Inspect).
    if !tauri::is_dev() {
        disable_browser_accelerators(window)?;
        trim_context_menu(window)?;
    }
    let (handle, watched) = (app.clone(), window.clone());
    watch_process_failures(window, move |failure| {
        on_failure(&handle, &watched, failure)
    })?;
    let overlay = install_snap_layouts(window)?;
    if let Ok(mut overlays) = app.state::<Overlays>().0.lock() {
        overlays.insert(window.label().to_owned(), overlay);
    }
    let reloaded = window.clone();
    install_reload_menu(window, "Reload interface", move || {
        let _ = reloaded.reload();
    })
}

/// Builds the main window: the glass config with the theme the window had last time (so the first frame has the
/// right acrylic), the navigation guard, then the native wiring.
fn build_main(app: &AppHandle) -> tauri::Result<()> {
    let base = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN)
        .cloned()
        .ok_or(tauri::Error::WindowNotFound)?;
    let config = glass_window_config(base, saved_theme(&data_dir(app)?));
    let origins: &[&str] = if tauri::is_dev() { &[DEV_ORIGIN] } else { &[] };
    let window = guard_navigation_with_scheme(
        WebviewWindowBuilder::from_config(app, &config)?,
        origins,
        config.use_https_scheme,
    )
    .build()?;
    // A window opened anew counts from nothing, also under a label used before (a count closed with its last window
    // would never let it reload again); a window rebuilt after `RecoveryAction::Rebuild` (`rebuilding` is set) keeps
    // its count, so three reloads a minute hold across a rebuild.
    let failures = app.state::<Failures>();
    if !failures.rebuilding.load(Ordering::SeqCst) {
        if let Ok(mut recoveries) = failures.recoveries.lock() {
            recoveries.insert(window.label().to_owned(), Recovery::new());
        }
    }
    wire(app, &window)
}

/// WebView2 reports the processes that end with the application, or with a window, as failed: that is not a failure
/// to recover from. An exit the demo does not prevent (it prevents none: it never rebuilds and has no tray) closes
/// every window's count, and a window that closes closes its own (the demo prevents no close, so a close asked for is
/// the end of that window; an app that may prevent one waits for `Destroyed`). From then on their failures are ignored.
fn on_run_event(app: &AppHandle, event: RunEvent) {
    match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => close_recoveries(app, None),
        RunEvent::WindowEvent {
            label,
            event: tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed,
            ..
        } => close_recoveries(app, Some(label)),
        _ => {}
    }
}

/// Closes the count of the window `label`, or with `None` every count: of each window there is, also one that has not
/// failed yet and has no count, and of the windows already gone. A window destroyed to be built again is not closing,
/// so nothing is closed while the windows are rebuilt (never, in the demo; a real app also prevents the exit then).
fn close_recoveries(app: &AppHandle, label: Option<String>) {
    let failures = app.state::<Failures>();
    if failures.rebuilding.load(Ordering::SeqCst) {
        return;
    }
    let Ok(mut recoveries) = failures.recoveries.lock() else {
        return;
    };
    match label {
        Some(label) => recoveries.entry(label).or_default().close(),
        None => {
            for label in app.webview_windows().into_keys() {
                recoveries.entry(label).or_default();
            }
            for recovery in recoveries.values_mut() {
                recovery.close();
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(Overlays::default())
        .manage(Failures::default())
        .invoke_handler(tauri::generate_handler![
            set_window_theme,
            window_caption_maximize
        ])
        .setup(|app| {
            build_main(app.handle())?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("the Imago demo failed to start")
        .run(on_run_event);
}
