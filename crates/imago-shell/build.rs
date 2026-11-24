//! Declares the permissions of the plugin's commands (`permissions/default.json`) to the apps that
//! depend on the crate.

fn main() {
    tauri_plugin::Builder::new(&[]).build();
    // The tests in `tests/` start a mock application, which links the dialogs of comctl32 6; an
    // app gets this manifest from tauri-build, a test program has none of its own.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
    }
}
