//! The Rust side of Imago's desktop shell, as a Tauri plugin that opens and watches the main window:
//! its material and theme, Snap Layouts, the guard, WebView2 recovery and its place.
//!
//! What an app calls is here: [`plugin`], [`open_main`] with its [`Options`], [`show_main`],
//! [`on_run_event`] and [`single_instance`]. The rest is inside:
//!
//! - `main_window`: the plugin and the one window of an app, which put the other modules together.
//! - `theme`: [`Material`], glass or opaque, and the window theme (light, dark or the system's), kept
//!   in a file in the data folder so the next start opens in it.
//! - `frame`: Snap Layouts on the HTML maximize button, and the "Reload interface" item of the
//!   window menu.
//! - `guard`: a webview shows only the app's own pages, the browser's own keys are off, and the
//!   context menu holds the editing commands only.
//! - `recovery`: what failed in WebView2 and what to do about it; a page is reloaded at most
//!   three times a minute, and nothing is done once the application is closing.
//! - `window_state`: where the window was, brought back inside the monitors there are now.
//! - `message`: a native message, for when the page cannot be asked.
//!
//! The decisions (parsing, files, limits, geometry) are plain functions that need no window; the Win32
//! and Tauri calls are thin around them. Win32 is behind `cfg(windows)`: other targets compile the
//! same names to no-ops.

mod frame;
mod guard;
mod main_window;
mod message;
mod recovery;
pub mod single_instance;
mod theme;
mod window_state;

pub use guard::Origins;
pub use main_window::{on_run_event, open_main, plugin, show_main, Options};
pub use recovery::ProcessFailure;
pub use theme::Material;

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
