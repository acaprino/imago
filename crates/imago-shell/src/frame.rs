//! Snap Layouts on the HTML maximize button. The title bar is HTML and WebView2 covers the whole
//! client area, so Windows never asks the window what lies under the cursor. A child window that
//! never paints lies over the HTML maximize button and answers `HTMAXBUTTON`: Windows 11 offers its
//! layouts on hover, and a click maximizes or restores. It tells the page about hover and press
//! (the `caption-maximize` event, `{ hover: bool, pressed: bool }`, sent to the window the overlay
//! belongs to), so the HTML button draws them. The keyboard stays with the HTML button (Enter and
//! Space press it).
//!
//! The page reports where its maximize button is, in physical pixels of the client area, on every
//! layout change; the app's command passes it to [`SnapLayouts::set_rect`]. The page has already
//! done the arithmetic (`getBoundingClientRect` in CSS pixels times `devicePixelRatio`, which
//! includes the zoom of the page and the monitor's scale), so the command passes the four numbers
//! on as they come: no conversion on this side. An empty rectangle (the button hidden, as in a
//! look with the system frame) takes the button out of Windows' hit test.

#[cfg(windows)]
use std::sync::Arc;
use tauri::{Runtime, WebviewWindow};

/// The child window over the HTML maximize button of one window. Cheap to clone; keep it in the
/// app's state and call [`set_rect`](SnapLayouts::set_rect) from the command the page reports to.
#[derive(Clone)]
pub struct SnapLayouts {
    #[cfg(windows)]
    overlay: Arc<win::Overlay>,
}

impl SnapLayouts {
    /// The page's maximize button is at (`x`, `y`) and `width` x `height` big, in physical pixels
    /// of the client area. An empty rectangle hides the overlay. Nothing is returned: a window that
    /// is already gone has no button to place.
    pub fn set_rect(&self, x: i32, y: i32, width: i32, height: i32) {
        #[cfg(windows)]
        win::set_rect(&self.overlay, x, y, width, height);
        #[cfg(not(windows))]
        let _ = (x, y, width, height);
    }
}

/// Prepares the Snap Layouts overlay for `window`, which has no frame of its own (an HTML title
/// bar). The child window itself is made at the first non-empty rectangle. On other targets this
/// does nothing and [`SnapLayouts::set_rect`] too.
pub fn install_snap_layouts<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<SnapLayouts> {
    #[cfg(windows)]
    {
        use tauri::Emitter;
        let parent = window.hwnd()?.0 as isize;
        let target = window.clone();
        let report = move |hover, pressed| {
            let _ = target.emit_to(
                target.label(),
                "caption-maximize",
                win::Caption { hover, pressed },
            );
        };
        let runner = window.clone();
        let run_on_main = move |job: win::Job| {
            let _ = runner.run_on_main_thread(job);
        };
        Ok(SnapLayouts {
            overlay: Arc::new(win::Overlay::new(parent, report, run_on_main)),
        })
    }
    #[cfg(not(windows))]
    {
        let _ = window;
        Ok(SnapLayouts {})
    }
}

