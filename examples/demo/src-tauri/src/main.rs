//! The demo: the page of Imago in a real window, opened and watched by the `imago-shell` crate. What an app of the
//! suite writes around its own program is this file.
#![cfg_attr(windows, windows_subsystem = "windows")]

use imago_shell::{
    on_run_event, open_main, plugin, show_main,
    single_instance::{launch, Launch},
    Options,
};
use std::path::PathBuf;
use tauri::App;

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // The material is the suite's: opaque, in the grounds of the look, unless the person turned glass on in the settings.
    let mut options = Options::for_app(app)?;
    // A clean folder for what the window keeps, which the capture runs on.
    if let Some(home) = std::env::var_os("IMAGO_DEMO_HOME") {
        options.data_dir = Some(PathBuf::from(home));
    }
    let launched = options.data_dir.as_deref().map(|dir| launch(dir, false));
    match launched {
        Some(Ok(Launch::First(instance))) => {
            let app = app.handle().clone();
            instance.on_raise(move || show_main(&app));
        }
        Some(Ok(Launch::Running | Launch::Closing)) => std::process::exit(0),
        Some(Err(error)) => eprintln!("imago-demo: single instance: {error}"),
        None => {}
    }
    open_main(app.handle(), options)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(plugin())
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("the Imago demo failed to start")
        // Without it a window that is built again, after its browser process was lost, ends the app.
        .run(on_run_event);
}
