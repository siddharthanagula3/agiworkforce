use std::future::Future;
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};
use std::thread;
use std::time::{Duration, Instant};

use agiworkforce_desktop_gpui::runtime::shutdown_sessions;

struct WakeThread(thread::Thread);

impl Wake for WakeThread {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }
}

#[test]
fn shutdown_owns_its_executor_after_the_registration_owner_is_dropped() {
    let executor = Arc::new(tokio::runtime::Runtime::new().unwrap());
    let lifetime = Arc::downgrade(&executor);
    let sessions = [
        Arc::new(tokio::sync::Mutex::new(None)),
        Arc::new(tokio::sync::Mutex::new(None)),
    ];
    let mut shutdown = Box::pin(shutdown_sessions(executor.clone(), sessions));
    drop(executor);
    assert!(lifetime.upgrade().is_some());
    let waker = Waker::from(Arc::new(WakeThread(thread::current())));
    let mut context = Context::from_waker(&waker);
    let started = Instant::now();
    loop {
        match shutdown.as_mut().poll(&mut context) {
            Poll::Ready(result) => {
                result.unwrap();
                break;
            }
            Poll::Pending => {
                assert!(
                    started.elapsed() < Duration::from_secs(5),
                    "Runtime cleanup timed out"
                );
                thread::park_timeout(Duration::from_millis(10));
            }
        }
    }
    assert!(lifetime.upgrade().is_none());
}
