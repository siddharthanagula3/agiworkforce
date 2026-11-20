use std::cmp::Ordering;
use std::fs;
use std::path::{Path, PathBuf};

use agiworkforce_desktop_gpui::updates::*;
use url::Url;

#[path = "support/host_path.rs"]
mod host_path;
use host_path::host_absolute;

fn repository() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..")
}

fn version(value: &str) -> Version {
    Version::parse(value).unwrap()
}

#[test]
fn versions_compare_like_the_cloud_shell() {
    for (left, right, expected) in [
        ("1.2.3", "1.2.3", Ordering::Equal),
        ("v1.2.3", "1.2.3", Ordering::Equal),
        ("1.2.3+build.5", "1.2.3", Ordering::Equal),
        ("1.10.0", "1.9.9", Ordering::Greater),
        ("2.0.0", "10.0.0", Ordering::Less),
        ("1.0.0", "1.0.0-rc.1", Ordering::Greater),
        ("1.0.0-alpha", "1.0.0-alpha.1", Ordering::Less),
        ("1.0.0-alpha.1", "1.0.0-alpha.beta", Ordering::Less),
        ("1.0.0-beta.2", "1.0.0-beta.11", Ordering::Less),
        ("1.0.0-rc.1", "1.0.0-beta", Ordering::Greater),
        ("1.0.0-beta-2", "1.0.0-beta-10", Ordering::Greater),
    ] {
        assert_eq!(
            version(left).compare(&version(right)),
            expected,
            "{left} vs {right}"
        );
    }
    assert!(version("0.0.2").is_newer_than(&version("0.0.1")));
    assert!(!version("0.0.1").is_newer_than(&version("0.0.1")));
    assert_eq!(version(" 1.2.3 ").to_string(), "1.2.3");
    assert_eq!(Version::current().to_string(), env!("CARGO_PKG_VERSION"));
}

#[test]
fn malformed_versions_are_rejected() {
    for value in [
        "",
        "1",
        "1.2",
        "1.2.3.4",
        "01.2.x",
        "1.2.3-",
        "1.2.3-beta..1",
        "1.2.3+",
        "1.2.3-be$ta",
        "9007199254740992.0.0",
        "V1.2.3",
    ] {
        assert!(Version::parse(value).is_err(), "{value:?}");
    }
}

#[test]
fn the_production_feed_comes_from_the_cloud_shell_owners() {
    let feed = ReleaseFeed::production().unwrap();
    assert_eq!(feed.origin().scheme(), "https");
    let availability = feed.availability_url().unwrap();
    let installer = feed.installer_url(MacArchitecture::Arm64, "1.2.3").unwrap();
    let checksums = feed.checksums_url().unwrap();
    for url in [&availability, &installer, &checksums] {
        assert_eq!(url.origin(), feed.origin().origin());
    }
    let pairs: Vec<(String, String)> = installer.query_pairs().into_owned().collect();
    assert!(pairs.contains(&("platform".into(), "mac".into())));
    assert!(pairs.contains(&("arch".into(), "arm64".into())));
    assert!(pairs.contains(&("version".into(), "1.2.3".into())));
    assert!(pairs
        .iter()
        .any(|(key, value)| key == "app" && !value.is_empty()));
    assert!(!feed.version_header().is_empty());
    for url in [&availability, &installer, &checksums] {
        let route = repository()
            .join("apps/web/app")
            .join(url.path().trim_start_matches('/'))
            .join("route.ts");
        assert!(
            route.is_file(),
            "{} has no web route at {}",
            url,
            route.display()
        );
    }
    let x64 = feed.installer_url(MacArchitecture::X64, "1.2.3").unwrap();
    assert!(x64
        .query_pairs()
        .any(|(key, value)| key == "arch" && value == "x64"));
}

