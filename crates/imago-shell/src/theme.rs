//! The window theme and the glass window. On Windows 11 the acrylic behind a transparent window and
//! the page's `prefers-color-scheme` both follow the window's theme, never a tint: a dark acrylic
//! under light surfaces turns them grey. So the page tells the shell the theme of its look, and the
//! shell keeps it in a file in the data folder: the next start builds the window with that theme in
//! its config and the first frame already has the right acrylic. A window rebuilt after a WebView2
//! crash gets it too. On Windows 10 the acrylic takes its colour from a tint instead, so the shell
//! also tints it with the ground of the look ([`acrylic_tint`]).
//!
//! | Look | Window theme |
//! |---|---|
//! | Smooth or ONI MODE, theme Light | `light` |
//! | Smooth or ONI MODE, theme Dark | `dark` |
//! | Smooth, theme Windows | `system` (no theme of its own: the window follows Windows) |
//! | ONI MODE, theme Windows | `dark` (ONI has no light backdrop to follow) |
//!
//! `Window::set_theme` reaches DWM through tao (`DWMWA_USE_IMMERSIVE_DARK_MODE`), and tauri-runtime-wry
//! passes the new theme to WebView2's `PreferredColorScheme`. An app command that calls
//! [`apply_theme`] needs no extra capability; the JavaScript `setTheme()` would need
//! `core:window:allow-set-theme` and cannot save the choice for the first frame.
use std::{fs, io, path::Path};
use tauri::{
    utils::{
        config::{Color, WindowConfig, WindowEffectsConfig},
        WindowEffect,
    },
    Runtime, Theme, WebviewWindow,
};

/// The main window's theme, kept in the data folder for the next start.
const THEME_FILE: &str = "window-theme";

/// The narrowest window of the suite. A `minWidth` of 500 is what gives the window its snap zones.
const MIN_WIDTH: f64 = 500.0;

/// What the window asks Windows for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WindowTheme {
    Light,
    Dark,
    /// No theme of its own: the window follows Windows.
    System,
}

impl WindowTheme {
    /// The word the file and the page use.
    fn word(self) -> &'static str {
        match self {
            WindowTheme::Light => "light",
            WindowTheme::Dark => "dark",
            WindowTheme::System => "system",
        }
    }

    /// What Tauri takes: `None` is the system's.
    fn to_tauri(self) -> Option<Theme> {
        match self {
            WindowTheme::Light => Some(Theme::Light),
            WindowTheme::Dark => Some(Theme::Dark),
            WindowTheme::System => None,
        }
    }
}

/// `light`, `dark` or `system`, in lower case and nothing else.
pub fn parse_theme(word: &str) -> Option<WindowTheme> {
    match word {
        "light" => Some(WindowTheme::Light),
        "dark" => Some(WindowTheme::Dark),
        "system" => Some(WindowTheme::System),
        _ => None,
    }
}

/// The look the page shows. The window theme does not depend on it (the page sends the theme of its
/// look); the tint of the acrylic does ([`acrylic_tint`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Look {
    Smooth,
    /// ONI MODE.
    Oni,
}

/// The look a word of the page stands for: `oni` is ONI MODE, and any other word is Smooth, the
/// default look, as the page's own `parseLook` reads it.
pub fn parse_look(word: &str) -> Look {
    match word {
        "oni" => Look::Oni,
        _ => Look::Smooth,
    }
}

/// What the page draws, from the words it sends with its window theme: `look` (`smooth` or `oni`,
/// read by [`parse_look`]) and `resolved`, the theme it draws (`light` or `dark`, never `system`).
/// The tint of the acrylic is chosen from these two ([`acrylic_tint`]), not from what Windows says
/// at the call. A page that sends neither, one older than the tint, is Smooth in the window theme's
/// own word, and dark for `system`; a word that is not `light` or `dark` counts as none.
pub fn drawn_by_page(
    theme: WindowTheme,
    look: Option<&str>,
    resolved: Option<&str>,
) -> (Look, Theme) {
    let look = look.map_or(Look::Smooth, parse_look);
    let resolved = match (resolved, theme) {
        (Some("light"), _) => Theme::Light,
        (Some("dark"), _) => Theme::Dark,
        (_, WindowTheme::Light) => Theme::Light,
        (_, WindowTheme::Dark | WindowTheme::System) => Theme::Dark,
    };
    (look, resolved)
}

