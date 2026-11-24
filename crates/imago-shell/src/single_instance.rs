//! One running copy of the app for each data folder. The first copy to start creates a named signal
//! and waits on it; a copy started later finds the signal, raises it and ends, so the second launch
//! shows the window of the one that runs.
//!
//! The name comes from the data folder, so a portable copy and a development build, which use other
//! folders, stay independent. The signal is an event of the user's own session: it goes with the
//! last process that holds it, so a copy that crashed leaves nothing behind.
//!
//! A copy that is quitting may have work to end first and answers no one, so it marks itself
//! ([`Quitting`]); a copy that starts meanwhile waits for it to end and takes its place, rather
//! than raising a signal nobody answers.
//!
//! On other targets every copy is the first.
use std::{io, path::Path, time::Duration};

/// How long a copy started while another quits waits for it to end.
const QUIT_WAIT: Duration = Duration::from_secs(5);

/// What a copy that starts finds.
pub enum Launch {
    /// No other copy runs on this data folder, or the one that did has ended.
    First(Instance),
    /// One runs. It was asked to show its window, unless this launch is a background one.
    Running,
    /// One was quitting and was still there when the wait ran out.
    Closing,
}

/// That this copy is the first one. The others raise it until it is dropped.
pub struct Instance {
    #[cfg(windows)]
    raised: win::Event,
}

impl Instance {
    /// Calls `show` each time a later copy asks for the window, on a thread of its own, for the
    /// life of the process. A copy that asked before this call is not lost.
    pub fn on_raise(self, show: impl Fn() + Send + 'static) {
        std::thread::spawn(move || {
            #[cfg(windows)]
            while self.raised.wait() {
                show();
            }
            #[cfg(not(windows))]
            let _ = (self, show);
        });
    }
}

/// The mark that the copy of a data folder is quitting, for as long as this value lives.
pub struct Quitting {
    #[cfg(windows)]
    _mark: win::Event,
}

impl Quitting {
    pub fn mark(data_dir: &Path) -> io::Result<Self> {
        #[cfg(windows)]
        {
            let (mark, _) = win::Event::create(&quit_name(data_dir))?;
            Ok(Self { _mark: mark })
        }
        #[cfg(not(windows))]
        {
            let _ = data_dir;
            Ok(Self {})
        }
    }
}

/// Decides what a copy that starts does: call it before anything touches `data_dir`, and end when
/// the answer is not [`Launch::First`]. A `background` launch (started with Windows) asks the copy
/// that runs for no window. With an error there is no signal, and the app runs without it.
pub fn launch(data_dir: &Path, background: bool) -> io::Result<Launch> {
    launch_within(data_dir, background, QUIT_WAIT)
}

#[cfg(windows)]
fn launch_within(data_dir: &Path, background: bool, wait: Duration) -> io::Result<Launch> {
    /// How often a launch that waits looks again.
    const STEP: Duration = Duration::from_millis(100);
    let deadline = std::time::Instant::now() + wait;
    loop {
        let (raised, first) = win::Event::create(&show_name(data_dir))?;
        if first {
            return Ok(Launch::First(Instance { raised }));
        }
        if !win::Event::exists(&quit_name(data_dir)) {
            if !background {
                raised.raise();
            }
            return Ok(Launch::Running);
        }
        // Held while it waits, the event would never go.
        drop(raised);
        let left = deadline.saturating_duration_since(std::time::Instant::now());
        if left.is_zero() {
            return Ok(Launch::Closing);
        }
        std::thread::sleep(STEP.min(left));
    }
}

#[cfg(not(windows))]
fn launch_within(_data_dir: &Path, _background: bool, _wait: Duration) -> io::Result<Launch> {
    Ok(Launch::First(Instance {}))
}

#[cfg_attr(not(windows), allow(dead_code))]
fn show_name(data_dir: &Path) -> String {
    format!(r"Local\ImagoShow-{}", digest(data_dir))
}

#[cfg_attr(not(windows), allow(dead_code))]
fn quit_name(data_dir: &Path) -> String {
    format!(r"Local\ImagoQuit-{}", digest(data_dir))
}

