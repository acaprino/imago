//! A webview shows only the app's own pages, so a window behaves as a Windows application rather
//! than a web page: any other navigation is refused, and no page opens a browser window of its own
//! (Ctrl+click, middle click, `window.open`).
use tauri::{webview::NewWindowResponse, Manager, Runtime, Url, WebviewWindowBuilder};

/// The embedded frontend's host: `http://tauri.localhost`, or `https://tauri.localhost` with
/// `useHttpsScheme`.
const EMBEDDED_HOST: &str = "tauri.localhost";

/// Registers the navigation policy on a window builder: the app's embedded frontend and the
/// origins in `app_origins` (the dev server's, in a development build only, as `http://localhost:1420`)
/// are allowed, every other navigation is refused, and every request for a new window is denied.
///
/// Origins are compared whole (scheme, host and port), never by prefix. An entry that is not a URL
/// allows nothing: a mistake refuses a page, it never lets one in.
pub fn guard_navigation<'a, R: Runtime, M: Manager<R>>(
    builder: WebviewWindowBuilder<'a, R, M>,
    app_origins: &[&str],
) -> WebviewWindowBuilder<'a, R, M> {
    let origins: Vec<Url> = app_origins
        .iter()
        .filter_map(|origin| parse_origin(origin))
        .collect();
    builder
        .on_navigation(move |url| is_allowed(url, &origins))
        .on_new_window(|_, _| NewWindowResponse::Deny)
}

/// An origin as a URL, or `None` when the text is not a URL with a host.
fn parse_origin(text: &str) -> Option<Url> {
    Url::parse(text).ok().filter(|url| url.has_host())
}

/// Whether the webview may go to `url`: the embedded frontend, or one of `origins`.
fn is_allowed(url: &Url, origins: &[Url]) -> bool {
    let own = matches!(url.scheme(), "http" | "https")
        && url.host_str() == Some(EMBEDDED_HOST)
        && url.port().is_none();
    own || origins.iter().any(|origin| {
        origin.scheme() == url.scheme()
            && origin.host_str() == url.host_str()
            && origin.port_or_known_default() == url.port_or_known_default()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::Url;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn the_embedded_frontend_is_always_the_apps_own() {
        for own in [
            "http://tauri.localhost/",
            "https://tauri.localhost/index.html?x=1#y",
        ] {
            assert!(is_allowed(&url(own), &[]), "{own}");
        }
    }

    #[test]
    fn another_host_is_never_the_apps_own() {
        for other in [
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
            assert!(!is_allowed(&url(other), &[]), "{other}");
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
}