/// The tint of the acrylic (RGBA) for `look` drawn in `theme`, light or dark: the ground of the
/// look under glass. That is `--im-ground` under `.im-glass` in `css/tokens.css`, the `glass`
/// extension of the look's `ground` in `tokens/imago.tokens.json`, and the row "Ground" of the
/// table in section 1.3 of `docs/desktop-shell.md`: the colour as it is, its alpha times 255,
/// rounded.
///
/// Only the acrylic of Windows 10 (and of the first Windows 11, before 22H2) takes its colour from
/// the tint: there a light look needs a light tint and a dark look a dark one. On Windows 11 22H2
/// and later the acrylic ignores it ([`apply_theme`] says why it does no harm there).
pub fn acrylic_tint(look: Look, theme: Theme) -> Color {
    match (look, theme) {
        // Smooth light: `#F6F7F9` at 88%, 0.88 x 255 = 224.4.
        (Look::Smooth, Theme::Light) => Color(0xF6, 0xF7, 0xF9, 224),
        // ONI light: `#E9EEF8` at 90%, 0.9 x 255 = 229.5, rounded up.
        (Look::Oni, Theme::Light) => Color(0xE9, 0xEE, 0xF8, 230),
        // Smooth dark: `#0C111D` at 80%, 0.8 x 255 = 204. Dark, and any theme a later Tauri adds.
        (Look::Smooth, _) => Color(0x0C, 0x11, 0x1D, 204),
        // ONI dark: `#0B0416` at 86%, 0.86 x 255 = 219.3.
        (Look::Oni, _) => Color(0x0B, 0x04, 0x16, 219),
    }
}

/// Keeps the theme in `<data_dir>/window-theme` for the next start. The file is written whole or
/// not at all, and the folder is made when it is not there yet.
pub fn save_theme(data_dir: &Path, theme: WindowTheme) -> io::Result<()> {
    crate::write_atomically(&data_dir.join(THEME_FILE), theme.word().as_bytes())
}

/// The theme the window opened with last time. A missing, unreadable or corrupt file is `None`
/// (a fresh install: the window follows Windows).
pub fn saved_theme(data_dir: &Path) -> Option<WindowTheme> {
    parse_theme(fs::read_to_string(data_dir.join(THEME_FILE)).ok()?.trim())
}

/// The window takes the theme of the look the page shows, and its acrylic the tint of that look in
/// the theme the page draws, `resolved` ([`acrylic_tint`]; [`drawn_by_page`] reads both from what
/// the page sent). It also gives the window the acrylic effect, so it is for the glass window only:
/// call it on the window built from [`glass_window_config`], and on no other.
///
/// The tint is for Windows 10, where the acrylic takes its colour from it. On Windows 11 22H2 and
/// later it does no harm: there the acrylic is the system backdrop `DWMSBT_TRANSIENTWINDOW`, which
/// takes no colour and follows only the window's theme, which is set first, as before. Setting the
/// effect again is the call Tauri made when it built the window from [`glass_window_config`], and
/// it sets the backdrop the window already has.
///
/// The first frame is not this function's: it has the theme saved with [`save_theme`] and the tint
/// of the app's own config, until the page's first call.
pub fn apply_theme<R: Runtime>(
    window: &WebviewWindow<R>,
    theme: WindowTheme,
    look: Look,
    resolved: Theme,
) -> tauri::Result<()> {
    window.set_theme(theme.to_tauri())?;
    window.set_effects(WindowEffectsConfig {
        effects: vec![WindowEffect::Acrylic],
        color: Some(acrylic_tint(look, resolved)),
        ..Default::default()
    })
}