#[test]
fn feed_parsing_fails_closed_when_an_owner_changes_shape() {
    let config = "const PRODUCTION_CLOUD_APP_ORIGIN = 'https://example.test';";
    let headers = "export const CLIENT_VERSION_HEADER = 'x-version';";
    let update = "export const DESKTOP_CLOUD_RELEASE_AVAILABILITY_URL = `${CLOUD_APP_ORIGIN}/api/latest`;\nexport const DESKTOP_CLOUD_RELEASE_CHANNEL = 'cloud';\nexport function desktopCloudInstallerDownloadUrl(architecture) {\n  return `${CLOUD_APP_ORIGIN}/api/download?platform=mac&app=${DESKTOP_CLOUD_RELEASE_CHANNEL}&arch=${architecture}`;\n}";
    let feed = ReleaseFeed::from_sources(config, update, headers).unwrap();
    assert_eq!(
        feed.availability_url().unwrap().as_str(),
        "https://example.test/api/latest"
    );
    assert_eq!(
        feed.checksums_url().unwrap().as_str(),
        "https://example.test/api/download/checksums"
    );
    assert_eq!(
        feed.installer_url(MacArchitecture::X64, "2.0.0")
            .unwrap()
            .as_str(),
        "https://example.test/api/download?platform=mac&app=cloud&arch=x64&version=2.0.0"
    );
    assert!(ReleaseFeed::from_sources("", update, headers).is_err());
    assert!(ReleaseFeed::from_sources(config, update, "").is_err());
    assert!(ReleaseFeed::from_sources(
        "const PRODUCTION_CLOUD_APP_ORIGIN = 'http://example.test';",
        update,
        headers
    )
    .is_err());
    assert!(ReleaseFeed::from_sources(
        config,
        &update.replace(
            "&arch=${architecture}",
            "&arch=${architecture}&x=${unknown}"
        ),
        headers
    )
    .is_err());
    assert!(ReleaseFeed::from_sources(
        config,
        &update.replace(
            "${CLOUD_APP_ORIGIN}/api/latest",
            "https://elsewhere.test/api/latest"
        ),
        headers
    )
    .is_err());
}

#[test]
fn only_https_or_loopback_origins_are_accepted() {
    let feed = ReleaseFeed::production().unwrap();
    for origin in [
        "http://example.test/",
        "https://user:secret@example.test/",
        "https://example.test/prefix/",
        "https://example.test/?q=1",
        "ftp://example.test/",
    ] {
        assert!(
            feed.clone()
                .with_origin(Url::parse(origin).unwrap())
                .is_err(),
            "{origin}"
        );
    }
    for origin in [
        "http://127.0.0.1:9/",
        "http://localhost:9/",
        "https://example.test/",
    ] {
        assert!(
            feed.clone()
                .with_origin(Url::parse(origin).unwrap())
                .is_ok(),
            "{origin}"
        );
    }
}

fn release(version: &str, arm64: bool, x64: bool) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "version": version,
        "publishedAt": "2026-11-01T00:00:00Z",
        "platforms": { "mac": true },
        "architectures": { "arm64": arm64, "x64": x64 },
    }))
    .unwrap()
}

#[test]
fn availability_responses_map_to_update_states() {
    let current = version("1.0.0");
    let arm = MacArchitecture::Arm64;
    assert_eq!(
        interpret_availability(404, b"{}", &current, arm).unwrap(),
        CheckOutcome::UpToDate { latest: None }
    );
    assert_eq!(
        interpret_availability(200, &release("1.0.0", true, true), &current, arm).unwrap(),
        CheckOutcome::UpToDate {
            latest: Some("1.0.0".into())
        }
    );
    assert_eq!(
        interpret_availability(200, &release("0.9.0", true, true), &current, arm).unwrap(),
        CheckOutcome::UpToDate {
            latest: Some("0.9.0".into())
        }
    );
    assert_eq!(
        interpret_availability(200, &release("1.1.0", true, false), &current, arm).unwrap(),
        CheckOutcome::Available(AvailableUpdate {
            version: "1.1.0".into(),
            published_at: Some("2026-11-01T00:00:00Z".into()),
        })
    );
    let missing = interpret_availability(
        200,
        &release("1.1.0", true, false),
        &current,
        MacArchitecture::X64,
    )
    .unwrap_err();
    assert!(missing.to_string().contains("x64"));
    let held = interpret_availability(
        503,
        br#"{"error":{"code":"UPDATES_HELD","message":"paused"}}"#,
        &current,
        arm,
    )
    .unwrap_err();
    assert!(held.to_string().contains("paused"));
    let unavailable = interpret_availability(503, b"{}", &current, arm).unwrap_err();
    assert!(unavailable.to_string().contains("(503)"));
    for body in [
        b"<html>captive portal</html>".to_vec(),
        br#"{"version":"1.1.0"}"#.to_vec(),
        release("not-a-version", true, true),
        serde_json::to_vec(&serde_json::json!({
            "version": "1.1.0",
            "platforms": { "mac": false },
            "architectures": { "arm64": true, "x64": true },
        }))
        .unwrap(),
        vec![b' '; 70 * 1024],
    ] {
        assert!(interpret_availability(200, &body, &current, arm).is_err());
    }
}

