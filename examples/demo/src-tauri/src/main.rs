//! The demo: the gallery of Imago in a real glass window. It is the first place where the page side of the shell
//! (`ts/shell`, wired by `gallery/mount/desktop.ts`) and the native side (the `imago-shell` crate) run together, and
//! what the screen capture (`npm run capture`) photographs.
//!
//! The wiring is the one the crate documents, window by window:
//!
//! 1. before the window exists: its config with the glass material and the saved window theme, and the navigation
//!    guard on the builder;
//! 2. right after it is built: the browser accelerators off (a release build only), the WebView2 failure watcher, the
//!    Snap Layouts overlay, kept by window label, and the "Reload interface" item of the window menu;
//! 3. two commands the page calls: `set_window_theme` and `window_caption_maximize`.
#![cfg_attr(windows, windows_subsystem = "windows")]

use imago_shell::{
    apply_theme, disable_browser_accelerators, glass_window_config, guard_navigation,
    install_reload_menu, install_snap_layouts, parse_theme, recovery_action, save_theme,
    saved_theme, watch_process_failures, ProcessFailure, Recovery, RecoveryAction, SnapLayouts,
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
use tauri::{AppHandle, Manager, State, WebviewWindow, WebviewWindowBuilder};

/// The one window of the demo. Its config is in `tauri.conf.json`, with `"create": false`: it is built in `setup`.
const MAIN: &str = "main";

/// The dev server of the gallery (`beforeDevCommand`); the only page, besides the app's own, a window may show.
const DEV_ORIGIN: &str = "http://127.0.0.1:1420";

/// The Snap Layouts overlay of each window, by label. A window built again gets its entry replaced.
#[derive(Default)]
struct Overlays(Mutex<HashMap<String, SnapLayouts>>);

/// What the failure watcher needs to decide: the reloads of each window in the last minute, kept across rebuilds,
/// and whether the windows are being rebuilt. The demo does not rebuild (it logs what a real app would do), so the
/// flag stays false; an app that does sets it for the time it takes.
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
/// first frame of the next start.
#[tauri::command]
fn set_window_theme(window: WebviewWindow, theme: String) -> Result<(), String> {
    let theme = parse_theme(&theme).ok_or_else(|| format!("unknown window theme \"{theme}\""))?;
    apply_theme(&window, theme).map_err(|error| error.to_string())?;
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
    // A development build keeps reload and DevTools.
    if !tauri::is_dev() {
        disable_browser_accelerators(window)?;
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
    let window =
        guard_navigation(WebviewWindowBuilder::from_config(app, &config)?, origins).build()?;
    wire(app, &window)
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
        .run(tauri::generate_context!())
        .expect("the Imago demo failed to start");
}
