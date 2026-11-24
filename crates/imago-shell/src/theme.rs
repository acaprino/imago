//! The window theme, and what the window is made of. The theme of a window decides the acrylic behind
//! a transparent one, the frame Windows draws and the page's `prefers-color-scheme`. The page tells
//! it, and it is kept in a file in the data folder: the next start builds the window with that theme
//! in its config and the first frame already has the right one. A window built again after a
//! WebView2 crash gets it too.
//!
//! `Window::set_theme` reaches DWM through tao (`DWMWA_USE_IMMERSIVE_DARK_MODE`), and tauri-runtime-wry
//! passes the new theme to WebView2's `PreferredColorScheme`. The JavaScript `setTheme()` would need
//! `core:window:allow-set-theme` and cannot keep the choice for the first frame.
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
pub(crate) enum WindowTheme {
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
pub(crate) fn parse_theme(word: &str) -> Option<WindowTheme> {
    match word {
        "light" => Some(WindowTheme::Light),
        "dark" => Some(WindowTheme::Dark),
        "system" => Some(WindowTheme::System),
        _ => None,
    }
}

/// The theme the page draws, from the words it sends with its window theme: `resolved` is `light` or
/// `dark`, never `system`. A page that sends none draws the window theme's own, and dark for
/// `system`; any other word counts as none.
pub(crate) fn drawn_by_page(theme: WindowTheme, resolved: Option<&str>) -> Theme {
    match (resolved, theme) {
        (Some("light"), _) => Theme::Light,
        (Some("dark"), _) => Theme::Dark,
        (_, WindowTheme::Light) => Theme::Light,
        (_, WindowTheme::Dark | WindowTheme::System) => Theme::Dark,
    }
}

/// The tint of the acrylic (RGBA) in `theme`, light or dark.
///
/// Only the acrylic of Windows 10 (and of the first Windows 11, before 22H2) takes its colour from
/// the tint: there a light page needs a light tint and a dark page a dark one. On Windows 11 22H2
/// and later the acrylic ignores it ([`apply_theme`] says why it does no harm there).
fn acrylic_tint(theme: Theme) -> Color {
    match theme {
        // `#F6F7F9` at 88%, 0.88 x 255 = 224.4.
        Theme::Light => Color(0xF6, 0xF7, 0xF9, 224),
        // `#0C111D` at 80%, 0.8 x 255 = 204. Dark, and any theme a later Tauri adds.
        _ => Color(0x0C, 0x11, 0x1D, 204),
    }
}

/// Keeps the theme in `<data_dir>/window-theme` for the next start. The file is written whole or
/// not at all, and the folder is made when it is not there yet.
pub(crate) fn save_theme(data_dir: &Path, theme: WindowTheme) -> io::Result<()> {
    crate::write_atomically(&data_dir.join(THEME_FILE), theme.word().as_bytes())
}

/// The theme the window opened with last time. A missing, unreadable or corrupt file is `None`
/// (a fresh install: the window follows Windows).
pub(crate) fn saved_theme(data_dir: &Path) -> Option<WindowTheme> {
    parse_theme(fs::read_to_string(data_dir.join(THEME_FILE)).ok()?.trim())
}

/// An acrylic window takes `theme`, and its acrylic the tint of the theme the page draws, `resolved`
/// ([`acrylic_tint`]).
///
/// The tint is for Windows 10, where the acrylic takes its colour from it. On Windows 11 22H2 and
/// later it does no harm: there the acrylic is the system backdrop `DWMSBT_TRANSIENTWINDOW`, which
/// takes no colour and follows only the window's theme, which is set first. Setting the effect again
/// sets the backdrop the window already has.
///
/// The first frame is not this function's: it has the theme saved with [`save_theme`] and the tint
/// of the app's own config, until the page's first call.
pub(crate) fn apply_theme<R: Runtime>(
    window: &WebviewWindow<R>,
    theme: WindowTheme,
    resolved: Theme,
) -> tauri::Result<()> {
    window.set_theme(theme.to_tauri())?;
    window.set_effects(WindowEffectsConfig {
        effects: vec![WindowEffect::Acrylic],
        color: Some(acrylic_tint(resolved)),
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
/// - No decorations: the HTML title bar is the frame.
/// - A minimum width of 500, or the app's own if larger: the snap zones need it.
/// - The theme of `saved` (see [`saved_theme`]), so the first frame already has the right acrylic.
///   With nothing saved the config's own theme stands, and with none the window follows Windows.
fn glass_window_config(base: WindowConfig, saved: Option<WindowTheme>) -> WindowConfig {
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

/// What the window is made of, behind the page.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Material {
    /// Windows' acrylic, behind a transparent page.
    Acrylic,
    /// One opaque colour for each theme, the ground the page draws there: what shows before the
    /// page has drawn, while it is reloaded and at the edge of a window that is resized.
    Opaque { dark: Color, light: Color },
}

impl Material {
    /// The colour of an opaque window in `theme`.
    fn ground(self, theme: Theme) -> Option<Color> {
        match (self, theme) {
            (Material::Acrylic, _) => None,
            (Material::Opaque { light, .. }, Theme::Light) => Some(light),
            // Dark, and any theme a later Tauri adds.
            (Material::Opaque { dark, .. }, _) => Some(dark),
        }
    }

    /// The window of this material, from the app's own config, with the theme of `saved`: without
    /// decorations and at least 500 wide.
    pub(crate) fn window_config(
        self,
        base: WindowConfig,
        saved: Option<WindowTheme>,
    ) -> WindowConfig {
        let config = glass_window_config(base, saved);
        match self.ground(config.theme.unwrap_or(Theme::Dark)) {
            None => config,
            ground => WindowConfig {
                transparent: false,
                window_effects: None,
                background_color: ground,
                ..config
            },
        }
    }

    /// An opaque window that follows Windows gets the ground of the theme Windows has.
    pub(crate) fn paint_first_frame<R: Runtime>(
        self,
        window: &WebviewWindow<R>,
    ) -> tauri::Result<()> {
        match self.ground(window.theme()?) {
            None => Ok(()),
            ground => window.set_background_color(ground),
        }
    }

    /// The window takes the theme the page chose, and the material of the theme it draws.
    pub(crate) fn apply<R: Runtime>(
        self,
        window: &WebviewWindow<R>,
        theme: WindowTheme,
        resolved: Theme,
    ) -> tauri::Result<()> {
        match self.ground(resolved) {
            None => apply_theme(window, theme, resolved),
            ground => {
                window.set_theme(theme.to_tauri())?;
                window.set_background_color(ground)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_opaque_window_has_the_ground_of_its_theme_and_no_glass() {
        let (dark, light) = (Color(18, 22, 30, 255), Color(246, 247, 249, 255));
        let opaque = Material::Opaque { dark, light };
        // The app's own file may still ask for glass: the material wins.
        let base = WindowConfig {
            transparent: true,
            decorations: true,
            min_width: Some(300.0),
            window_effects: Some(WindowEffectsConfig {
                effects: vec![WindowEffect::Acrylic],
                ..Default::default()
            }),
            ..Default::default()
        };
        for (saved, ground) in [
            (Some(WindowTheme::Light), light),
            (Some(WindowTheme::Dark), dark),
            (Some(WindowTheme::System), dark),
            (None, dark),
        ] {
            let config = opaque.window_config(base.clone(), saved);
            assert!(!config.transparent && !config.decorations, "{saved:?}");
            assert!(config.window_effects.is_none(), "{saved:?}");
            assert_eq!(config.background_color, Some(ground), "{saved:?}");
            assert_eq!(config.min_width, Some(500.0), "the snap zones need it");
            assert_eq!(config.theme, saved.and_then(WindowTheme::to_tauri));
        }
        assert_eq!(opaque.ground(Theme::Light), Some(light));
        assert_eq!(opaque.ground(Theme::Dark), Some(dark));
    }

    #[test]
    fn an_acrylic_window_is_the_glass_window() {
        let config = Material::Acrylic.window_config(WindowConfig::default(), None);
        assert!(config.transparent);
        assert_eq!(config.background_color, Some(Color(0, 0, 0, 0)));
        assert_eq!(
            config.window_effects.expect("an acrylic effect").effects,
            vec![WindowEffect::Acrylic]
        );
        assert_eq!(Material::Acrylic.ground(Theme::Light), None);
    }

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
    fn the_page_says_what_it_draws_and_one_that_does_not_draws_its_word() {
        use WindowTheme::{Dark, Light, System};
        // What the page sent wins over the word, `system` included.
        assert_eq!(drawn_by_page(System, Some("light")), Theme::Light);
        assert_eq!(drawn_by_page(System, Some("dark")), Theme::Dark);
        assert_eq!(drawn_by_page(Dark, Some("light")), Theme::Light);
        // A page that sends none, or a word that is not one: the word's own, and dark for `system`.
        for (theme, drawn) in [
            (Light, Theme::Light),
            (Dark, Theme::Dark),
            (System, Theme::Dark),
        ] {
            assert_eq!(drawn_by_page(theme, None), drawn, "{theme:?}");
            assert_eq!(drawn_by_page(theme, Some("purple")), drawn, "{theme:?}");
        }
    }

    #[test]
    fn the_tint_is_a_colour_at_a_percentage_of_opacity() {
        let ground = |hex: u32, percent: f64| {
            let [_, red, green, blue] = hex.to_be_bytes();
            Color(red, green, blue, (percent / 100.0 * 255.0).round() as u8)
        };
        assert_eq!(acrylic_tint(Theme::Dark), ground(0x0C111D, 80.0));
        assert_eq!(acrylic_tint(Theme::Light), ground(0xF6F7F9, 88.0));
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
