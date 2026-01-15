# Changelog

All notable changes to the AGI Workforce Browser Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-01-15

### Added

- **Enhanced Popup UI**
  - Modern gradient design with improved visual hierarchy
  - Animated connection status indicators (pulsing dots)
  - Real-time session statistics (tabs, actions, session time)
  - Quick action buttons (Capture, Refresh)
  - Interactive hover effects and transitions
  - Loading states and visual feedback

- **Keyboard Shortcuts**
  - `Cmd/Ctrl + Shift + A` - Open extension popup
  - `Cmd/Ctrl + Shift + C` - Capture current page
  - `Cmd/Ctrl + R` - Refresh (in popup)
  - `Cmd/Ctrl + C` - Capture (in popup)

- **Session Management**
  - Action count tracking persisted in storage
  - Session timer showing elapsed time
  - Tab count monitoring
  - Real-time statistics updates

- **Comprehensive Documentation**
  - EXTENSION_GUIDE.md - Complete developer guide with architecture, API, and best practices
  - USER_GUIDE.md - End-user documentation with features and troubleshooting
  - API_REFERENCE.md - Complete API documentation for all message types
  - README.md - Quick start and overview
  - CHANGELOG.md - Version history (this file)

- **Security Enhancements**
  - Rate limiting: 120 requests/minute per tab
  - Screenshot cooldown: 500ms between captures
  - Blocked cookie domains: banking, government, healthcare
  - Blocked localStorage keys: tokens, credentials, payment info
  - Origin validation for all messages
  - Sender verification in background script

- **Manifest V3 Best Practices**
  - Service worker type: module
  - Optional permissions for downloads, bookmarks, history
  - Keyboard command definitions
  - Minimum Chrome version specified (105)
  - Enhanced CSP for extension pages
  - Offline capability flag

- **Build System Improvements**
  - Package script for creating distribution ZIP
  - Clean script for build artifacts
  - Lint and format scripts
  - Engine requirements specified

### Changed

- **Popup Interface**
  - Increased width from 320px to 380px
  - Minimum height set to 480px
  - Improved status card with gradient backgrounds
  - Better color scheme for connection states
  - Enhanced typography with letter-spacing and font weights

- **Status Indicators**
  - Replaced simple dots with animated pulsing indicators
  - Added status title and subtitle for better clarity
  - Green for connected, red for disconnected
  - Smooth transitions on state changes

- **Version Numbers**
  - Updated manifest.json version to 1.1.0
  - Updated package.json version to 1.1.0
  - Synced version across all documentation

### Improved

- **User Experience**
  - Visual feedback on button interactions
  - Loading states for async operations
  - Error handling with clear messages
  - Responsive design for different window sizes

- **Developer Experience**
  - Clear code organization
  - Comprehensive inline comments
  - Detailed API documentation
  - Architecture diagrams
  - Example usage patterns

- **Security Posture**
  - Multiple layers of validation
  - Rate limiting prevents abuse
  - Domain restrictions protect sensitive sites
  - Storage key filtering prevents credential theft

- **Performance**
  - Optimized message passing
  - Efficient DOM operations
  - Debounced event handlers
  - Lazy loading where applicable

### Fixed

- URL display now handles invalid URLs gracefully
- Tab info updates on error show meaningful messages
- Session timer starts correctly on popup open
- Storage changes trigger UI updates properly

---

## [1.0.0] - 2025-01-09

### Added

- **Initial Release**
  - Chrome Extension Manifest V3 support
  - Background service worker for message routing
  - Content script for DOM interaction
  - Injected script for deep page access
  - Native messaging to desktop application
  - Popup interface showing connection status

- **Browser Automation**
  - Click, double-click, right-click operations
  - Text input with typing simulation
  - Form filling and submission
  - Element selection (dropdown, checkbox, radio)
  - Scroll operations (page and element)
  - Drag and drop support
  - Hover and focus management

- **Accessibility Features**
  - Accessibility tree building with ARIA roles
  - Element role detection
  - Accessible name extraction
  - Focusable element detection
  - Interactive element discovery

- **Data Extraction**
  - Text content extraction
  - Attribute reading and writing
  - Element querying (single and multiple)
  - Page information (URL, title, metadata)
  - Page content extraction (HTML, text, links, images)
  - Form discovery and field enumeration

- **Visual Capture**
  - Screenshot capture (PNG/JPEG)
  - Automatic forwarding to native host
  - Quality and format options

- **Tab Management**
  - Get current tab information
  - List all open tabs
  - Create new tabs
  - Close tabs
  - Switch active tab
  - Tab lifecycle event tracking

- **Cookie Operations**
  - Get cookies for specific URL
  - Set cookies with options
  - Clear cookies for domain
  - Security restrictions on sensitive domains

- **Storage Access**
  - localStorage read operations (restricted keys)
  - localStorage write operations (restricted keys)
  - Security filters for sensitive data

- **Action Recording**
  - Start/stop recording mode
  - Capture clicks, typing, form interactions
  - Get recorded action sequence
  - Timestamp tracking

- **Native Messaging**
  - Persistent connection to desktop app
  - Automatic reconnection on disconnect
  - Message relay with timeout handling
  - Event broadcasting (tab events, screenshots, a11y tree)

- **Security Foundation**
  - Sender origin validation
  - Domain-based cookie restrictions
  - localStorage key filtering
  - Disabled dangerous operations (EVALUATE)

### Technical Implementation

- Vite build system for bundling
- Static file copying for manifest and icons
- Content Security Policy configuration
- Host permissions for all URLs
- Web-accessible resources for injected script
- Chrome storage API for state persistence

---

## Future Roadmap

### Planned for 1.2.0

- [ ] Firefox support (Manifest V3 differences)
- [ ] Enhanced debugging tools
- [ ] Performance metrics dashboard
- [ ] Export/import settings
- [ ] Theme customization (dark mode)
- [ ] Advanced filtering for action recording
- [ ] Batch operations support
- [ ] Custom keyboard shortcut editor

### Planned for 1.3.0

- [ ] Multi-language support
- [ ] Advanced element selector builder
- [ ] Visual regression testing tools
- [ ] Automated workflow suggestions
- [ ] AI-powered element detection
- [ ] Cloud sync for settings
- [ ] Team collaboration features

### Planned for 2.0.0

- [ ] Cross-browser support (Firefox, Safari)
- [ ] Mobile browser support (where available)
- [ ] Plugin/extension system
- [ ] Custom automation scripting language
- [ ] Visual workflow builder
- [ ] Marketplace for automation templates

---

## Support

For questions, issues, or feature requests:

- **Documentation:** See guides in extension directory
- **GitHub Issues:** Report bugs and request features
- **Website:** https://agiworkforce.com

---

## Version Numbering

- **Major (X.0.0):** Breaking changes, major features
- **Minor (0.X.0):** New features, non-breaking changes
- **Patch (0.0.X):** Bug fixes, minor improvements

---

**Extension Version:** 1.1.0
**API Version:** 1.0
**Manifest Version:** 3
