//! A webview shows only the app's own pages, so a window behaves as a Windows application rather
//! than a web page: any other navigation is refused, and no page opens a browser window of its own
//! (Ctrl+click, middle click, `window.open`), and the browser's own keys do nothing
//! ([`disable_browser_accelerators`]), and the engine's context menu holds the editing commands
//! only ([`trim_context_menu`]).
use tauri::{
    webview::NewWindowResponse, Manager, Runtime, Url, WebviewWindow, WebviewWindowBuilder,
};

/// Registers the navigation policy on a window builder. The app's embedded frontend and the
/// origins in `app_origins` (typically the dev server in development builds) are allowed.
/// Every other navigation and every request for a new window is refused.
///
/// On Windows and Android this accepts both HTTP and HTTPS forms of Tauri's protocol.
/// Use [`guard_navigation_with_scheme`] to limit a window to its configured protocol.
pub fn guard_navigation<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    app_origins: &[&str],
) -> WebviewWindowBuilder<'a, R, M> {
    with_origins(builder, app_origins, None)
}

/// Configures Tauri's protocol and limits navigation to that exact origin and `app_origins`.
/// Pass the window configuration's `use_https_scheme` when building from a config.
pub fn guard_navigation_with_scheme<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    app_origins: &[&str],
    use_https_scheme: bool,
) -> WebviewWindowBuilder<'a, R, M> {
    with_origins(
        builder.use_https_scheme(use_https_scheme),
        app_origins,
        Some(use_https_scheme),
    )
}

fn embedded_origins(http_mapped: bool, use_https: Option<bool>) -> &'static [&'static str] {
    match (http_mapped, use_https) {
        (false, _) => &["tauri://localhost"],
        (true, Some(false)) => &["http://tauri.localhost"],
        (true, Some(true)) => &["https://tauri.localhost"],
        (true, None) => &["http://tauri.localhost", "https://tauri.localhost"],
    }
}

fn with_origins<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    app_origins: &[&str],
    use_https: Option<bool>,
) -> WebviewWindowBuilder<'a, R, M> {
    let embedded = embedded_origins(cfg!(any(windows, target_os = "android")), use_https);
    let origins: Vec<Url> = embedded
        .iter()
        .chain(app_origins)
        .filter_map(|origin| parse_origin(origin))
        .collect();
    builder
        .on_navigation(move |url| is_allowed(url, &origins))
        .on_new_window(|_, _| NewWindowResponse::Deny)
}

/// Turns WebView2's browser accelerators off: F5, Ctrl+R, Ctrl+P, Ctrl+F, F12, Alt+Left and the
/// rest of what makes a window feel like a web page. Editing keys (copy, cut, paste...) and every
/// key the page handles keep working. WebView2's default is on.
///
/// The app decides when: Shinatama calls it in release builds only (`!tauri::is_dev()`), because a
/// development build keeps reload and DevTools. Call it on each window right after it is built, a
/// rebuilt window included. The page's own `guardDesktop` covers the keys the engine leaves to it.
///
/// The `Ok` of a window that exists means the change was handed to the thread that owns the
/// webview, where COM can still fail; nothing reports that. On other targets this does nothing.
pub fn disable_browser_accelerators<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        window.with_webview(|webview| {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
            use windows_core::Interface;
            // SAFETY: run by Tauri on the thread that owns the webview, on live COM objects.
            unsafe {
                let Ok(core) = webview.controller().CoreWebView2() else {
                    return;
                };
                let Ok(settings) = core.Settings() else {
                    return;
                };
                // WebView2's default is TRUE. Copy, cut, paste and the other editing keys stay.
                if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
                    let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
                }
            }
        })
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}

/// Trims WebView2's context menu to the editing commands, as in a desktop application: in a field
/// emoji, undo, redo, cut, copy, paste, paste as plain text and select all, on selected text copy.
/// Back, forward, reload, save, print, share, web capture and inspect go, a separator stays only
/// between two entries that stay, and a menu left with nothing (a right click on the page itself)
/// is not shown at all. WebView2's default is the browser's whole menu.
///
/// This decides what the menu holds when WebView2 opens it, on its `ContextMenuRequested` event.
/// Where it opens at all is the page's own `guardDesktop`, which refuses it outside fields, the
/// places that run their own menus and selected text. The app decides when, as for
/// [`disable_browser_accelerators`]: the demo trims it in release builds only, so a development
/// build keeps Inspect. Call it on each window right after it is built, a rebuilt window included.
///
/// The `Ok` of a window that exists means the handler was handed to the thread that owns the
/// webview, where COM can still fail; nothing reports that. On other targets this does nothing.
pub fn trim_context_menu<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        win::install(window)
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(())
    }
}