fn checksums(version: &str, installers: serde_json::Value) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({
        "version": version,
        "algorithm": "sha256",
        "installers": installers,
    }))
    .unwrap()
}

const DIGEST: &str = "a3f1c0d5e9b7a3f1c0d5e9b7a3f1c0d5e9b7a3f1c0d5e9b7a3f1c0d5e9b7a3f1";

#[test]
fn checksums_must_name_one_safe_installer_for_the_version() {
    let installers = serde_json::json!([
        { "name": "Desktop-1.1.0-arm64.dmg", "architecture": "arm64", "sha256": DIGEST },
        { "name": "Desktop-1.1.0-x64.dmg", "architecture": "x64", "sha256": DIGEST },
    ]);
    assert_eq!(
        interpret_checksums(
            200,
            &checksums("1.1.0", installers.clone()),
            "1.1.0",
            MacArchitecture::X64
        )
        .unwrap(),
        InstallerDigest {
            name: "Desktop-1.1.0-x64.dmg".into(),
            sha256: DIGEST.into(),
        }
    );
    assert!(interpret_checksums(
        200,
        &checksums("1.2.0", installers.clone()),
        "1.1.0",
        MacArchitecture::X64
    )
    .is_err());
    assert!(interpret_checksums(404, b"{}", "1.1.0", MacArchitecture::X64).is_err());
    let rejected = [
        serde_json::json!([]),
        serde_json::json!([
            { "name": "a-arm64.dmg", "architecture": "arm64", "sha256": DIGEST },
            { "name": "b-arm64.dmg", "architecture": "arm64", "sha256": DIGEST },
        ]),
        serde_json::json!([{ "name": "a-arm64.dmg", "architecture": "arm64", "sha256": DIGEST.to_uppercase() }]),
        serde_json::json!([{ "name": "a-arm64.dmg", "architecture": "arm64", "sha256": &DIGEST[1..] }]),
        serde_json::json!([{ "name": "../a-arm64.dmg", "architecture": "arm64", "sha256": DIGEST }]),
        serde_json::json!([{ "name": "a-arm64.pkg", "architecture": "arm64", "sha256": DIGEST }]),
        serde_json::json!([{ "name": "a.dmg", "architecture": null, "sha256": DIGEST }]),
    ];
    for installers in rejected {
        assert!(
            interpret_checksums(
                200,
                &checksums("1.1.0", installers.clone()),
                "1.1.0",
                MacArchitecture::Arm64
            )
            .is_err(),
            "{installers}"
        );
    }
    let other_algorithm = serde_json::to_vec(&serde_json::json!({
        "version": "1.1.0",
        "algorithm": "sha1",
        "installers": installers,
    }))
    .unwrap();
    assert!(interpret_checksums(200, &other_algorithm, "1.1.0", MacArchitecture::Arm64).is_err());
}

#[test]
fn tool_output_and_names_are_parsed_strictly() {
    assert_eq!(
        parse_sha256_output(&format!("{} *file.dmg\n", DIGEST.to_uppercase())).unwrap(),
        DIGEST
    );
    assert!(parse_sha256_output("").is_err());
    assert!(parse_sha256_output("nothex file").is_err());
    assert_eq!(
        parse_team_identifier("Identifier=x\nTeamIdentifier=ABCDE12345\n").as_deref(),
        Some("ABCDE12345")
    );
    assert_eq!(parse_team_identifier("TeamIdentifier=not set\n"), None);
    assert_eq!(parse_team_identifier("Signature=adhoc\n"), None);
    for name in ["App 1.2.3 (arm64).dmg", "app_1-2.dmg"] {
        assert!(safe_installer_name(name), "{name}");
    }
    for name in [
        ".dmg",
        ".hidden.dmg",
        "a/b.dmg",
        "a\\b.dmg",
        "app.dmg.exe",
        "app\n.dmg",
        "äpp.dmg",
    ] {
        assert!(!safe_installer_name(name), "{name:?}");
    }
    assert_eq!(
        MacArchitecture::for_target("macos", "aarch64"),
        Some(MacArchitecture::Arm64)
    );
    assert_eq!(
        MacArchitecture::for_target("macos", "x86_64"),
        Some(MacArchitecture::X64)
    );
    assert_eq!(MacArchitecture::for_target("linux", "x86_64"), None);
    assert_eq!(MacArchitecture::for_target("windows", "aarch64"), None);
    assert!(downloads_directory(None).is_err());
    assert!(downloads_directory(Some("relative".into())).is_err());
    let home = host_absolute("/Users/someone");
    assert_eq!(
        downloads_directory(Some(home.clone().into())).unwrap(),
        Path::new(&home).join("Downloads")
    );
}

