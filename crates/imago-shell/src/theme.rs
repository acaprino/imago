//! The window theme, and what the window is made of. The theme of a window decides the acrylic behind
//! a transparent one, the frame Windows draws and the page's `prefers-color-scheme`. The page tells
//! it, and it is kept in a file in the data folder: the next start builds the window with that theme
//! in its config and the first frame already has the right one. A window built again after a
//! WebView2 crash gets it too.
//!
//! `Window::set_theme` reaches DWM through tao (`DWMWA_USE_IMMERSIVE_DARK_MODE`), and tauri-runtime-wry
//! passes the new theme to WebView2's `PreferredColorScheme`. The JavaScript `setTheme()` would need
//! `core:window:allow-set-theme` and cannot keep the choice for the first frame.
//!
//! The material of the window is a property it has from its creation. An app says whether it is
//! always glass, never glass, or the person's choice ([`Material::Optional`]); the person's choice is
//! kept in a file of the data folder, as the theme is, and read when the window is built. A choice
//! made while the window runs changes nothing in it: it is for the next start.
use serde::Serialize;
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

/// The material the person chose for the main window, kept in the data folder for the next start.
const MATERIAL_FILE: &str = "window-material";

/// The narrowest window of the suite. A `minWidth` of 500 is what gives the window its snap zones.
const MIN_WIDTH: f64 = 500.0;

/// The ground the page of the suite draws in dark, for [`Material::Opaque`]. `ts/preset.ts` states
/// it too.
pub const DARK_GROUND: Color = Color(0x12, 0x16, 0x1E, 255);

/// The ground the page of the suite draws in light, for [`Material::Opaque`]. `ts/preset.ts` states
/// it too.
pub const LIGHT_GROUND: Color = Color(0xF6, 0xF7, 0xF9, 255);

/// What wry passes to WebView2 for a window that gives no arguments of its own, when Tauri builds
/// it: a window that gives some replaces them all.
const WRY_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                        --autoplay-policy=no-user-gesture-required";

/// Text in shades of gray: on an opaque window the engine draws it with ClearType, whose colour
/// fringes make it look thinner than on a transparent one.
const GRAY_TEXT: &str = "--disable-lcd-text";

/// The browser arguments of a window: its own, or wry's for one that has none, and gray text. The
/// main window has them. WebView2 refuses another webview on the same data folder with other
/// arguments, so an app that opens one gives it these.
pub fn browser_args(window: &WindowConfig) -> String {
    let mut args = match (&window.additional_browser_args, &window.proxy_url) {
        (Some(own), _) => own.clone(),
        (None, None) => WRY_ARGS.to_owned(),
        (None, Some(proxy)) => {
            let proxy = proxy.as_str().trim_end_matches('/');
            format!("{WRY_ARGS} --proxy-server={proxy}")
        }
    };
    args.push(' ');
    args.push_str(GRAY_TEXT);
    args
}

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
    pub(crate) fn word(self) -> &'static str {
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

/// `glass` or `opaque`, in lower case and nothing else: whether the person turned glass on.
pub(crate) fn parse_material(word: &str) -> Option<bool> {
    match word {
        "glass" => Some(true),
        "opaque" => Some(false),
        _ => None,
    }
}

/// The word the file and the page use for the material.
pub(crate) fn material_word(glass: bool) -> &'static str {
    if glass {
        "glass"
    } else {
        "opaque"
    }
}

/// Keeps the person's choice of glass in `<data_dir>/window-material` for the next start, whole or
/// not at all like the theme.
pub(crate) fn save_glass(data_dir: &Path, glass: bool) -> io::Result<()> {
    crate::write_atomically(
        &data_dir.join(MATERIAL_FILE),
        material_word(glass).as_bytes(),
    )
}

/// Whether the person turned glass on, as last kept. A missing, unreadable or corrupt file is
/// `None`: the person has not chosen.
pub(crate) fn saved_glass(data_dir: &Path) -> Option<bool> {
    parse_material(
        fs::read_to_string(data_dir.join(MATERIAL_FILE))
            .ok()?
            .trim(),
    )
}

/// What the page is told of the material, for the switch of its settings.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub(crate) struct MaterialState {
    /// The window was built as glass: the page draws a ground that lets it show through.
    pub glass: bool,
    /// The next start builds it as glass: what the person kept, or what the app says.
    pub next: bool,
    /// The person can choose: the app's material is [`Material::Optional`] and a choice can be kept.
    pub optional: bool,
}