/// The entries of the context menu that stay: editing, in a field or on selected text. These are
/// WebView2's names of them, Xiox's list.
#[cfg_attr(not(windows), allow(dead_code))]
const EDITING: [&str; 8] = [
    "undo",
    "redo",
    "cut",
    "copy",
    "paste",
    "pasteAndMatchStyle",
    "selectAll",
    "emoji",
];

/// Which entries of a context menu stay: `items` are `(name, is_separator)` in menu order. A
/// separator stays only between two kept entries, never doubled, first or last.
#[cfg_attr(not(windows), allow(dead_code))]
fn menu_keep(items: &[(String, bool)]) -> Vec<bool> {
    let mut keep: Vec<bool> = items
        .iter()
        .map(|(name, separator)| !separator && EDITING.contains(&name.as_str()))
        .collect();
    let mut last_kept_entry = false;
    let mut pending: Option<usize> = None;
    for (i, (_, separator)) in items.iter().enumerate() {
        if *separator {
            if last_kept_entry && pending.is_none() {
                pending = Some(i);
            }
        } else if keep[i] {
            if let Some(at) = pending.take() {
                keep[at] = true;
            }
            last_kept_entry = true;
        }
    }
    keep
}

/// An origin as a URL, or `None` when the text is not a URL with a host.
fn parse_origin(text: &str) -> Option<Url> {
    Url::parse(text).ok().filter(|url| url.has_host())
}

/// Whether the webview may go to `url`: the embedded frontend, or one of `origins`.
fn is_allowed(url: &Url, origins: &[Url]) -> bool {
    origins.iter().any(|origin| {
        origin.scheme() == url.scheme()
            && origin.host_str() == url.host_str()
            && origin.port_or_known_default() == url.port_or_known_default()
    })
}