/// Where the overlay goes and how big it is, in the client area's physical pixels.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(not(windows), allow(dead_code))]
struct OverlayBounds {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

/// Whether the page reported no button.
#[cfg_attr(not(windows), allow(dead_code))]
fn is_empty_rect(width: i32, height: i32) -> bool {
    width <= 0 || height <= 0
}

/// The overlay's bounds for the button at (`x`, `y`, `width`, `height`). A restored window keeps
/// its top border for resizing, as Windows' own buttons do: the overlay starts below `resize_border`
/// pixels. A maximized window has no border to keep. It is never less than a pixel high.
#[cfg_attr(not(windows), allow(dead_code))]
fn overlay_bounds(
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    resize_border: i32,
    maximized: bool,
) -> OverlayBounds {
    let top = if maximized { y } else { y.max(resize_border) };
    OverlayBounds {
        x,
        y: top,
        width,
        height: (y + height - top).max(1),
    }
}

#[cfg(windows)]
mod win {
    use super::{is_empty_rect, overlay_bounds};
    use serde::Serialize;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Once,
    };
    use windows_sys::{
        core::w,
        Win32::{
            Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM},
            Graphics::Gdi::{GetStockObject, ValidateRect, NULL_BRUSH},
            System::LibraryLoader::GetModuleHandleW,
            UI::{
                HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi},
                Input::KeyboardAndMouse::{
                    TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT,
                },
                WindowsAndMessaging::{
                    CreateWindowExW, DefWindowProcW, GetParent, GetPropW, IsWindow, IsZoomed,
                    LoadCursorW, RegisterClassExW, RemovePropW, SendMessageW, SetCursor, SetPropW,
                    SetWindowPos, ShowWindow, HTMAXBUTTON, HWND_TOP, IDC_ARROW, SC_MAXIMIZE,
                    SC_RESTORE, SM_CYFRAME, SWP_NOACTIVATE, SWP_SHOWWINDOW, SW_HIDE, WM_DESTROY,
                    WM_ERASEBKGND, WM_NCDESTROY, WM_NCHITTEST, WM_NCLBUTTONDBLCLK,
                    WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_PAINT, WM_SETCURSOR,
                    WM_SYSCOMMAND, WNDCLASSEXW, WS_CHILD, WS_CLIPSIBLINGS, WS_VISIBLE,
                },
            },
        },
    };

    /// What the page is told on `caption-maximize`.
    #[derive(Clone, Serialize)]
    pub struct Caption {
        pub hover: bool,
        pub pressed: bool,
    }

    /// Work for the thread that owns the window.
    pub type Job = Box<dyn FnOnce() + Send>;

    const OVERLAY_CLASS: *const u16 = w!("ImagoMaximizeOverlay");
    /// On the parent: its overlay.
    const OVERLAY_PROP: *const u16 = w!("ImagoMaximizeOverlay");
    /// On the overlay: the `Arc<Overlay>` it reports through, released when it is destroyed.
    const STATE_PROP: *const u16 = w!("ImagoMaximizeState");
    static OVERLAY_CLASS_REGISTERED: Once = Once::new();

    /// One window's overlay: what the child window needs from its owner, and the hover and press
    /// it tracks.
    pub struct Overlay {
        parent: isize,
        hover: AtomicBool,
        pressed: AtomicBool,
        report: Box<dyn Fn(bool, bool) + Send + Sync>,
        run_on_main: Box<dyn Fn(Job) + Send + Sync>,
    }

    impl Overlay {
        pub fn new(
            parent: isize,
            report: impl Fn(bool, bool) + Send + Sync + 'static,
            run_on_main: impl Fn(Job) + Send + Sync + 'static,
        ) -> Self {
            Self {
                parent,
                hover: AtomicBool::new(false),
                pressed: AtomicBool::new(false),
                report: Box::new(report),
                run_on_main: Box::new(run_on_main),
            }
        }

        /// Hover and press to the page, to draw on the HTML button.
        fn report(&self) {
            (self.report)(
                self.hover.load(Ordering::Acquire),
                self.pressed.load(Ordering::Acquire),
            );
        }

        fn reset(&self) {
            self.hover.store(false, Ordering::Release);
            self.pressed.store(false, Ordering::Release);
        }
    }

    pub fn set_rect(overlay: &Arc<Overlay>, x: i32, y: i32, width: i32, height: i32) {
        let overlay_for_main = overlay.clone();
        (overlay.run_on_main)(Box::new(move || {
            // SAFETY: on the thread that owns the window, which is checked to be alive.
            unsafe { place_overlay(&overlay_for_main, x, y, width, height) };
        }));
    }

    /// # Safety
    /// Call on the thread that owns the parent window.
    unsafe fn place_overlay(owner: &Arc<Overlay>, x: i32, y: i32, width: i32, height: i32) {
        // SAFETY: every call below acts on the live parent window or on its child.
        unsafe {
            let parent = owner.parent as HWND;
            if IsWindow(parent) == 0 {
                return;
            }
            let mut overlay = GetPropW(parent, OVERLAY_PROP) as HWND;
            if is_empty_rect(width, height) {
                if !overlay.is_null() {
                    ShowWindow(overlay, SW_HIDE);
                }
                return;
            }
            if overlay.is_null() {
                let instance = GetModuleHandleW(std::ptr::null());
                OVERLAY_CLASS_REGISTERED.call_once(|| {
                    let class = WNDCLASSEXW {
                        cbSize: size_of::<WNDCLASSEXW>() as u32,
                        lpfnWndProc: Some(overlay_proc),
                        hInstance: instance,
                        hCursor: LoadCursorW(std::ptr::null_mut(), IDC_ARROW),
                        // Never painted: the HTML button shows through.
                        hbrBackground: GetStockObject(NULL_BRUSH),
                        lpszClassName: OVERLAY_CLASS,
                        ..std::mem::zeroed()
                    };
                    RegisterClassExW(&class);
                });
                // The window text is the name UI Automation reads for the hit-test area.
                overlay = CreateWindowExW(
                    0,
                    OVERLAY_CLASS,
                    w!("Maximize"),
                    WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
                    x,
                    y,
                    width,
                    height,
                    parent,
                    std::ptr::null_mut(),
                    instance,
                    std::ptr::null(),
                );
                if overlay.is_null() {
                    return;
                }
                SetPropW(parent, OVERLAY_PROP, overlay as HANDLE);
                // The overlay owns one count of the state until `WM_NCDESTROY`.
                SetPropW(overlay, STATE_PROP, Arc::into_raw(owner.clone()) as HANDLE);
            }
            let bounds = overlay_bounds(
                x,
                y,
                width,
                height,
                GetSystemMetricsForDpi(SM_CYFRAME, GetDpiForWindow(parent)),
                IsZoomed(parent) != 0,
            );
            // Above the webview and Tauri's resize border, both created before it.
            SetWindowPos(
                overlay,
                HWND_TOP,
                bounds.x,
                bounds.y,
                bounds.width,
                bounds.height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
        }
    }

    /// The state of an overlay, or `None` in the messages that come before it is attached.
    ///
    /// # Safety
    /// Call from the overlay's window procedure: the count the window holds is released only at
    /// `WM_NCDESTROY`, after which no message that calls this is sent.
    unsafe fn state<'a>(hwnd: HWND) -> Option<&'a Overlay> {
        // SAFETY: the property holds a pointer made by `Arc::into_raw` and not yet released.
        unsafe { (GetPropW(hwnd, STATE_PROP) as *const Overlay).as_ref() }
    }

    unsafe extern "system" fn overlay_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        // SAFETY: every call below acts on this live window or its parent.
        unsafe {
            match msg {
                WM_NCHITTEST => {
                    if let Some(state) = state(hwnd) {
                        if !state.hover.swap(true, Ordering::AcqRel) {
                            let mut track = TRACKMOUSEEVENT {
                                cbSize: size_of::<TRACKMOUSEEVENT>() as u32,
                                dwFlags: TME_LEAVE | TME_NONCLIENT,
                                hwndTrack: hwnd,
                                dwHoverTime: 0,
                            };
                            TrackMouseEvent(&mut track);
                            state.report();
                        }
                    }
                    HTMAXBUTTON as LRESULT
                }
                WM_NCMOUSELEAVE => {
                    if let Some(state) = state(hwnd) {
                        state.reset();
                        state.report();
                    }
                    0
                }
                WM_NCLBUTTONDOWN | WM_NCLBUTTONDBLCLK if wparam == HTMAXBUTTON as WPARAM => {
                    if let Some(state) = state(hwnd) {
                        state.pressed.store(true, Ordering::Release);
                        state.report();
                    }
                    0
                }
                WM_NCLBUTTONUP if wparam == HTMAXBUTTON as WPARAM => {
                    // Released where it was pressed: leaving the button first cancels, as in Windows.
                    if let Some(state) = state(hwnd) {
                        if state.pressed.swap(false, Ordering::AcqRel) {
                            state.report();
                            let parent = GetParent(hwnd);
                            let command = if IsZoomed(parent) != 0 {
                                SC_RESTORE
                            } else {
                                SC_MAXIMIZE
                            };
                            SendMessageW(parent, WM_SYSCOMMAND, command as WPARAM, 0);
                        }
                    }
                    0
                }
                WM_SETCURSOR => {
                    SetCursor(LoadCursorW(std::ptr::null_mut(), IDC_ARROW));
                    1
                }
                WM_ERASEBKGND => 1,
                WM_PAINT => {
                    ValidateRect(hwnd, std::ptr::null());
                    0
                }
                WM_DESTROY => {
                    let parent = GetParent(hwnd);
                    if !parent.is_null() && std::ptr::eq(GetPropW(parent, OVERLAY_PROP), hwnd) {
                        RemovePropW(parent, OVERLAY_PROP);
                    }
                    if let Some(state) = state(hwnd) {
                        state.reset();
                    }
                    0
                }
                WM_NCDESTROY => {
                    let raw = RemovePropW(hwnd, STATE_PROP) as *const Overlay;
                    if !raw.is_null() {
                        // SAFETY: the count `place_overlay` gave this window; nothing reads the property again.
                        drop(Arc::from_raw(raw));
                    }
                    DefWindowProcW(hwnd, msg, wparam, lparam)
                }
                _ => DefWindowProcW(hwnd, msg, wparam, lparam),
            }
        }
    }

    /// The overlay on a real window procedure, over a window that is never shown (no display
    /// needed): hover, press and release as Windows sends them, and what is left when the parent
    /// goes.
    #[cfg(test)]
    mod tests {
        use super::*;
        use std::sync::Mutex;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            DestroyWindow, GetWindowLongW, GWL_STYLE, WS_OVERLAPPED,
        };

        /// The `WM_SYSCOMMAND` commands the stand-in parent received.
        static COMMANDS: Mutex<Vec<usize>> = Mutex::new(Vec::new());

        unsafe extern "system" fn parent_proc(
            hwnd: HWND,
            msg: u32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT {
            if msg == WM_SYSCOMMAND {
                COMMANDS.lock().unwrap().push(wparam & 0xFFF0);
                return 0;
            }
            // SAFETY: the default procedure of this live window.
            unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
        }

        fn visible(overlay: HWND) -> bool {
            // SAFETY: the overlay is alive in this test.
            unsafe { GetWindowLongW(overlay, GWL_STYLE) as u32 & WS_VISIBLE != 0 }
        }

        #[test]
        fn the_overlay_answers_the_hit_test_tells_the_page_and_maximizes() {
            let reports = Arc::new(std::sync::Mutex::new(Vec::new()));
            // SAFETY: Win32 calls on windows this test makes and destroys on its own thread.
            unsafe {
                let instance = GetModuleHandleW(std::ptr::null());
                let class = WNDCLASSEXW {
                    cbSize: size_of::<WNDCLASSEXW>() as u32,
                    lpfnWndProc: Some(parent_proc),
                    hInstance: instance,
                    lpszClassName: w!("ImagoShellTestParent"),
                    ..std::mem::zeroed()
                };
                RegisterClassExW(&class);
                let parent = CreateWindowExW(
                    0,
                    w!("ImagoShellTestParent"),
                    w!("test"),
                    WS_OVERLAPPED,
                    0,
                    0,
                    400,
                    300,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    instance,
                    std::ptr::null(),
                );
                assert!(!parent.is_null(), "a window to stand in for the app's");

                let seen = reports.clone();
                let state = Arc::new(Overlay::new(
                    parent as isize,
                    move |hover, pressed| seen.lock().unwrap().push((hover, pressed)),
                    |job| job(),
                ));
                assert!(
                    GetPropW(parent, OVERLAY_PROP).is_null(),
                    "no child window before there is a button"
                );

                // The page reports its button: the child window is made, and shown.
                set_rect(&state, 300, 0, 46, 32);
                let overlay = GetPropW(parent, OVERLAY_PROP) as HWND;
                assert!(!overlay.is_null());
                assert!(visible(overlay));
                assert_eq!(
                    Arc::strong_count(&state),
                    2,
                    "the overlay holds one count of the state"
                );

                // The mouse reaches the button: Windows is told it is the maximize button, and the page is told once.
                assert_eq!(
                    SendMessageW(overlay, WM_NCHITTEST, 0, 0),
                    HTMAXBUTTON as LRESULT
                );
                assert_eq!(
                    SendMessageW(overlay, WM_NCHITTEST, 0, 0),
                    HTMAXBUTTON as LRESULT
                );
                assert_eq!(*reports.lock().unwrap(), [(true, false)]);

                // Pressed and released on the button: the parent is told to maximize.
                SendMessageW(overlay, WM_NCLBUTTONDOWN, HTMAXBUTTON as WPARAM, 0);
                SendMessageW(overlay, WM_NCLBUTTONUP, HTMAXBUTTON as WPARAM, 0);
                assert_eq!(*COMMANDS.lock().unwrap(), [SC_MAXIMIZE as usize]);
                assert_eq!(reports.lock().unwrap()[1..], [(true, true), (true, false)]);

                // Leaving the button first cancels the click, as in Windows.
                SendMessageW(overlay, WM_NCLBUTTONDOWN, HTMAXBUTTON as WPARAM, 0);
                SendMessageW(overlay, WM_NCMOUSELEAVE, 0, 0);
                SendMessageW(overlay, WM_NCLBUTTONUP, HTMAXBUTTON as WPARAM, 0);
                assert_eq!(COMMANDS.lock().unwrap().len(), 1, "no second maximize");
                assert_eq!(reports.lock().unwrap().last(), Some(&(false, false)));

                // The button goes (another look): out of the hit test, and back when it returns.
                set_rect(&state, 0, 0, 0, 0);
                assert!(!visible(overlay));
                set_rect(&state, 300, 0, 46, 32);
                assert!(visible(overlay));
                assert_eq!(
                    GetPropW(parent, OVERLAY_PROP) as HWND,
                    overlay,
                    "the same window again"
                );

                // The parent goes: the child window with it, and the state is released.
                DestroyWindow(parent);
                assert_eq!(
                    Arc::strong_count(&state),
                    1,
                    "the overlay released its count"
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_overlay_can_be_kept_in_tauri_state() {
        // `App::manage` takes only what is `Send + Sync + 'static`; the app keeps one per window.
        fn kept_in_state<T: Send + Sync + Clone + 'static>() {}
        kept_in_state::<SnapLayouts>();
    }

    #[test]
    fn a_restored_window_keeps_its_top_border_for_resizing() {
        // The button at y = 0, 46 high, in a window whose resize border is 8 pixels.
        let bounds = overlay_bounds(1200, 0, 46, 32, 8, false);
        assert_eq!(
            bounds,
            OverlayBounds {
                x: 1200,
                y: 8,
                width: 46,
                height: 32 - 8
            }
        );
    }

    #[test]
    fn a_maximized_window_has_no_border_to_keep() {
        let bounds = overlay_bounds(1200, 0, 46, 32, 8, true);
        assert_eq!(
            bounds,
            OverlayBounds {
                x: 1200,
                y: 0,
                width: 46,
                height: 32
            }
        );
    }

    #[test]
    fn a_button_lower_than_the_border_is_not_moved() {
        let bounds = overlay_bounds(1200, 12, 46, 32, 8, false);
        assert_eq!(
            bounds,
            OverlayBounds {
                x: 1200,
                y: 12,
                width: 46,
                height: 32
            }
        );
    }

    #[test]
    fn the_overlay_is_never_less_than_a_pixel_high() {
        let bounds = overlay_bounds(1200, 0, 46, 4, 8, false);
        assert_eq!((bounds.y, bounds.height), (8, 1));
    }

    #[test]
    fn an_empty_rectangle_takes_the_button_out_of_the_hit_test() {
        assert!(is_empty_rect(0, 32));
        assert!(is_empty_rect(46, 0));
        assert!(is_empty_rect(-1, -1));
        assert!(!is_empty_rect(46, 32));
    }
}
