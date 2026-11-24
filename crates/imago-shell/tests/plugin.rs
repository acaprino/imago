//! The plugin on Tauri's mock runtime: which page may call its commands, by the capability the app
//! gives it, and what the commands do. The calls go through the same gate as a real page's (Tauri's
//! access control list), made from the crate's own permission file. A real window is not here.
use imago_shell::{open_main, plugin, Material, Options};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    test::{
        get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY,
    },
    utils::{
        acl::manifest::{Manifest, PermissionFile},
        config::{Color, WindowConfig},
    },
    webview::InvokeRequest,
    App, Manager, WebviewWindowBuilder,
};

/// The page's address, and what the engine says it is in a call (the origin alone).
const PAGE: &str = "http://127.0.0.1:50123/app/?token=x";
const ORIGIN: &str = "http://127.0.0.1:50123";
const LOCAL: &str = "http://tauri.localhost";

/// Every command, with arguments it takes.
fn commands() -> [(&'static str, Value); 4] {
    [
        ("set_theme", json!({ "theme": "dark", "resolved": "dark" })),
        (
            "caption",
            json!({ "x": 1, "y": 0, "width": 46, "height": 32 }),
        ),
        ("ready", json!({})),
        ("chrome", json!({ "title": "Imago", "progress": 40 })),
    ]
}

/// An app with the plugin, its main window opened, and no capability yet; with its data folder.
fn app() -> (App<MockRuntime>, tempfile::TempDir) {
    let file: PermissionFile =
        serde_json::from_str(include_str!("../permissions/default.json")).unwrap();
    let acl = BTreeMap::from([("imago-shell".to_owned(), Manifest::new(vec![file], None))]);
    let mut context = mock_context(noop_assets());
    *context.runtime_authority_mut() = tauri::runtime_authority!(acl, Default::default());
    context.config_mut().app.windows.push(WindowConfig {
        create: false,
        ..Default::default()
    });
    let app = mock_builder().plugin(plugin()).build(context).unwrap();
    let data = tempfile::tempdir().unwrap();
    open_main(
        app.handle(),
        Options {
            data_dir: Some(data.path().to_owned()),
            material: Material::Opaque {
                dark: Color(18, 22, 30, 255),
                light: Color(246, 247, 249, 255),
            },
            ..Options::for_app(&app).unwrap()
        },
    )
    .unwrap();
    (app, data)
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

/// The page at `url` in the window `label` calls `command`.
fn call(
    app: &App<MockRuntime>,
    label: &str,
    url: &str,
    command: &str,
    arguments: Value,
) -> Result<(), String> {
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
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn assert_allowed(app: &App<MockRuntime>, url: &str) {
    for (command, arguments) in commands() {
        assert_eq!(
            call(app, "main", url, command, arguments),
            Ok(()),
            "{command} from {url}"
        );
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
    let kept = || std::fs::read_to_string(data.path().join("window-theme")).unwrap();
    // What Sigrid's hook sends on its own, and the choice with the theme drawn.
    set(json!({ "theme": "light" })).unwrap();
    assert_eq!(kept(), "light");
    set(json!({ "theme": "system", "resolved": "dark" })).unwrap();
    assert_eq!(kept(), "system");
    let unknown = set(json!({ "theme": "purple" })).unwrap_err();
    assert!(unknown.contains("unknown window theme"), "{unknown}");
    assert_eq!(kept(), "system");
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