#[cfg(windows)]
mod win {
    use super::menu_keep;
    use tauri::{Runtime, WebviewWindow};
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2ContextMenuRequestedEventArgs, ICoreWebView2_11,
        COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR,
    };
    use webview2_com::{take_pwstr, ContextMenuRequestedEventHandler};
    use windows_core::{Interface, PWSTR};

    /// Registers [`trim_menu`] on the window's webview, for every menu it opens.
    pub fn install<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
        window.with_webview(|webview| {
            // SAFETY: run by Tauri on the thread that owns the webview, on live COM objects.
            unsafe {
                let Ok(core) = webview.controller().CoreWebView2() else {
                    return;
                };
                // A runtime too old for `ContextMenuRequested` keeps its whole menu.
                let Ok(core) = core.cast::<ICoreWebView2_11>() else {
                    return;
                };
                let handler = ContextMenuRequestedEventHandler::create(Box::new(|_, args| {
                    let Some(args) = args else { return Ok(()) };
                    trim_menu(&args)
                }));
                let mut token = 0i64;
                let _ = core.add_ContextMenuRequested(&handler, &mut token);
            }
        })
    }

    /// Removes from the menu what [`menu_keep`] does not keep; with nothing left, no menu is shown.
    ///
    /// # Safety
    /// Call from WebView2's `ContextMenuRequested` handler, with the arguments it was given.
    unsafe fn trim_menu(
        args: &ICoreWebView2ContextMenuRequestedEventArgs,
    ) -> windows_core::Result<()> {
        // SAFETY: COM calls on the live arguments of the event, on the thread that raised it.
        unsafe {
            let items = args.MenuItems()?;
            let mut count = 0u32;
            items.Count(&mut count)?;
            let mut entries = Vec::with_capacity(count as usize);
            for index in 0..count {
                let item = items.GetValueAtIndex(index)?;
                let mut name = PWSTR::null();
                item.Name(&mut name)?;
                let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND::default();
                item.Kind(&mut kind)?;
                let separator = kind == COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR;
                entries.push((take_pwstr(name), separator));
            }
            let keep = menu_keep(&entries);
            // From the last entry back, so the indices still to visit do not move.
            for index in (0..count).rev() {
                if !keep[index as usize] {
                    items.RemoveValueAtIndex(index)?;
                }
            }
            if !keep.contains(&true) {
                args.SetHandled(true)?;
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::Url;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn only_the_configured_embedded_origin_is_allowed() {
        let urls = [
            "http://tauri.localhost/index.html#session",
            "https://tauri.localhost/index.html?x=1",
            "tauri://localhost/index.html?x=1#session",
        ];
        for (http_mapped, https, allowed) in [
            (true, false, 0),
            (true, true, 1),
            (false, false, 2),
            (false, true, 2),
        ] {
            let origins: Vec<_> = embedded_origins(http_mapped, Some(https))
                .iter()
                .map(|origin| url(origin))
                .collect();
            for (i, candidate) in urls.iter().enumerate() {
                assert_eq!(is_allowed(&url(candidate), &origins), i == allowed);
            }
            for other in [
                "tauri://localhost:8080/",
                "tauri://localhost.example.com/",
                "tauri://localhost@evil.test/",
                "other://localhost/",
                "http://tauri.localhost.example.com/",
                "http://evil.tauri.localhost/",
                "http://tauri.localhost:8080/",
                "https://tauri.localhost:444/",
                "https://example.com/",
                "http://localhost/",
                "file:///C:/Windows/win.ini",
                "about:blank",
                "javascript:alert(1)",
            ] {
                assert!(!is_allowed(&url(other), &origins), "{other}");
            }
        }
    }

    #[test]
    fn an_origin_the_app_names_is_compared_whole() {
        let dev = [parse_origin("http://localhost:1420").unwrap()];
        assert!(is_allowed(&url("http://localhost:1420/"), &dev));
        assert!(is_allowed(&url("http://localhost:1420/src/main.ts"), &dev));
        assert!(
            !is_allowed(&url("http://localhost:1421/"), &dev),
            "another port"
        );
        assert!(
            !is_allowed(&url("http://localhost/"), &dev),
            "no port is port 80"
        );
        assert!(
            !is_allowed(&url("https://localhost:1420/"), &dev),
            "another scheme"
        );
        assert!(
            !is_allowed(&url("http://localhost:14200/"), &dev),
            "never by prefix"
        );
        assert!(
            !is_allowed(&url("http://localhost.evil.test:1420/"), &dev),
            "another host"
        );
    }

    #[test]
    fn a_default_port_written_out_is_the_same_origin() {
        let origins = [parse_origin("https://app.example:443").unwrap()];
        assert!(is_allowed(&url("https://app.example/"), &origins));
        assert!(is_allowed(&url("https://APP.example:443/x"), &origins));
    }

    #[test]
    fn an_origin_that_is_not_a_url_allows_nothing() {
        assert!(parse_origin("localhost:1420 and more").is_none());
        assert!(parse_origin("").is_none());
        assert!(parse_origin("not a url").is_none());
    }

    // ---- the context menu ------------------------------------------------------------------

    /// A menu as WebView2 gives it, by the names of its entries: `-` is a separator.
    fn menu(items: &[&str]) -> Vec<(String, bool)> {
        items
            .iter()
            .map(|name| (name.to_string(), *name == "-"))
            .collect()
    }

    /// The entries of `items` that stay, in menu order.
    fn kept(items: &[&str]) -> Vec<String> {
        let entries = menu(items);
        let keep = menu_keep(&entries);
        entries
            .into_iter()
            .zip(keep)
            .filter(|(_, stays)| *stays)
            .map(|((name, _), _)| name)
            .collect()
    }

    #[test]
    fn the_context_menu_keeps_editing_only() {
        // A right click on the page itself: nothing is left, so no menu.
        let page = [
            "back",
            "forward",
            "reload",
            "-",
            "saveAs",
            "print",
            "share",
            "-",
            "inspectElement",
        ];
        assert!(kept(&page).is_empty());
        // In a field: the editing commands, with the separators between them.
        let field = [
            "emoji",
            "-",
            "undo",
            "redo",
            "-",
            "cut",
            "copy",
            "paste",
            "-",
            "selectAll",
            "-",
            "inspectElement",
        ];
        let editing = [
            "emoji",
            "-",
            "undo",
            "redo",
            "-",
            "cut",
            "copy",
            "paste",
            "-",
            "selectAll",
        ];
        assert_eq!(kept(&field), editing);
        // On selected text: copy, without a leading, doubled or trailing separator.
        let selection = [
            "-",
            "copy",
            "copyLinkToHighlight",
            "-",
            "-",
            "webCapture",
            "print",
            "-",
        ];
        assert_eq!(kept(&selection), ["copy"]);
    }
}