/// The window as the glass material needs it, from the app's own config (label, size, URL...):
///
/// - Transparent with a clear background (`#00000000`): wry gives WebView2 a transparent default
///   background, so there is no white flash before the page draws.
/// - The acrylic effect. On Windows 11 22H2 and later it is the system backdrop
///   `DWMSBT_TRANSIENTWINDOW`, which **ignores the tint colour** and follows only the window's
///   theme; the tint reaches Windows 10 only, so the app's own is kept as it is.
/// - No decorations: the HTML title bar is the frame (Snap Layouts, [`install_snap_layouts`]).
/// - A minimum width of 500, or the app's own if larger: the snap zones need it.
/// - The theme of `saved` (see [`saved_theme`]), so the first frame already has the right acrylic.
///   With nothing saved the config's own theme stands, and with none the window follows Windows.
///
/// [`install_snap_layouts`]: crate::install_snap_layouts
pub fn glass_window_config(base: WindowConfig, saved: Option<WindowTheme>) -> WindowConfig {
    let mut config = base;
    config.transparent = true;
    config.background_color = Some(Color(0, 0, 0, 0));
    config.decorations = false;
    config.min_width = Some(config.min_width.unwrap_or(0.0).max(MIN_WIDTH));
    config.window_effects = Some(WindowEffectsConfig {
        effects: vec![WindowEffect::Acrylic],
        ..config.window_effects.unwrap_or_default()
    });
    if let Some(theme) = saved {
        config.theme = theme.to_tauri();
    }
    config
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_theme_reads_only_its_three_words() {
        assert_eq!(parse_theme("light"), Some(WindowTheme::Light));
        assert_eq!(parse_theme("dark"), Some(WindowTheme::Dark));
        assert_eq!(parse_theme("system"), Some(WindowTheme::System));
        assert_eq!(parse_theme("Purple"), None);
        assert_eq!(parse_theme("Dark"), None, "the words are lower case");
        assert_eq!(parse_theme(""), None);
    }

    #[test]
    fn a_saved_theme_is_read_back_for_each_of_the_three() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(saved_theme(dir.path()), None, "no file yet");
        for theme in [WindowTheme::Dark, WindowTheme::Light, WindowTheme::System] {
            save_theme(dir.path(), theme).unwrap();
            assert_eq!(saved_theme(dir.path()), Some(theme));
        }
    }

    #[test]
    fn the_file_is_the_bare_word_written_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("not").join("there").join("yet");
        save_theme(&data, WindowTheme::Light).unwrap();
        assert_eq!(
            std::fs::read_to_string(data.join("window-theme")).unwrap(),
            "light"
        );
        assert_eq!(
            crate::tests::names_in(&data),
            ["window-theme"],
            "the temporary file is renamed away"
        );
    }

    #[test]
    fn a_file_with_anything_else_in_it_is_no_theme() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("window-theme");
        std::fs::write(&file, "garbage").unwrap();
        assert_eq!(saved_theme(dir.path()), None);
        std::fs::write(&file, "").unwrap();
        assert_eq!(saved_theme(dir.path()), None);
        std::fs::write(&file, [0xff, 0xfe, 0x00]).unwrap();
        assert_eq!(saved_theme(dir.path()), None, "not even text");
        // Shinatama wrote the word as it came; a trailing newline from a hand edit is still the word.
        std::fs::write(&file, "dark\n").unwrap();
        assert_eq!(saved_theme(dir.path()), Some(WindowTheme::Dark));
    }

    #[test]
    fn the_theme_goes_to_the_window_as_light_dark_or_none() {
        assert_eq!(WindowTheme::Light.to_tauri(), Some(tauri::Theme::Light));
        assert_eq!(WindowTheme::Dark.to_tauri(), Some(tauri::Theme::Dark));
        assert_eq!(
            WindowTheme::System.to_tauri(),
            None,
            "no theme of its own: the window follows Windows"
        );
    }

    #[test]
    fn the_glass_window_is_transparent_acrylic_without_a_frame() {
        let config = glass_window_config(WindowConfig::default(), None);
        assert!(config.transparent);
        assert_eq!(config.background_color, Some(Color(0, 0, 0, 0)));
        assert!(!config.decorations);
        assert_eq!(config.min_width, Some(500.0));
        let effects = config.window_effects.expect("an acrylic effect");
        assert_eq!(effects.effects, vec![WindowEffect::Acrylic]);
    }

    #[test]
    fn the_glass_window_keeps_what_the_app_chose_besides() {
        let base = WindowConfig {
            label: "main".into(),
            width: 1440.0,
            min_width: Some(960.0),
            decorations: true,
            window_effects: Some(WindowEffectsConfig {
                effects: vec![WindowEffect::Mica],
                color: Some(Color(7, 14, 34, 84)),
                ..Default::default()
            }),
            ..Default::default()
        };
        let config = glass_window_config(base, None);
        assert_eq!((config.label.as_str(), config.width), ("main", 1440.0));
        assert_eq!(
            config.min_width,
            Some(960.0),
            "a larger minimum is the app's own"
        );
        assert!(!config.decorations);
        let effects = config.window_effects.unwrap();
        assert_eq!(
            effects.effects,
            vec![WindowEffect::Acrylic],
            "glass is acrylic, whatever was asked"
        );
        assert_eq!(
            effects.color,
            Some(Color(7, 14, 34, 84)),
            "the tint reaches Windows 10 only, and is the app's"
        );
        let narrow = WindowConfig {
            min_width: Some(300.0),
            ..Default::default()
        };
        assert_eq!(
            glass_window_config(narrow, None).min_width,
            Some(500.0),
            "never below the snap-zone minimum"
        );
    }

    #[test]
    fn parse_look_reads_oni_and_takes_any_other_word_for_smooth() {
        assert_eq!(parse_look("smooth"), Look::Smooth);
        assert_eq!(parse_look("oni"), Look::Oni);
        assert_eq!(parse_look("ONI"), Look::Smooth, "lower case only");
        assert_eq!(parse_look("modules"), Look::Smooth, "an unknown look");
        assert_eq!(parse_look(""), Look::Smooth);
    }

    #[test]
    fn the_page_says_what_it_draws_and_an_older_page_is_smooth_in_its_word() {
        use WindowTheme::{Dark, Light, System};
        // What the page sent: the theme it draws wins over the word, `system` included.
        assert_eq!(
            drawn_by_page(System, Some("oni"), Some("light")),
            (Look::Oni, Theme::Light)
        );
        assert_eq!(
            drawn_by_page(System, Some("smooth"), Some("dark")),
            (Look::Smooth, Theme::Dark)
        );
        // A page that sends no look is Smooth.
        assert_eq!(
            drawn_by_page(Light, None, Some("light")),
            (Look::Smooth, Theme::Light)
        );
        // A page that sends no theme drawn: the word's own, and dark for `system`.
        for (theme, drawn) in [
            (Light, Theme::Light),
            (Dark, Theme::Dark),
            (System, Theme::Dark),
        ] {
            assert_eq!(
                drawn_by_page(theme, None, None),
                (Look::Smooth, drawn),
                "{theme:?}"
            );
            assert_eq!(
                drawn_by_page(theme, Some("oni"), Some("purple")),
                (Look::Oni, drawn),
                "{theme:?}: a word that is not light or dark is none"
            );
        }
    }

    #[test]
    fn the_tint_is_the_ground_of_each_look_under_glass() {
        // docs/desktop-shell.md, section 1.3, the row "Ground": a colour at a percentage of
        // opacity, here its alpha as a byte.
        let ground = |hex: u32, percent: f64| {
            let [_, red, green, blue] = hex.to_be_bytes();
            Color(red, green, blue, (percent / 100.0 * 255.0).round() as u8)
        };
        for (look, theme, tint) in [
            (Look::Smooth, Theme::Dark, ground(0x0C111D, 80.0)),
            (Look::Smooth, Theme::Light, ground(0xF6F7F9, 88.0)),
            (Look::Oni, Theme::Dark, ground(0x0B0416, 86.0)),
            (Look::Oni, Theme::Light, ground(0xE9EEF8, 90.0)),
        ] {
            assert_eq!(acrylic_tint(look, theme), tint, "{look:?} {theme:?}");
        }
    }

    #[test]
    fn the_window_opens_with_the_theme_it_saved() {
        let base = WindowConfig {
            theme: Some(tauri::Theme::Dark),
            ..Default::default()
        };
        let of = |saved| glass_window_config(base.clone(), saved).theme;
        assert_eq!(of(Some(WindowTheme::Light)), Some(tauri::Theme::Light));
        assert_eq!(of(Some(WindowTheme::Dark)), Some(tauri::Theme::Dark));
        assert_eq!(
            of(Some(WindowTheme::System)),
            None,
            "saved as system: no theme of its own"
        );
        assert_eq!(
            of(None),
            Some(tauri::Theme::Dark),
            "nothing saved: the app's declared theme stands"
        );
        assert_eq!(
            glass_window_config(WindowConfig::default(), None).theme,
            None,
            "a fresh install follows Windows"
        );
    }
}
