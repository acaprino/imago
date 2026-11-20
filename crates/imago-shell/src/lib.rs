//! The Rust side of Imago's desktop shell: the window's acrylic and theme, Snap Layouts, the guard
//! and WebView2 recovery.
//!
//! One copy of what Shinatama and Xiox each had, for every app of the suite:
//!
//! - `theme`: the window theme (light, dark or the system's), kept in a file in the data folder so
//!   the next start opens on the right acrylic, and [`glass_window_config`], the main window's
//!   config with the glass material.
//! - `frame`: Snap Layouts on the HTML maximize button, and the "Reload interface" item of the
//!   window menu.
//! - `guard`: a webview shows only the app's own pages, and the browser's own keys are off.
//! - `recovery`: what failed in WebView2 and what to do about it; a page is reloaded at most
//!   three times a minute.
//! - `window_state`: where the window was, brought back inside the monitors there are now.
//!
//! The decisions (parsing, files, limits, geometry) are plain functions that need no window; the Win32
//! and Tauri calls are thin around them. Win32 is behind `cfg(windows)`: other targets compile the
//! same names to no-ops.

mod frame;
mod guard;
mod recovery;
mod theme;
mod window_state;

pub use frame::{install_reload_menu, install_snap_layouts, SnapLayouts};
pub use guard::{disable_browser_accelerators, guard_navigation, guard_navigation_with_scheme};
pub use recovery::{
    recovery_action, watch_process_failures, ProcessFailure, Recovery, RecoveryAction,
};
pub use theme::{
    apply_theme, glass_window_config, parse_theme, save_theme, saved_theme, WindowTheme,
};
pub use window_state::{
    clamp_to_monitors, clamp_to_screens, load_state, save_state, state_to_save, Rect, Screen,
    WindowState,
};

use std::{
    ffi::OsString,
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
    process,
    sync::atomic::{AtomicU64, Ordering},
};

/// The temporary file of one write: `<path>.<process id>-<count>.tmp`, in the folder of `path` so
/// the rename stays on one volume. Each write has a name of its own, so two writes of one file (two
/// threads, or two running copies of the app) never share, truncate or rename each other's file.
fn temporary_path(path: &Path) -> PathBuf {
    static WRITES: AtomicU64 = AtomicU64::new(0);
    let mut name: OsString = path.as_os_str().to_owned();
    name.push(format!(
        ".{}-{}.tmp",
        process::id(),
        WRITES.fetch_add(1, Ordering::Relaxed)
    ));
    PathBuf::from(name)
}

/// Writes `bytes` to a temporary file next to `path` and renames it over `path`, so a crash never
/// leaves half a file. The folder is made when it is not there yet. A write that fails leaves no
/// temporary file behind (one a crash leaves is a stray file, never read as the real one).
pub(crate) fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let temporary = temporary_path(path);
    let written = File::create(&temporary).and_then(|mut file| {
        file.write_all(bytes)?;
        file.sync_all()
    });
    written
        .and_then(|()| fs::rename(&temporary, path))
        .inspect_err(|_| {
            let _ = fs::remove_file(&temporary);
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The names in a folder, sorted.
    pub(crate) fn names_in(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn every_write_has_a_temporary_name_of_its_own() {
        let path = Path::new("data").join("window.json");
        let (first, second) = (temporary_path(&path), temporary_path(&path));
        assert_ne!(
            first, second,
            "two writes of one file must not share a file"
        );
        for temporary in [&first, &second] {
            assert_eq!(
                temporary.parent(),
                path.parent(),
                "renamed in place, on one volume"
            );
            let name = temporary.file_name().unwrap().to_string_lossy();
            assert!(
                name.starts_with("window.json.") && name.ends_with(".tmp"),
                "{name}"
            );
            assert!(
                name.contains(&std::process::id().to_string()),
                "another process writing the same file has another name: {name}"
            );
        }
    }

    #[test]
    fn a_write_replaces_the_file_and_leaves_nothing_else() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a").join("state");
        write_atomically(&file, b"one").unwrap();
        write_atomically(&file, b"two").unwrap();
        assert_eq!(fs::read(&file).unwrap(), b"two");
        assert_eq!(names_in(file.parent().unwrap()), ["state"]);
    }

    #[test]
    fn a_write_that_cannot_replace_the_file_removes_its_temporary_one() {
        let dir = tempfile::tempdir().unwrap();
        // A folder where the file should go: the rename fails after the temporary file is written.
        let blocked = dir.path().join("state");
        fs::create_dir(&blocked).unwrap();
        assert!(write_atomically(&blocked, b"one").is_err());
        assert_eq!(names_in(dir.path()), ["state"]);
    }
}