/// The folder as a word a name can hold: a hash, so no path brings a character Windows refuses (a
/// backslash would name another namespace). FNV-1a, written out here because two copies may be
/// different builds and `std`'s hashers promise nothing across releases.
#[cfg_attr(not(windows), allow(dead_code))]
fn digest(data_dir: &Path) -> String {
    // Without touching the disk, where the folder may not be yet. Windows paths do not tell
    // capitals apart, and `\\?\` is the same path spelled for long names.
    let absolute = std::path::absolute(data_dir).unwrap_or_else(|_| data_dir.to_path_buf());
    let spelled = absolute.to_string_lossy().to_lowercase();
    let spelled = spelled.strip_prefix(r"\\?\").unwrap_or(&spelled);
    let hash = spelled
        .trim_end_matches(['\\', '/'])
        .bytes()
        .fold(0xcbf2_9ce4_8422_2325_u64, |hash, byte| {
            (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
        });
    format!("{hash:016x}")
}

#[cfg(windows)]
mod win {
    use std::{io, ptr::null};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, WAIT_OBJECT_0},
        System::Threading::{
            CreateEventW, OpenEventW, SetEvent, WaitForSingleObject, EVENT_MODIFY_STATE, INFINITE,
        },
    };

    /// A named event; the handle is kept as an integer, only ever passed back to Windows.
    pub struct Event(isize);

    impl Event {
        /// The event called `name`, and whether this call made it. Auto-reset: a raise is kept
        /// until somebody waits, so one that comes early is not lost.
        pub fn create(name: &str) -> io::Result<(Self, bool)> {
            let name = wide(name);
            // SAFETY: the name ends with a zero and lives through the call.
            let handle = unsafe { CreateEventW(null(), 0, 0, name.as_ptr()) };
            // Read at once: the next call may change it.
            let error = io::Error::last_os_error();
            if handle.is_null() {
                return Err(error);
            }
            let first = error.raw_os_error() != Some(ERROR_ALREADY_EXISTS as i32);
            Ok((Self(handle as isize), first))
        }

        pub fn exists(name: &str) -> bool {
            let name = wide(name);
            // SAFETY: as above; the handle is closed once, by the drop.
            let handle = unsafe { OpenEventW(EVENT_MODIFY_STATE, 0, name.as_ptr()) };
            !handle.is_null() && {
                drop(Self(handle as isize));
                true
            }
        }

        pub fn raise(&self) {
            // SAFETY: the handle is open until the drop.
            unsafe { SetEvent(self.0 as _) };
        }

        /// Blocks until the event is raised; false when it cannot wait.
        pub fn wait(&self) -> bool {
            // SAFETY: the handle is open until the drop.
            unsafe { WaitForSingleObject(self.0 as _, INFINITE) == WAIT_OBJECT_0 }
        }
    }

    impl Drop for Event {
        fn drop(&mut self) {
            // SAFETY: the handle this value owns, closed once.
            unsafe { CloseHandle(self.0 as _) };
        }
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{sync::mpsc::channel, thread};

    const SHORT: Duration = Duration::from_millis(300);
    const LONG: Duration = Duration::from_secs(10);

    #[test]
    fn one_folder_has_one_name_however_it_is_spelled() {
        let name = show_name(Path::new(r"C:\Data\Imago"));
        for same in [
            r"c:\data\imago",
            r"C:\Data\Imago\",
            "C:/Data/Imago",
            r"C:\Data\Other\..\Imago",
            r"\\?\C:\Data\Imago",
        ] {
            assert_eq!(show_name(Path::new(same)), name, "{same}");
        }
        assert_ne!(show_name(Path::new(r"C:\Data\Imago2")), name);
        assert_ne!(quit_name(Path::new(r"C:\Data\Imago")), name);
        assert_eq!(
            name.matches('\\').count(),
            1,
            "only the namespace has a backslash: {name}"
        );
    }

    #[test]
    fn a_second_copy_raises_the_first_and_a_background_one_does_not() {
        let data = tempfile::tempdir().unwrap();
        let Launch::First(first) = launch(data.path(), false).unwrap() else {
            panic!("no copy runs yet");
        };
        let Launch::Running = launch(data.path(), true).unwrap() else {
            panic!("the first copy runs");
        };
        // Asked before the first copy waits: kept for it.
        let Launch::Running = launch(data.path(), false).unwrap() else {
            panic!("the first copy runs");
        };
        let (shown, seen) = channel();
        first.on_raise(move || shown.send(()).unwrap());
        seen.recv_timeout(LONG).expect("the second copy asked");
        assert!(
            seen.recv_timeout(SHORT).is_err(),
            "the background copy asked for nothing"
        );
        let Launch::Running = launch(data.path(), false).unwrap() else {
            panic!("the first copy runs");
        };
        seen.recv_timeout(LONG).expect("asked again");
    }

    #[test]
    fn copies_of_two_folders_are_independent() {
        let (one, two) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let _one = launch(one.path(), false).unwrap();
        assert!(matches!(
            launch(two.path(), false).unwrap(),
            Launch::First(_)
        ));
    }

    #[test]
    fn the_place_of_a_copy_that_ended_is_free() {
        let data = tempfile::tempdir().unwrap();
        let first = launch(data.path(), false).unwrap();
        assert!(matches!(
            launch(data.path(), false).unwrap(),
            Launch::Running
        ));
        drop(first);
        assert!(matches!(
            launch(data.path(), false).unwrap(),
            Launch::First(_)
        ));
    }

    #[test]
    fn a_copy_that_quits_is_waited_for_and_not_raised() {
        let data = tempfile::tempdir().unwrap();
        let first = launch(data.path(), false).unwrap();
        let quitting = Quitting::mark(data.path()).unwrap();
        assert!(matches!(
            launch_within(data.path(), false, SHORT).unwrap(),
            Launch::Closing
        ));
        let ending = thread::spawn(move || {
            thread::sleep(SHORT);
            drop(first);
            drop(quitting);
        });
        assert!(matches!(
            launch_within(data.path(), false, LONG).unwrap(),
            Launch::First(_)
        ));
        ending.join().unwrap();
    }
}
