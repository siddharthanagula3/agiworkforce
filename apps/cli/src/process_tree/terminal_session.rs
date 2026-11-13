use nix::{
    errno::Errno,
    sys::signal::{kill, Signal},
    unistd::{getsid, Pid},
};
use std::{io, time::Duration};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

fn members(session: u32) -> io::Result<Vec<u32>> {
    let id = i32::try_from(session)
        .map_err(|_| io::Error::other("Invalid terminal session identity"))?;
    if id <= 0 || getsid(None).is_ok_and(|own| own.as_raw() == id) {
        return Err(io::Error::other(
            "The terminal session cannot name the host session",
        ));
    }
    let mut system = System::new();
    system.refresh_processes_specifics(ProcessesToUpdate::All, ProcessRefreshKind::new());
    if !system
        .processes()
        .contains_key(&sysinfo::Pid::from_u32(std::process::id()))
    {
        return Err(io::Error::other(
            "Process enumeration did not include the host; terminal cleanup cannot be verified",
        ));
    }
    let own = system
        .process(sysinfo::Pid::from_u32(std::process::id()))
        .and_then(|process| process.session_id());
    let expected = getsid(None).map_err(|error| io::Error::from_raw_os_error(error as i32))?;
    if own.map(|id| id.as_u32()) != Some(expected.as_raw() as u32) {
        return Err(io::Error::other(
            "Process session enumeration failed its host-session control",
        ));
    }
    let mut found = system
        .processes()
        .values()
        .filter(|process| {
            process
                .session_id()
                .is_some_and(|sid| sid.as_u32() == session)
        })
        .map(|process| process.pid().as_u32())
        .collect::<Vec<_>>();
    match getsid(Some(Pid::from_raw(id))) {
        Ok(sid) if sid.as_raw() == id && !found.contains(&session) => found.push(session),
        Err(Errno::ESRCH) | Ok(_) => {}
        Err(error) => return Err(io::Error::from_raw_os_error(error as i32)),
    }
    Ok(found)
}

pub(crate) fn terminate_session_now(session: u32) -> io::Result<()> {
    for pid in members(session)? {
        match kill(Pid::from_raw(pid as i32), Signal::SIGKILL) {
            Ok(()) | Err(Errno::ESRCH) => {}
            Err(error) => return Err(io::Error::from_raw_os_error(error as i32)),
        }
    }
    Ok(())
}

pub(crate) async fn wait_session_stopped(session: u32, timeout: Duration) -> io::Result<()> {
    tokio::task::spawn_blocking(move || wait_session_stopped_blocking(session, timeout))
        .await
        .map_err(io::Error::other)?
}

pub(crate) fn wait_session_stopped_blocking(session: u32, timeout: Duration) -> io::Result<()> {
    let deadline = std::time::Instant::now() + timeout;
    loop {
        let live = members(session)?;
        if !live.is_empty() {
            terminate_session_now(session)?;
        }
        if live.is_empty() {
            return Ok(());
        }
        if std::time::Instant::now() >= deadline {
            return Err(io::Error::new(
                io::ErrorKind::TimedOut,
                "Terminal session processes have not stopped",
            ));
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}
