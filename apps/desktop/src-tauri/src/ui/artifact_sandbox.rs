
use std::sync::LazyLock;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{Builder, Runtime, UriSchemeContext};

/// URI scheme registered for the artifact renderer.
///
/// Must stay in sync with:
/// - `frame-src` in `apps/desktop/src-tauri/tauri.conf.json`
/// - `ARTIFACT_SANDBOX_SCHEME` in
///   `packages/ui/unified-chat/src/lib/artifact-sandbox.ts`
pub const ARTIFACT_SANDBOX_SCHEME: &str = "artifact";

/// The shared renderer, compiled into the binary.
///
/// This is the *same file* the web sandbox deploys
/// (`sandbox.agiworkforce.com`), so desktop and web run one renderer and one
/// postMessage contract. Embedding it means the preview works offline and cannot
/// be tampered with on disk. `include_str!` also makes the file a rustc
/// dependency, so editing it rebuilds this crate.
const RENDERER_HTML: &str = include_str!("../../../../../infrastructure/sandbox/index.html");

static RENDERER_CSP: LazyLock<Option<String>> = LazyLock::new(|| extract_meta_csp(RENDERER_HTML));

/// Collapse a CSP into one canonical line: single-spaced directives joined by
/// `"; "`. The renderer's `<meta>` is written multi-line for readability.
fn normalize_csp(raw: &str) -> String {
    raw.split(';')
        .map(|directive| directive.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|directive| !directive.is_empty())
        .collect::<Vec<_>>()
        .join("; ")
}

/// Pull the `content` of the renderer's `<meta http-equiv="Content-Security-Policy">`.
///
/// Deliberately a narrow string scan rather than an HTML parse: the input is our
/// own compiled-in file, not untrusted markup, and a parser dependency here
/// would be a much larger surface than the four `find` calls it replaces.
fn extract_meta_csp(html: &str) -> Option<String> {
    const EQUIV: &str = "http-equiv=\"Content-Security-Policy\"";
    const CONTENT: &str = "content=\"";

    let equiv_at = html.find(EQUIV)?;
    let after_equiv = &html[equiv_at + EQUIV.len()..];
    let content_at = after_equiv.find(CONTENT)?;
    let after_content = &after_equiv[content_at + CONTENT.len()..];
    let close_at = after_content.find('"')?;

    let normalized = normalize_csp(&after_content[..close_at]);
    if normalized.is_empty() {
        return None;
    }
    Some(normalized)
}

/// True for the only paths the artifact origin serves.
fn is_renderer_path(path: &str) -> bool {
    matches!(path, "" | "/" | "/index.html")
}

fn text_response(status: StatusCode, body: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(body.as_bytes().to_vec())
        // Only fixed, valid header values above; `Builder::body` cannot fail here.
        .expect("static text response is always well-formed")
}

/// Build the response for one `artifact://` request.
///
/// Split out from the registration closure so it is directly unit-testable
/// without standing up a Tauri app.
pub fn artifact_sandbox_response(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != tauri::http::Method::GET {
        return text_response(StatusCode::METHOD_NOT_ALLOWED, "artifact sandbox: GET only");
    }

    if !is_renderer_path(request.uri().path()) {
        return text_response(StatusCode::NOT_FOUND, "artifact sandbox: not found");
    }

    let Some(csp) = RENDERER_CSP.as_deref() else {
        // Fail closed and say why. Serving the renderer without its policy would
        // execute model-generated code with no CSP at all.
        return text_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "artifact sandbox: renderer is missing its Content-Security-Policy meta tag",
        );
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header(header::CONTENT_SECURITY_POLICY, csp)
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::REFERRER_POLICY, "no-referrer")
        .header("X-Content-Type-Options", "nosniff")
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .header(
            "Permissions-Policy",
            "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
        )
        .body(RENDERER_HTML.as_bytes().to_vec())
        // `csp` is derived from our own compiled-in file and contains only ASCII
        // CSP tokens, so it is always a valid header value.
        .expect("artifact renderer response is always well-formed")
}