#[test]
fn destinations_never_replace_an_existing_file() {
    let directory = tempfile::tempdir().unwrap();
    let first = available_destination(directory.path(), "App.dmg").unwrap();
    assert_eq!(first, directory.path().join("App.dmg"));
    fs::write(&first, b"existing").unwrap();
    let second = available_destination(directory.path(), "App.dmg").unwrap();
    assert_eq!(second, directory.path().join("App (1).dmg"));
    assert!(available_destination(directory.path(), "../App.dmg").is_err());
}

#[test]
fn bundle_resources_supply_the_runtime_version_and_notices() {
    let directory = tempfile::tempdir().unwrap();
    let bundle = directory.path().join("Desktop.app");
    let executable = bundle.join("Contents/MacOS/desktop");
    let resources = bundle.join("Contents/Resources");
    fs::create_dir_all(executable.parent().unwrap()).unwrap();
    fs::create_dir_all(&resources).unwrap();
    assert_eq!(bundled_runtime_version(&executable), None);
    assert_eq!(bundled_notices(&executable), None);
    assert_eq!(bundle_path(&executable), Some(bundle));
    assert_eq!(bundle_path(&directory.path().join("bin/desktop")), None);
    fs::write(
        resources.join("native-runtime.json"),
        r#"{"executable":"agi","version":"3.4.5"}"#,
    )
    .unwrap();
    let notices = resources.join(notices_file_name().unwrap());
    fs::write(&notices, "notices").unwrap();
    assert_eq!(
        bundled_runtime_version(&executable).as_deref(),
        Some("3.4.5")
    );
    assert_eq!(bundled_notices(&executable), Some(notices));
    fs::write(resources.join("native-runtime.json"), r#"{"version":"  "}"#).unwrap();
    assert_eq!(bundled_runtime_version(&executable), None);
    let written = write_notices(&directory.path().join("out"), b"text").unwrap();
    assert_eq!(fs::read(written).unwrap(), b"text");
    assert!(write_notices(directory.path(), b"").is_err());
}

#[cfg(target_os = "macos")]
mod loopback {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use super::*;

    struct Route {
        status: u16,
        body: Vec<u8>,
    }

    type Request = (String, Vec<String>);

    struct Server {
        origin: Url,
        requests: Arc<Mutex<Vec<Request>>>,
    }

    fn serve(routes: impl Fn(&str) -> Route + Send + 'static) -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let seen = requests.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                let target = line.split_whitespace().nth(1).unwrap_or("").to_owned();
                let mut headers = Vec::new();
                loop {
                    let mut header = String::new();
                    if reader.read_line(&mut header).unwrap() == 0 || header == "\r\n" {
                        break;
                    }
                    headers.push(header.trim().to_ascii_lowercase());
                }
                let route = routes(&target);
                seen.lock().unwrap().push((target, headers));
                let _ = write!(
                    stream,
                    "HTTP/1.1 {} X\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    route.status,
                    route.body.len()
                );
                let _ = stream.write_all(&route.body);
                let _ = stream.flush();
                let _ = reader.read(&mut [0; 1]);
            }
        });
        Server { origin, requests }
    }

    const INSTALLER: &[u8] = b"installer bytes";

    fn digest_of(bytes: &[u8]) -> String {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("file");
        fs::write(&path, bytes).unwrap();
        sha256_file(&path).unwrap()
    }

    fn release_server(published_digest: String, installer_status: u16) -> Server {
        serve(move |target| {
            if target.contains("desktop-cloud/latest") {
                Route {
                    status: 200,
                    body: release("1.1.0", true, true),
                }
            } else if target.contains("/checksums") {
                Route {
                    status: 200,
                    body: checksums(
                        "1.1.0",
                        serde_json::json!([
                            { "name": "App-1.1.0-arm64.dmg", "architecture": "arm64", "sha256": published_digest },
                        ]),
                    ),
                }
            } else {
                Route {
                    status: installer_status,
                    body: INSTALLER.to_vec(),
                }
            }
        })
    }

    fn client(server: &Server) -> UpdateClient {
        UpdateClient::new(
            ReleaseFeed::production()
                .unwrap()
                .with_origin(server.origin.clone())
                .unwrap(),
            version("1.0.0"),
            MacArchitecture::Arm64,
            Duration::from_secs(10),
        )
    }

    fn entries(directory: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(directory)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_checked_download_lands_only_after_its_checksum_and_gate_pass() {
        let server = release_server(digest_of(INSTALLER), 200);
        let updater = client(&server);
        let CheckOutcome::Available(update) = updater.check().unwrap() else {
            panic!("expected an update");
        };
        let directory = tempfile::tempdir().unwrap();
        let gated = Arc::new(Mutex::new(Vec::new()));
        let record = gated.clone();
        let path = updater
            .download(&update, directory.path(), move |staged| {
                record.lock().unwrap().push(fs::read(staged).unwrap());
                Ok(())
            })
            .unwrap();
        assert_eq!(path, directory.path().join("App-1.1.0-arm64.dmg"));
        assert_eq!(fs::read(&path).unwrap(), INSTALLER);
        assert_eq!(*gated.lock().unwrap(), vec![INSTALLER.to_vec()]);
        assert_eq!(entries(directory.path()), vec!["App-1.1.0-arm64.dmg"]);
        let requests = server.requests.lock().unwrap();
        assert_eq!(requests.len(), 3);
        let header = format!(
            "{}: 1.0.0",
            ReleaseFeed::production().unwrap().version_header()
        );
        assert!(requests
            .iter()
            .all(|(_, headers)| headers.contains(&header)));
        assert!(requests[2].0.contains("version=1.1.0") && requests[2].0.contains("arch=arm64"));
    }

    #[test]
    fn a_checksum_mismatch_leaves_nothing_behind() {
        let server = release_server(DIGEST.into(), 200);
        let updater = client(&server);
        let CheckOutcome::Available(update) = updater.check().unwrap() else {
            panic!("expected an update");
        };
        let directory = tempfile::tempdir().unwrap();
        let error = updater
            .download(&update, directory.path(), |_| {
                panic!("the gate must not run")
            })
            .unwrap_err();
        assert!(error.to_string().contains("checksum"));
        assert!(entries(directory.path()).is_empty());
    }

    #[test]
    fn a_moved_release_or_failed_gate_leaves_nothing_behind() {
        let server = release_server(digest_of(INSTALLER), 303);
        let updater = client(&server);
        let CheckOutcome::Available(update) = updater.check().unwrap() else {
            panic!("expected an update");
        };
        let directory = tempfile::tempdir().unwrap();
        assert!(updater
            .download(&update, directory.path(), |_| Ok(()))
            .is_err());
        assert!(entries(directory.path()).is_empty());

        let server = release_server(digest_of(INSTALLER), 200);
        let updater = client(&server);
        let error = updater
            .download(&update, directory.path(), gatekeeper_gate(None))
            .unwrap_err();
        assert!(error.to_string().contains("notarized"));
        assert!(entries(directory.path()).is_empty());
    }

    #[test]
    fn an_unreachable_service_reports_a_connection_failure() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = Url::parse(&format!("http://{}/", listener.local_addr().unwrap())).unwrap();
        drop(listener);
        let client = UpdateClient::new(
            ReleaseFeed::production()
                .unwrap()
                .with_origin(origin)
                .unwrap(),
            version("1.0.0"),
            MacArchitecture::Arm64,
            Duration::from_secs(5),
        );
        assert!(client
            .check()
            .unwrap_err()
            .to_string()
            .contains("Could not reach the update service"));
    }
}
