//! A native message, for when the page cannot say it: there is none yet, or it is gone, hung or does
//! not load. On other targets nothing is shown and every question is answered with no.
use tauri::{Runtime, WebviewWindow};

/// Asks `text` over `window`; true when the person says yes. It blocks until the answer: call it
/// off the window's thread.
pub(crate) fn ask<R: Runtime>(window: &WebviewWindow<R>, title: &str, text: &str) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{IDYES, MB_ICONWARNING, MB_YESNO};
        let owner = window.hwnd().map_or(std::ptr::null_mut(), |hwnd| hwnd.0);
        win::show(owner, title, text, MB_YESNO | MB_ICONWARNING) == IDYES
    }
    #[cfg(not(windows))]
    {
        let _ = (window, title, text);
        false
    }
}

/// Says `text`, with no window to own the message, and blocks until it is closed. It needs neither a
/// window nor a running app: it is how an app says why it does not start, or why it ends.
pub fn tell(title: &str, text: &str) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::MB_ICONERROR;
        win::show(std::ptr::null_mut(), title, text, MB_ICONERROR);
    }
    #[cfg(not(windows))]
    let _ = (title, text);
}

#[cfg(windows)]
mod win {
    use windows_sys::Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::{
            MessageBoxW, MB_SETFOREGROUND, MESSAGEBOX_RESULT, MESSAGEBOX_STYLE,
        },
    };

    pub fn show(
        owner: HWND,
        title: &str,
        text: &str,
        style: MESSAGEBOX_STYLE,
    ) -> MESSAGEBOX_RESULT {
        let wide = |text: &str| -> Vec<u16> { text.encode_utf16().chain(Some(0)).collect() };
        let (title, text) = (wide(title), wide(text));
        // SAFETY: both texts end with a zero and live through the call; an owner that is gone or
        // null makes the message one without an owner, or the call fail.
        unsafe {
            MessageBoxW(
                owner,
                text.as_ptr(),
                title.as_ptr(),
                style | MB_SETFOREGROUND,
            )
        }
    }
}
