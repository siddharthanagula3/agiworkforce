# AGI Workforce API Versioning Strategy

This document outlines the versioning strategy, deprecation policies, and migration guidelines for the AGI Workforce API.

## Table of Contents

- [Versioning Approach](#versioning-approach)
- [Version Format](#version-format)
- [Current Versions](#current-versions)
- [Backward Compatibility](#backward-compatibility)
- [Breaking Changes](#breaking-changes)
- [Deprecation Policy](#deprecation-policy)
- [Migration Guides](#migration-guides)
- [Version Discovery](#version-discovery)

---

## Versioning Approach

AGI Workforce uses **URL Path Versioning** for major API versions:

```
https://agiworkforce.com/api/llm/v1/chat/completions
                                   ^^
                                   Version identifier
```

### Why URL Path Versioning?

1. **Clear and Explicit**: Version is immediately visible in the URL
2. **Cache-Friendly**: Different versions have different URLs
3. **Tool-Friendly**: Works seamlessly with API testing tools
4. **Standard Practice**: Widely adopted in the industry

### Alternative Approaches Considered

| Approach            | Pros                            | Cons                              | Decision      |
| ------------------- | ------------------------------- | --------------------------------- | ------------- |
| **URL Path**        | Clear, cacheable, tool-friendly | URL changes on version bump       | ✅ **Chosen** |
| Header-based        | Clean URLs                      | Hidden versioning, harder to test | ❌ Rejected   |
| Content Negotiation | RESTful                         | Complex client implementation     | ❌ Rejected   |
| Query Parameter     | Easy to implement               | Messy URLs, cache issues          | ❌ Rejected   |

---

## Version Format

### Major Versions

Format: `v{MAJOR}`

Examples: `v1`, `v2`, `v3`

**Major version changes when:**

- Breaking changes to request/response format
- Removal of deprecated endpoints
- Fundamental changes to authentication
- Significant changes to core functionality

### Minor and Patch Versions

AGI Workforce **does not** expose minor/patch versions in the API URL. These are tracked internally and applied transparently:

- **Minor**: New features, backward-compatible additions
- **Patch**: Bug fixes, performance improvements

### Semantic Versioning

Internally, we follow Semantic Versioning (SemVer):

```
MAJOR.MINOR.PATCH

Example: 1.5.2
- MAJOR = 1 (Breaking changes)
- MINOR = 5 (New features, backward-compatible)
- PATCH = 2 (Bug fixes)
```

---

## Current Versions

### Web API (Current: v1)

**Base URL**: `https://agiworkforce.com/api`

**Endpoints without explicit version** (implicit v1):

- `GET /me`
- `POST /checkout`
- `POST /portal`
- `POST /device/link`
- `POST /device/poll`
- `GET /health`

**Note**: These endpoints will be migrated to `/v1/` prefix in future to maintain consistency.

### LLM API (Current: v1)

**Base URL**: `https://agiworkforce.com/api/llm/v1`

**Endpoints**:

- `POST /chat/completions`
- `GET /models`
- `GET /credits/balance`

**Versioned**: Explicit `/v1/` in path

### API Gateway (Current: v1)

**Base URL**: `https://api.agiworkforce.com/api`

**Endpoints**:

- `POST /auth/register`
- `POST /auth/login`
- `POST /desktop/register`
- `GET /desktop/:id/status`

**Note**: Gateway routes currently unversioned. Will add `/v1/` prefix in future.

---

## Backward Compatibility

### What Counts as Backward Compatible?

✅ **Safe Changes (No version bump required)**:

- Adding new optional parameters
- Adding new fields to responses
- Adding new endpoints
- Adding new HTTP methods to existing endpoints
- Making required parameters optional
- Loosening validation rules

### What's NOT Backward Compatible?

❌ **Breaking Changes (Requires major version bump)**:

- Removing or renaming fields
- Changing field types
- Making optional parameters required
- Removing endpoints
- Changing authentication methods
- Changing error response format
- Changing HTTP status codes
- Changing rate limiting behavior

---

## Breaking Changes

### Process for Breaking Changes

1. **Announce**: Publish announcement 6 months before change
2. **Deprecate**: Mark affected endpoints as deprecated
3. **Migrate**: Release new version with changes
4. **Support**: Run both versions in parallel for 12 months
5. **Sunset**: Disable old version after 12-month transition period

### Example Timeline

```
Month 0:  Announcement of breaking change
Month 6:  Release v2 with breaking change
Month 18: Sunset v1 (12 months after v2 release)
```

### Recent Breaking Changes

None yet. API is currently in v1 for all endpoints.

### Planned Breaking Changes

None currently planned.

---

## Deprecation Policy

### Deprecation Process

When an endpoint or feature is deprecated:

1. **Announcement**: Published in release notes and changelog
2. **Warning Header**: `Deprecation` header added to responses:
   ```http
   Deprecation: true
   Sunset: Wed, 15 Jan 2027 00:00:00 GMT
   Link: <https://docs.agiworkforce.com/migration/v1-to-v2>; rel="deprecation"
   ```
3. **Documentation**: Updated with deprecation notice
4. **Email Notification**: Sent to API users using deprecated endpoints
5. **Transition Period**: Minimum 12 months of parallel support

### Deprecation Warning Format

**API Response Headers**:

```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Wed, 15 Jan 2027 00:00:00 GMT
Link: <https://docs.agiworkforce.com/migration/v1-to-v2>; rel="deprecation"
X-API-Warn: "This endpoint is deprecated and will be removed on 2027-01-15"
```

**Documentation Notice**:

```
⚠️ DEPRECATED: This endpoint is deprecated and will be removed on January 15, 2027.
Please migrate to /v2/chat/completions. See migration guide: [link]
```

### Currently Deprecated Endpoints

None. All endpoints are currently active.

---

## Migration Guides

### General Migration Best Practices

1. **Test in Development**: Always test migrations in a dev environment first
2. **Gradual Rollout**: Migrate incrementally, not all at once
3. **Monitor Metrics**: Watch error rates and latency during migration
4. **Keep Old Version**: Keep old code as fallback during transition
5. **Version Detection**: Detect API version programmatically

### Version Detection Pattern

```javascript
// Detect API version from response headers
const response = await fetch('https://agiworkforce.com/api/me');
const apiVersion = response.headers.get('X-API-Version') || 'v1';

if (apiVersion !== 'v1') {
  console.warn(`Unexpected API version: ${apiVersion}`);
}
```

### Migration Timeline Recommendation

```
Week 1-2:  Read migration guide, understand changes
Week 3-4:  Update code to support new version
Week 5-6:  Test in development environment
Week 7-8:  Deploy to staging
Week 9-10: Monitor staging for issues
Week 11:   Deploy to production (50% traffic)
Week 12:   Deploy to production (100% traffic)
```

### Example: Migrating from Implicit v1 to Explicit v1

**Current (Implicit v1)**:

```bash
curl https://agiworkforce.com/api/me
```

**Future (Explicit v1)**:

```bash
curl https://agiworkforce.com/api/v1/me
```

**Migration Code**:

```javascript
// Support both versions during transition
const BASE_URL_V1_IMPLICIT = 'https://agiworkforce.com/api';
const BASE_URL_V1_EXPLICIT = 'https://agiworkforce.com/api/v1';

async function getUser(useExplicitVersion = false) {
  const baseUrl = useExplicitVersion ? BASE_URL_V1_EXPLICIT : BASE_URL_V1_IMPLICIT;

  try {
    return await fetch(`${baseUrl}/me`);
  } catch (error) {
    // Fallback to other version
    const fallbackUrl = useExplicitVersion ? BASE_URL_V1_IMPLICIT : BASE_URL_V1_EXPLICIT;
    return await fetch(`${fallbackUrl}/me`);
  }
}
```

---

## Version Discovery

### Detecting API Version

**Option 1: Response Headers**

Every API response includes version information:

```http
HTTP/1.1 200 OK
X-API-Version: v1
X-API-Version-Full: 1.5.2
X-API-Deprecated: false
```

**Option 2: Version Endpoint**

```bash
curl https://agiworkforce.com/api/version
```

**Response**:

```json
{
  "version": "v1",
  "full_version": "1.5.2",
  "deprecated": false,
  "sunset_date": null,
  "latest_version": "v1"
}
```

### Changelog

Full changelog available at:

- **URL**: https://docs.agiworkforce.com/changelog
- **RSS**: https://docs.agiworkforce.com/changelog/feed.xml

**Format**:

```markdown
## v1.5.2 (2026-01-15)

### Added

- New `thinking_mode` parameter for reasoning models
- Support for prompt caching on Claude Sonnet 4

### Fixed

- Credit reconciliation bug in streaming mode
- Device polling timeout issue

### Deprecated

- None

### Breaking Changes

- None
```

---

## Version Support Lifecycle

### Support Tiers

| Tier            | Duration        | Support Level                         |
| --------------- | --------------- | ------------------------------------- |
| **Active**      | Current version | Full support, new features, bug fixes |
| **Maintenance** | 12 months       | Bug fixes only, no new features       |
| **Deprecated**  | 6 months        | Security fixes only                   |
| **Sunset**      | -               | No support, disabled                  |

### Example Lifecycle

```
v1 Released:    Jan 2025  [Active]
v2 Released:    Jan 2026  [v1 → Maintenance, v2 → Active]
v1 Deprecated:  Jan 2027  [v1 → Deprecated, v2 → Active]
v1 Sunset:      Jul 2027  [v1 → Disabled, v2 → Active]
```

### Current Support Status

| Version | Status     | End of Support          |
| ------- | ---------- | ----------------------- |
| v1      | **Active** | TBD (no sunset planned) |

---

## API Stability Guarantees

### Stable APIs

**Guarantee**: No breaking changes without major version bump

**Endpoints**:

- `POST /llm/v1/chat/completions`
- `GET /llm/v1/models`
- `GET /llm/v1/credits/balance`

### Experimental APIs

**Warning**: May change without notice

**Endpoints**:

- None currently

**Markers**:

- URL contains `/experimental/`
- Response header: `X-API-Stability: experimental`
- Documentation marked with: "⚠️ EXPERIMENTAL"

---

## Client Library Versioning

### Official SDKs

AGI Workforce maintains official SDKs that match API versions:

| SDK                   | Language              | API Version | Status  |
| --------------------- | --------------------- | ----------- | ------- |
| `@agiworkforce/sdk`   | TypeScript/JavaScript | v1          | Planned |
| `agiworkforce-python` | Python                | v1          | Planned |
| `agiworkforce-go`     | Go                    | v1          | Planned |

### SDK Version Pinning

**Recommended**: Pin SDK major version to match API version:

```json
// package.json
{
  "dependencies": {
    "@agiworkforce/sdk": "^1.0.0" // Stays on v1 API
  }
}
```

```python
# requirements.txt
agiworkforce-python>=1.0.0,<2.0.0  # Stays on v1 API
```

---

## Community Feedback

We welcome feedback on our versioning strategy:

- **GitHub Discussions**: https://github.com/agiworkforce/api-feedback/discussions
- **Discord**: https://discord.gg/agiworkforce
- **Email**: api-feedback@agiworkforce.com

### Feature Requests

Submit feature requests at: https://github.com/agiworkforce/api-feedback/issues

### Breaking Change Review

All proposed breaking changes go through community review before implementation.

---

## Version History

### v1 (January 2025 - Current)

**Release Date**: January 15, 2025

**Initial Release**:

- User management (`/me`)
- Subscription management (`/checkout`, `/portal`)
- Device management (`/device/link`, `/device/poll`)
- LLM API (`/llm/v1/chat/completions`)
- Credit management
- Health checks

**Status**: Active

---

## Summary

**Key Takeaways**:

1. ✅ Major versions in URL path (`/v1/`, `/v2/`)
2. ✅ Minimum 12 months support for deprecated versions
3. ✅ Deprecation warnings via headers
4. ✅ 6 months advance notice for breaking changes
5. ✅ Backward compatibility within major versions

**Current Version**: v1 (Active)

**Next Version**: v2 (Not planned yet)

---

## Contact

Questions about API versioning?

- **Documentation**: https://docs.agiworkforce.com/versioning
- **Support**: support@agiworkforce.com
- **Discord**: https://discord.gg/agiworkforce
