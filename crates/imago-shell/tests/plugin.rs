//! The plugin on Tauri's mock runtime: which page may call its commands, by the capability the app
//! gives it, and what the commands do. The calls go through the same gate as a real page's (Tauri's
//! access control list), made from the crate's own permission file. A real window is not here.
use imago_shell::{open_main, plugin, Material, Options, DARK_GROUND, LIGHT_GROUND};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY},
    utils::{
        acl::manifest::{Manifest, PermissionFile},
        config::WindowConfig,
    },
    webview::InvokeRequest,
    App, Manager, WebviewWindowBuilder,
};

/// The page's address, and what the engine says it is in a call (the origin alone).
const PAGE: &str = "http://127.0.0.1:50123/app/?token=x";
const ORIGIN: &str = "http://127.0.0.1:50123";
const LOCAL: &str = "http://tauri.localhost";
/// What the app of the suite is by default: opaque unless the person turned glass on.
const OPTIONAL: Material = Material::Optional {
    dark: DARK_GROUND,
    light: LIGHT_GROUND,
};
/// An app that decided for itself that its window is never glass.
const OPAQUE: Material = Material::Opaque {
    dark: DARK_GROUND,
    light: LIGHT_GROUND,
};

/// What an app calls when it does not start. It is not called here: it would wait for a person.
const _: fn(&str, &str) = imago_shell::message::tell;