/// The material of the window `built` for an app whose own is `app`, with the choice kept in
/// `data_dir`.
pub(crate) fn material_state(
    app: Material,
    built: Material,
    data_dir: Option<&Path>,
) -> MaterialState {
    let kept = data_dir.and_then(saved_glass).unwrap_or(false);
    MaterialState {
        glass: built.is_glass(),
        next: app.built(kept).is_glass(),
        optional: app.is_optional() && data_dir.is_some(),
    }
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
/// - Text in gray ([`browser_args`]).
/// - The theme of `saved` (see [`saved_theme`]), so the first frame already has the right acrylic.
///   With nothing saved the config's own theme stands, and with none the window follows Windows.
fn glass_window_config(base: WindowConfig, saved: Option<WindowTheme>) -> WindowConfig {
    let mut config = base;
    config.transparent = true;
    config.background_color = Some(Color(0, 0, 0, 0));
    config.decorations = false;
    config.min_width = Some(config.min_width.unwrap_or(0.0).max(MIN_WIDTH));
    config.additional_browser_args = Some(browser_args(&config));
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
    /// page has drawn, while it is reloaded and at the edge of a window that is resized. The suite's
    /// are [`DARK_GROUND`] and [`LIGHT_GROUND`].
    Opaque { dark: Color, light: Color },
    /// Opaque, with those grounds, unless the person turned glass on: then Acrylic. The choice is
    /// kept in `window-material` of the data folder and read when the window is built, so it holds
    /// from the next start; with no data folder the window is always opaque. The default of an app
    /// of the suite ([`Options::for_app`](crate::Options::for_app)).
    Optional { dark: Color, light: Color },
}

impl Material {
    /// The suite's own: opaque in the grounds of the look, glass when the person turned it on.
    pub const SUITE: Material = Material::Optional {
        dark: DARK_GROUND,
        light: LIGHT_GROUND,
    };

    /// The colour of an opaque window in `theme`. An optional material, not yet built
    /// ([`Material::built`]), is the opaque one.
    fn ground(self, theme: Theme) -> Option<Color> {
        match (self, theme) {
            (Material::Acrylic, _) => None,
            (Material::Opaque { light, .. } | Material::Optional { light, .. }, Theme::Light) => {
                Some(light)
            }
            // Dark, and any theme a later Tauri adds.
            (Material::Opaque { dark, .. } | Material::Optional { dark, .. }, _) => Some(dark),
        }
    }

    /// The window is made of the system's glass.
    pub(crate) fn is_glass(self) -> bool {
        self == Material::Acrylic
    }

    /// The person chooses whether the window is glass.
    pub(crate) fn is_optional(self) -> bool {
        matches!(self, Material::Optional { .. })
    }

    /// The material a window is built with: an optional one is glass when `glass` (the person's kept
    /// choice) and opaque otherwise; the app's own, acrylic or opaque, is what the app said.
    pub(crate) fn built(self, glass: bool) -> Material {
        match self {
            Material::Optional { .. } if glass => Material::Acrylic,
            Material::Optional { dark, light } => Material::Opaque { dark, light },
            fixed => fixed,
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
    fn a_window_draws_gray_text_and_keeps_the_arguments_it_has() {
        let wry = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
                   --autoplay-policy=no-user-gesture-required";
        let plain = WindowConfig::default();
        assert_eq!(browser_args(&plain), format!("{wry} --disable-lcd-text"));
        let proxied = WindowConfig {
            proxy_url: Some("http://127.0.0.1:8080".parse().unwrap()),
            ..Default::default()
        };
        assert_eq!(
            browser_args(&proxied),
            format!("{wry} --proxy-server=http://127.0.0.1:8080 --disable-lcd-text")
        );
        // An app's own arguments replace wry's, as without the crate.
        let own = WindowConfig {
            additional_browser_args: Some("--own".into()),
            ..proxied
        };
        assert_eq!(browser_args(&own), "--own --disable-lcd-text");
        let opaque = Material::Opaque {
            dark: DARK_GROUND,
            light: LIGHT_GROUND,
        };
        for material in [Material::Acrylic, opaque] {
            for window in [&plain, &own] {
                let config = material.window_config(window.clone(), None);
                assert_eq!(config.additional_browser_args, Some(browser_args(window)));
            }
        }
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

    const GROUNDS: Material = Material::Optional {
        dark: DARK_GROUND,
        light: LIGHT_GROUND,
    };

    #[test]
    fn an_optional_material_is_opaque_unless_the_person_turned_glass_on() {
        let opaque = Material::Opaque {
            dark: DARK_GROUND,
            light: LIGHT_GROUND,
        };
        assert_eq!(GROUNDS, Material::SUITE);
        assert_eq!(GROUNDS.built(false), opaque);
        assert_eq!(GROUNDS.built(true), Material::Acrylic);
        // What an app says for itself is not the person's to change.
        for glass in [false, true] {
            assert_eq!(opaque.built(glass), opaque);
            assert_eq!(Material::Acrylic.built(glass), Material::Acrylic);
        }
        assert!(GROUNDS.is_optional() && !opaque.is_optional() && !Material::Acrylic.is_optional());
        assert!(Material::Acrylic.is_glass() && !opaque.is_glass() && !GROUNDS.is_glass());
    }

    #[test]
    fn an_optional_material_not_yet_built_has_the_grounds_of_an_opaque_one() {
        for theme in [Theme::Light, Theme::Dark] {
            assert_eq!(
                GROUNDS.ground(theme),
                GROUNDS.built(false).ground(theme),
                "{theme:?}"
            );
        }
        assert_eq!(GROUNDS.ground(Theme::Dark), Some(DARK_GROUND));
        assert_eq!(GROUNDS.ground(Theme::Light), Some(LIGHT_GROUND));
    }

    #[test]
    fn the_window_is_built_as_the_person_chose() {
        let base = WindowConfig::default();
        let plain = GROUNDS.built(false).window_config(base.clone(), None);
        assert!(!plain.transparent && plain.window_effects.is_none());
        assert_eq!(plain.background_color, Some(DARK_GROUND));
        let glass = GROUNDS.built(true).window_config(base, None);
        assert!(glass.transparent);
        assert_eq!(glass.background_color, Some(Color(0, 0, 0, 0)));
        assert_eq!(
            glass.window_effects.expect("an acrylic effect").effects,
            vec![WindowEffect::Acrylic]
        );
        assert!(!glass.decorations && glass.min_width == Some(500.0));
    }

    #[test]
    fn parse_material_reads_only_its_two_words() {
        assert_eq!(parse_material("glass"), Some(true));
        assert_eq!(parse_material("opaque"), Some(false));
        for word in ["Glass", "OPAQUE", "acrylic", "true", ""] {
            assert_eq!(parse_material(word), None, "{word:?}");
        }
        for glass in [true, false] {
            assert_eq!(parse_material(material_word(glass)), Some(glass));
        }
    }

    #[test]
    fn the_choice_of_glass_is_the_bare_word_written_atomically() {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().join("not").join("there").join("yet");
        assert_eq!(saved_glass(&data), None, "no file yet");
        save_glass(&data, true).unwrap();
        assert_eq!(
            std::fs::read_to_string(data.join("window-material")).unwrap(),
            "glass"
        );
        assert_eq!(saved_glass(&data), Some(true));
        save_glass(&data, false).unwrap();
        assert_eq!(
            std::fs::read_to_string(data.join("window-material")).unwrap(),
            "opaque"
        );
        assert_eq!(saved_glass(&data), Some(false));
        assert_eq!(
            crate::tests::names_in(&data),
            ["window-material"],
            "the temporary file is renamed away"
        );
    }

    #[test]
    fn a_file_of_the_material_with_anything_else_in_it_is_no_choice() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("window-material");
        let contents: [&[u8]; 3] = [b"garbage", b"", &[0xff, 0xfe, 0x00]];
        for content in contents {
            std::fs::write(&file, content).unwrap();
            assert_eq!(saved_glass(dir.path()), None, "{content:?}");
        }
        std::fs::write(&file, "glass\n").unwrap();
        assert_eq!(saved_glass(dir.path()), Some(true), "a hand edit's newline");
    }

    #[test]
    fn the_page_is_told_what_was_built_and_what_the_next_start_builds() {
        let dir = tempfile::tempdir().unwrap();
        let state = |app: Material, built: Material, data: Option<&Path>| {
            let MaterialState {
                glass,
                next,
                optional,
            } = material_state(app, built, data);
            (glass, next, optional)
        };
        let opaque = GROUNDS.built(false);
        // Nothing chosen: opaque, now and next, and the person may choose.
        assert_eq!(
            state(GROUNDS, opaque, Some(dir.path())),
            (false, false, true)
        );
        // Chosen while the window runs: it stays as it was built, and the next start differs.
        save_glass(dir.path(), true).unwrap();
        assert_eq!(
            state(GROUNDS, opaque, Some(dir.path())),
            (false, true, true)
        );
        // Built after the choice: both are glass.
        assert_eq!(
            state(GROUNDS, GROUNDS.built(true), Some(dir.path())),
            (true, true, true)
        );
        save_glass(dir.path(), false).unwrap();
        assert_eq!(
            state(GROUNDS, GROUNDS.built(true), Some(dir.path())),
            (true, false, true)
        );
        // No data folder: nothing can be kept, so there is no choice.
        assert_eq!(state(GROUNDS, opaque, None), (false, false, false));
        // An app's own material is not the person's, whatever is kept.
        save_glass(dir.path(), true).unwrap();
        let fixed = Material::Opaque {
            dark: DARK_GROUND,
            light: LIGHT_GROUND,
        };
        assert_eq!(state(fixed, fixed, Some(dir.path())), (false, false, false));
        assert_eq!(
            state(Material::Acrylic, Material::Acrylic, Some(dir.path())),
            (true, true, false)
        );
    }

    #[test]
    fn the_state_goes_to_the_page_as_three_words() {
        let state = MaterialState {
            glass: true,
            next: false,
            optional: true,
        };
        assert_eq!(
            serde_json::to_string(&state).unwrap(),
            r#"{"glass":true,"next":false,"optional":true}"#
        );
    }
}
