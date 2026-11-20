//! The Rust side of Imago's desktop shell: the window's acrylic, theme, Snap Layouts and guard.
//!
//! One copy of what Shinatama and Xiox each had, for every app of the suite:
//!
//! - [`theme`]: the window theme (light, dark or the system's), kept in a file in the data folder so
//!   the next start opens on the right acrylic, and [`glass_window_config`], the main window's
//!   config with the glass material.
//! - [`frame`]: Snap Layouts on the HTML maximize button.
//! - [`guard`]: a webview shows only the app's own pages.
//! - [`recovery`]: a page that fails is reloaded at most three times a minute.
//! - [`window_state`]: where the window was, brought back inside the monitors there are now.
//!
//! The decisions (parsing, files, limits, geometry) are plain functions that need no window; the Win32
//! and Tauri calls are thin around them. Win32 is behind `cfg(windows)`: other targets compile the
//! same names to no-ops.

mod frame;
mod guard;
mod recovery;
mod theme;
mod window_state;

pub use frame::{install_snap_layouts, SnapLayouts};
pub use guard::guard_navigation;
pub use recovery::Recovery;
pub use theme::{
    apply_theme, glass_window_config, parse_theme, save_theme, saved_theme, WindowTheme,
};
pub use window_state::{
    clamp_to_monitors, clamp_to_screens, load_state, save_state, state_to_save, Rect, Screen,
    WindowState,
};

use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

/// Writes `bytes` to `<path>.tmp` and renames it over `path`, so a crash never leaves half a file.
/// The folder is made when it is not there yet.
pub(crate) fn write_atomically(path: &Path, bytes: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    let temporary = PathBuf::from(temporary);
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