#[must_use]
pub fn register_artifact_sandbox_protocol<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    builder.register_uri_scheme_protocol(
        ARTIFACT_SANDBOX_SCHEME,
        |_ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>| {
            artifact_sandbox_response(&request)
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn get(path: &str) -> Response<Vec<u8>> {
        let uri = format!("artifact://localhost{path}");
        let request = Request::builder()
            .method("GET")
            .uri(uri)
            .body(Vec::new())
            .expect("test request builds");
        artifact_sandbox_response(&request)
    }

    #[test]
    fn renderer_html_is_the_shared_sandbox_document() {
        // If this ever stops being the file web deploys, desktop and web have
        // forked their renderer and the postMessage contract can drift.
        assert!(RENDERER_HTML.contains("AGI Artifact Sandbox"));
        assert!(RENDERER_HTML.contains("sandbox-ready"));
        assert!(RENDERER_HTML.contains("ALLOWED_PARENT_ORIGINS"));
    }

    #[test]
    fn renderer_allows_the_desktop_app_origins_as_parents() {
        // The renderer drops postMessages from any origin not on its allowlist.
        // Without these entries the handshake silently never completes and the
        // preview degrades to the inert srcdoc path on every desktop platform.
        assert!(RENDERER_HTML.contains("'tauri://localhost'"));
        assert!(RENDERER_HTML.contains("'http://tauri.localhost'"));
    }

    #[test]
    fn csp_is_extracted_from_the_renderer_meta() {
        let csp = RENDERER_CSP
            .as_deref()
            .expect("renderer must carry a CSP meta tag");
        assert!(csp.contains("default-src 'none'"));
        // The egress block. Artifact scripts must not be able to phone home.
        assert!(csp.contains("connect-src 'none'"));
        assert!(csp.contains("frame-src 'self'"));
        assert!(csp.contains("object-src 'none'"));
        assert!(csp.contains("base-uri 'none'"));
        assert!(csp.contains("form-action 'none'"));
        assert!(!csp.contains('\n'));
    }

    #[test]
    fn root_serves_the_renderer_with_its_own_policy() {
        let response = get("/");
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response
                .headers()
                .get(header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok()),
            Some("text/html; charset=utf-8")
        );

        let served_csp = response
            .headers()
            .get(header::CONTENT_SECURITY_POLICY)
            .and_then(|value| value.to_str().ok())
            .expect("renderer response carries a CSP header");
        assert_eq!(served_csp, RENDERER_CSP.as_deref().unwrap());
        // The header must never be laxer than the meta it mirrors.
        assert!(served_csp.contains("connect-src 'none'"));

        assert_eq!(response.body(), RENDERER_HTML.as_bytes());
    }

    #[test]
    fn index_html_is_the_same_document_as_root() {
        assert_eq!(get("/index.html").body(), get("/").body());
    }

    #[test]
    fn does_not_send_frame_ancestors() {
        // See the module docs: a hard-coded ancestor list breaks framing on any
        // app origin we failed to predict (dev server, WDIO bundle, Windows),
        // and adds nothing because the scheme is unreachable from outside the
        // binary. `frame-src` in tauri.conf.json is the enforcing directive.
        let csp = get("/")
            .headers()
            .get(header::CONTENT_SECURITY_POLICY)
            .and_then(|value| value.to_str().ok())
            .expect("csp header")
            .to_string();
        assert!(!csp.contains("frame-ancestors"));
    }

    #[test]
    fn every_other_path_is_a_404_not_a_file_read() {
        for path in ["/../../etc/passwd", "/anything.js", "/assets/x.png"] {
            let response = get(path);
            assert_eq!(
                response.status(),
                StatusCode::NOT_FOUND,
                "path {path} must not be served"
            );
            assert_ne!(response.body(), RENDERER_HTML.as_bytes());
        }
    }

    #[test]
    fn non_get_methods_are_rejected() {
        let request = Request::builder()
            .method("POST")
            .uri("artifact://localhost/")
            .body(Vec::new())
            .expect("test request builds");
        assert_eq!(
            artifact_sandbox_response(&request).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
    }

    #[test]
    fn normalize_csp_collapses_multiline_directives() {
        let raw = "\n  default-src 'none';\n  script-src 'self'\n    https://unpkg.com;\n";
        assert_eq!(
            normalize_csp(raw),
            "default-src 'none'; script-src 'self' https://unpkg.com"
        );
    }

    #[test]
    fn extract_meta_csp_reports_absence_instead_of_guessing() {
        assert_eq!(extract_meta_csp("<html><head></head></html>"), None);
        assert_eq!(
            extract_meta_csp("<meta http-equiv=\"Content-Security-Policy\" content=\"  \" />"),
            None
        );
    }
}