/// Every command, with arguments it takes.
fn commands() -> [(&'static str, Value); 7] {
    [
        ("set_theme", json!({ "theme": "dark", "resolved": "dark" })),
        ("kept_theme", json!({})),
        ("material", json!({})),
        ("set_material", json!({ "material": "opaque" })),
        (
            "caption",
            json!({ "x": 1, "y": 0, "width": 46, "height": 32 }),
        ),
        ("ready", json!({})),
        ("chrome", json!({ "title": "Imago", "progress": 40 })),
    ]
}

/// An app with the plugin, `windows` in its config, and no capability yet.
fn app_with(windows: Vec<WindowConfig>) -> App<MockRuntime> {
    let file: PermissionFile =
        serde_json::from_str(include_str!("../permissions/default.json")).unwrap();
    let acl = BTreeMap::from([("imago-shell".to_owned(), Manifest::new(vec![file], None))]);
    let mut context = mock_context(noop_assets());
    *context.runtime_authority_mut() = tauri::runtime_authority!(acl, Default::default());
    context.config_mut().app.windows = windows;
    mock_builder().plugin(plugin()).build(context).unwrap()
}

/// The window `main` of an app's config.
fn main_config() -> WindowConfig {
    WindowConfig {
        create: false,
        title: "Imago".into(),
        ..Default::default()
    }
}

/// An app with its main window opened, of `material`; with its data folder, which already holds what
/// the person kept.
fn app_of(material: Material, kept: &[(&str, &str)]) -> (App<MockRuntime>, tempfile::TempDir) {
    let app = app_with(vec![main_config()]);
    let data = tempfile::tempdir().unwrap();
    for (name, word) in kept {
        std::fs::write(data.path().join(name), word).unwrap();
    }
    open_main(
        app.handle(),
        Options {
            data_dir: Some(data.path().to_owned()),
            material,
            ..Options::for_app(&app).unwrap()
        },
    )
    .unwrap();
    (app, data)
}

/// An app with its main window opened, in the material of the suite; with its data folder.
fn app() -> (App<MockRuntime>, tempfile::TempDir) {
    app_of(OPTIONAL, &[])
}

/// A capability of the window `main` for the pages at `urls`, and for no local page.
fn remote(urls: &[&str]) -> String {
    json!({
        "identifier": "remote",
        "windows": ["main"],
        "local": false,
        "remote": { "urls": urls },
        "permissions": ["imago-shell:default"],
    })
    .to_string()
}

/// The page at `url` in the window `label` calls `command`: the answer.
fn call(
    app: &App<MockRuntime>,
    label: &str,
    url: &str,
    command: &str,
    arguments: Value,
) -> Result<Value, String> {
    let request = InvokeRequest {
        cmd: format!("plugin:imago-shell|{command}"),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: url.parse().unwrap(),
        body: InvokeBody::Json(arguments),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(&app.get_webview_window(label).unwrap(), request)
        .map(|answer| answer.deserialize().unwrap())
        .map_err(|error| error.to_string())
}

fn assert_allowed(app: &App<MockRuntime>, url: &str) {
    for (command, arguments) in commands() {
        let answer = call(app, "main", url, command, arguments);
        assert!(answer.is_ok(), "{command} from {url}: {answer:?}");
    }
}

/// Refused by Tauri before the command runs, not by the command.
fn assert_refused(app: &App<MockRuntime>, url: &str) {
    for (command, arguments) in commands() {
        let refused = call(app, "main", url, command, arguments).unwrap_err();
        assert!(
            refused.contains("not allowed"),
            "{command} from {url}: {refused}"
        );
    }
}

#[test]
fn without_a_capability_no_page_reaches_the_commands() {
    let (app, _data) = app();
    for url in [PAGE, ORIGIN, LOCAL] {
        assert_refused(&app, url);
    }
}

#[test]
fn a_remote_capability_with_any_port_gives_the_commands_to_that_host_alone() {
    let (app, _data) = app();
    app.add_capability(remote(&["http://127.0.0.1:*"])).unwrap();
    for url in [PAGE, ORIGIN, "http://127.0.0.1:1/", "http://127.0.0.1/"] {
        assert_allowed(&app, url);
    }
    for url in [
        "http://localhost:50123/",
        "http://127.0.0.2:50123/",
        "http://127.0.0.1.evil.test:50123/",
        "http://evil.test/?http://127.0.0.1:50123",
        "https://127.0.0.1:50123/",
        LOCAL,
    ] {
        assert_refused(&app, url);
    }
}

#[test]
fn a_remote_capability_with_one_port_is_for_that_port() {
    let (app, _data) = app();
    app.add_capability(remote(&[ORIGIN])).unwrap();
    for url in [PAGE, ORIGIN] {
        assert_allowed(&app, url);
    }
    assert_refused(&app, "http://127.0.0.1:50124/app/");
}

#[test]
fn a_local_capability_is_for_the_embedded_page() {
    let (app, _data) = app();
    let local = json!({
        "identifier": "local",
        "windows": ["main"],
        "permissions": ["imago-shell:default"],
    });
    app.add_capability(local.to_string()).unwrap();
    assert_allowed(&app, LOCAL);
    assert_refused(&app, PAGE);
}

#[test]
fn the_theme_the_page_chose_is_kept_for_the_next_start() {
    let (app, data) = app();
    app.add_capability(remote(&["http://127.0.0.1:*"])).unwrap();
    let set = |arguments| call(&app, "main", PAGE, "set_theme", arguments);
    let said = || call(&app, "main", PAGE, "kept_theme", json!({})).unwrap();
    let kept = || std::fs::read_to_string(data.path().join("window-theme")).unwrap();
    assert_eq!(said(), Value::Null, "a fresh install");
    // What Sigrid's hook sends on its own, and the choice with the theme drawn.
    set(json!({ "theme": "light" })).unwrap();
    assert_eq!((kept(), said()), ("light".into(), json!("light")));
    set(json!({ "theme": "system", "resolved": "dark" })).unwrap();
    assert_eq!((kept(), said()), ("system".into(), json!("system")));
    let unknown = set(json!({ "theme": "purple" })).unwrap_err();
    assert!(unknown.contains("unknown window theme"), "{unknown}");
    assert_eq!(kept(), "system");
}

#[test]
fn the_options_start_from_the_main_window_of_the_apps_config() {
    let options = Options::for_app(&app_with(vec![main_config()])).unwrap();
    assert_eq!(options.window, main_config());
    assert_eq!(
        options.material, OPTIONAL,
        "opaque unless the person turned glass on"
    );
    assert_eq!(options.material, Material::SUITE);
    assert!(!options.background);
    assert!((options.before_reload)(None), "a reload is not refused");
    let other = WindowConfig {
        label: "other".into(),
        ..main_config()
    };
    assert!(Options::for_app(&app_with(vec![other])).is_err());
}

#[test]
fn the_commands_work_without_a_data_folder() {
    let app = app_with(vec![main_config()]);
    let options = Options {
        data_dir: None,
        material: OPTIONAL,
        ..Options::for_app(&app).unwrap()
    };
    open_main(app.handle(), options).unwrap();
    app.add_capability(remote(&[ORIGIN])).unwrap();
    for (command, arguments) in commands() {
        // What cannot be kept is refused, and says why: the page's setting is told there is no choice.
        if command != "set_material" {
            let answer = call(&app, "main", PAGE, command, arguments);
            assert!(answer.is_ok(), "{command}: {answer:?}");
        }
    }
    let kept = call(&app, "main", PAGE, "kept_theme", json!({}));
    assert_eq!(kept, Ok(Value::Null), "a theme was told and none is kept");
    let material = call(&app, "main", PAGE, "material", json!({}));
    assert_eq!(
        material,
        Ok(json!({ "glass": false, "next": false, "optional": false })),
        "with nowhere to keep it there is no choice"
    );
    let refused = call(
        &app,
        "main",
        PAGE,
        "set_material",
        json!({ "material": "glass" }),
    );
    assert!(refused.unwrap_err().contains("no data folder"));
}

#[test]
fn the_material_the_person_chose_is_kept_for_the_next_start_and_changes_nothing_now() {
    let (app, data) = app();
    app.add_capability(remote(&["http://127.0.0.1:*"])).unwrap();
    let said = || call(&app, "main", PAGE, "material", json!({})).unwrap();
    let set = |word: &str| {
        call(
            &app,
            "main",
            PAGE,
            "set_material",
            json!({ "material": word }),
        )
    };
    let kept = || std::fs::read_to_string(data.path().join("window-material")).unwrap();
    let state = |glass, next| json!({ "glass": glass, "next": next, "optional": true });
    assert_eq!(said(), state(false, false), "a fresh install is opaque");
    set("glass").unwrap();
    assert_eq!(
        (kept(), said()),
        ("glass".into(), state(false, true)),
        "the window stays as it was built; the next start differs"
    );
    set("opaque").unwrap();
    assert_eq!((kept(), said()), ("opaque".into(), state(false, false)));
    for word in ["acrylic", "Glass", ""] {
        let unknown = set(word).unwrap_err();
        assert!(unknown.contains("unknown window material"), "{unknown}");
    }
    assert_eq!(kept(), "opaque");
}

#[test]
fn a_window_built_after_the_choice_is_glass_and_takes_its_theme_as_glass() {
    let (app, _data) = app_of(OPTIONAL, &[("window-material", "glass")]);
    app.add_capability(remote(&["http://127.0.0.1:*"])).unwrap();
    assert_allowed_but_set_material(&app);
    let said = call(&app, "main", PAGE, "material", json!({})).unwrap();
    assert_eq!(
        said,
        json!({ "glass": true, "next": true, "optional": true })
    );
    // The person turns it off meanwhile: this window stays glass, the next start is opaque.
    call(
        &app,
        "main",
        PAGE,
        "set_material",
        json!({ "material": "opaque" }),
    )
    .unwrap();
    let said = call(&app, "main", PAGE, "material", json!({})).unwrap();
    assert_eq!(
        said,
        json!({ "glass": true, "next": false, "optional": true })
    );
}

#[test]
fn an_app_that_fixed_its_material_has_no_choice_for_the_person() {
    // Whatever was kept, an opaque app is opaque and an acrylic one is glass.
    for (material, glass) in [(OPAQUE, false), (Material::Acrylic, true)] {
        let (app, data) = app_of(material, &[("window-material", "glass")]);
        app.add_capability(remote(&["http://127.0.0.1:*"])).unwrap();
        let said = call(&app, "main", PAGE, "material", json!({})).unwrap();
        assert_eq!(
            said,
            json!({ "glass": glass, "next": glass, "optional": false })
        );
        let refused = call(
            &app,
            "main",
            PAGE,
            "set_material",
            json!({ "material": "opaque" }),
        )
        .unwrap_err();
        assert!(refused.contains("the app's own"), "{refused}");
        let kept = std::fs::read_to_string(data.path().join("window-material")).unwrap();
        assert_eq!(kept, "glass", "the file is not touched");
    }
}

/// Every command but `set_material` is answered.
fn assert_allowed_but_set_material(app: &App<MockRuntime>) {
    for (command, arguments) in commands() {
        if command != "set_material" {
            let answer = call(app, "main", PAGE, command, arguments);
            assert!(answer.is_ok(), "{command}: {answer:?}");
        }
    }
}

#[test]
fn another_window_has_none_of_the_commands() {
    let (app, _data) = app();
    let any = json!({
        "identifier": "any",
        "windows": ["*"],
        "permissions": ["imago-shell:default"],
    });
    app.add_capability(any.to_string()).unwrap();
    WebviewWindowBuilder::new(&app, "other", Default::default())
        .build()
        .unwrap();
    for (command, arguments) in commands() {
        let refused = call(&app, "other", LOCAL, command, arguments).unwrap_err();
        assert!(refused.contains("not imago-shell's"), "{refused}");
    }
}
