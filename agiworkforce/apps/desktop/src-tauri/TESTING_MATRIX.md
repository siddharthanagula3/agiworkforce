# Windows Automation Testing Matrix

## Test Environments

### Operating Systems

| OS Version | Build | DPI | Resolution | Status | Notes |
|------------|-------|-----|------------|--------|-------|
| Windows 10 21H2 | 19044 | 100% | 1920x1080 | Pending | Reference configuration |
| Windows 10 21H2 | 19044 | 125% | 1920x1080 | Pending | Common laptop setting |
| Windows 10 21H2 | 19044 | 150% | 1920x1080 | Pending | High DPI |
| Windows 11 23H2 | 22631 | 100% | 2560x1440 | Pending | Modern workstation |
| Windows 11 23H2 | 22631 | 150% | 2560x1440 | Pending | High DPI 1440p |
| Windows 11 23H2 | 22631 | 200% | 3840x2160 | Pending | 4K display |
| Windows 11 Insider | Latest | 100% | 1920x1080 | Pending | Bleeding edge |

### Multi-Monitor Configurations

| Setup | Primary | Secondary | Status | Notes |
|-------|---------|-----------|--------|-------|
| Single monitor | 1920x1080 @100% | - | Pending | Baseline |
| Dual monitor (same) | 1920x1080 @100% | 1920x1080 @100% | Pending | Common setup |
| Dual monitor (mixed) | 2560x1440 @100% | 1920x1080 @100% | Pending | Mixed resolution |
| Dual monitor (mixed DPI) | 1920x1080 @100% | 1920x1080 @150% | Pending | Per-monitor DPI |
| Triple monitor | 1920x1080 @100% | 1920x1080 @100% | Pending | Extended desktop |

### Graphics Configurations

| GPU Type | Driver | Status | Known Issues |
|----------|--------|--------|--------------|
| Intel UHD Graphics | Latest | Pending | - |
| NVIDIA GeForce | Latest | Pending | - |
| AMD Radeon | Latest | Pending | - |
| Microsoft Basic Display | Built-in | Pending | Limited DXGI support |
| Virtual Machine (Hyper-V) | Emulated | Pending | Reduced performance |
| Virtual Machine (VMware) | SVGA | Pending | - |

## Functional Test Matrix

### Input Simulation Tests

| Test Case | Win10 | Win11 | High DPI | Notes |
|-----------|-------|-------|----------|-------|
| Clipboard: Set text | Pending | Pending | Pending | Basic text |
| Clipboard: Unicode text | Pending | Pending | Pending | Emoji, CJK |
| Clipboard: Large text (>100KB) | Pending | Pending | Pending | Performance |
| Keyboard: Single key press | Pending | Pending | Pending | VK codes |
| Keyboard: Hotkey (Ctrl+C) | Pending | Pending | Pending | Modifiers |
| Keyboard: Text input (ASCII) | Pending | Pending | Pending | Unicode events |
| Keyboard: Text input (Unicode) | Pending | Pending | Pending | CJK, emoji |
| Mouse: Move to position | Pending | Pending | Pending | DPI awareness |
| Mouse: Click at position | Pending | Pending | Pending | All buttons |
| Mouse: Drag operation | Pending | Pending | Pending | - |
| Mouse: Scroll wheel | Pending | Pending | Pending | Positive/negative |

### Screen Capture Tests

| Test Case | Win10 | Win11 | 4K | Multi-mon | Notes |
|-----------|-------|-------|-----|-----------|-------|
| Capture primary screen | Pending | Pending | Pending | N/A | - |
| Capture specific region | Pending | Pending | Pending | Pending | - |
| Capture window | Pending | Pending | Pending | Pending | Specific window |
| Capture secondary display | Pending | Pending | Pending | Pending | Multi-monitor only |
| Generate thumbnail (50px) | Pending | Pending | Pending | N/A | Small |
| Generate thumbnail (200px) | Pending | Pending | Pending | N/A | Medium |
| Handle HDR displays | Pending | Pending | Pending | Pending | Color mapping |
| Handle virtual desktop | Pending | Pending | N/A | N/A | Win10 feature |
| Performance: <200ms (1080p) | Pending | Pending | N/A | N/A | Latency target |
| Performance: <300ms (4K) | Pending | Pending | Pending | N/A | Latency target |

### OCR Tests (Feature-Gated)

| Test Case | Win10 | Win11 | Status | Accuracy Target |
|-----------|-------|-------|--------|-----------------|
| OCR: Clean text screenshot | Pending | Pending | Requires Tesseract | >95% |
| OCR: Mixed fonts | Pending | Pending | Requires Tesseract | >90% |
| OCR: Small text | Pending | Pending | Requires Tesseract | >85% |
| OCR: Colored backgrounds | Pending | Pending | Requires Tesseract | >85% |
| OCR: Handwritten text | Pending | Pending | Requires Tesseract | >60% |
| OCR: Multiple languages | Pending | Pending | Requires Tesseract | Varies |
| Performance: <2s (1080p) | Pending | Pending | Requires Tesseract | Latency target |

### UI Automation Tests

| Test Case | Win10 | Win11 | Status | Notes |
|-----------|-------|-------|--------|-------|
| UIA: List windows | Pending | Pending | - | Enumerate desktop |
| UIA: Find window by name | Pending | Pending | - | Notepad test |
| UIA: Find element by name | Pending | Pending | - | Button, textbox |
| UIA: Find by automation ID | Pending | Pending | - | - |
| UIA: Check patterns (Invoke) | Pending | Pending | - | Button clicks |
| UIA: Check patterns (Value) | Pending | Pending | - | Text input |
| UIA: Check patterns (Toggle) | Pending | Pending | - | Checkboxes |
| UIA: Get element bounds | Pending | Pending | Pending | DPI scaling |
| UIA: Invoke button | Pending | Pending | - | Pattern action |
| UIA: Set text value | Pending | Pending | - | Edit controls |
| UIA: Get text value | Pending | Pending | - | Read current value |
| UIA: Navigate element tree | Pending | Pending | - | Parent/child |
| UIA: Cache performance | Pending | Pending | - | Element caching |
| Performance: <100ms list windows | Pending | Pending | - | Latency target |
| Performance: <200ms find element | Pending | Pending | - | Latency target |

### Database Integration Tests

| Test Case | Status | Notes |
|-----------|--------|-------|
| Create schema (migrations) | Pending | All tables |
| Insert automation history | Pending | Valid task types |
| Insert capture metadata | Pending | UUID, timestamps |
| Insert OCR results | Pending | Foreign keys |
| Insert overlay events | Pending | Event types |
| Query by task type | Pending | Indexed |
| Query by timestamp | Pending | Indexed |
| Foreign key cascade delete | Pending | Captures->OCR |
| Concurrent writes | Pending | Thread safety |
| Large dataset performance | Pending | >10k records |

### Integration Workflows

| Workflow | Win10 | Win11 | Status | Description |
|----------|-------|-------|--------|-------------|
| Launch app + find window | Pending | Pending | - | Notepad automation |
| Type text + screenshot | Pending | Pending | - | Input + capture |
| Click button + verify | Pending | Pending | - | UIA action + verify |
| Copy + paste + verify | Pending | Pending | - | Clipboard integration |
| Multi-step form fill | Pending | Pending | - | Complex workflow |
| Drag and drop | Pending | Pending | - | Mouse + UIA |
| Screenshot + OCR + verify | Pending | Pending | OCR feature | Full pipeline |

## Known Issues and Workarounds

### DPI Scaling Issues

| Issue | Affected Versions | Status | Workaround |
|-------|-------------------|--------|------------|
| Screen capture incorrect dimensions at 200% DPI | Win11 | Open | Use DXGI instead of GDI |
| Mouse coordinates off at mixed DPI | Win10, Win11 | Open | Convert to physical pixels |
| Element bounds incorrect at 150% DPI | Win11 | Open | Apply DPI scaling factor |

### Graphics Issues

| Issue | Affected GPUs | Status | Workaround |
|-------|---------------|--------|------------|
| Overlay flicker on AMD GPUs | AMD Radeon | Open | Use V-Sync |
| Screen capture black screen (HDR) | All with HDR | Open | Disable HDR or use alt method |
| DXGI access denied in VM | Hyper-V | Open | Use fallback capture method |

### Application Compatibility

| Application | Issue | Status | Workaround |
|-------------|-------|--------|------------|
| Chrome | UIA elements not exposed | Known Limitation | Use accessibility mode |
| VSCode | Electron apps have limited UIA | Known Limitation | Use keyboard shortcuts |
| Metro/UWP apps | Sandboxed, limited access | Known Limitation | Request permissions |
| Admin apps | Requires elevation | By Design | Run AGI Workforce as admin |

## Test Execution Status

Last updated: [Date will be filled during testing]

### Overall Coverage

- **Unit Tests**: 0/150 passing (0%)
- **Integration Tests**: 0/25 passing (0%)
- **Code Coverage**: Not yet measured (Target: >70%)
- **Performance Benchmarks**: Not yet run

### Test Execution Checklist

#### Phase 1: Unit Tests
- [ ] Run `cargo test --lib` successfully
- [ ] Achieve >60% code coverage
- [ ] All clipboard tests pass
- [ ] All keyboard tests pass (non-interactive)
- [ ] All mouse tests pass (non-interactive)
- [ ] All screen capture tests pass
- [ ] All UIA service tests pass
- [ ] All database tests pass

#### Phase 2: Integration Tests
- [ ] Run `cargo test --test '*'` successfully
- [ ] Database integration tests pass
- [ ] Basic workflow tests pass
- [ ] No test regressions

#### Phase 3: Interactive Tests
- [ ] Run `cargo test -- --ignored` in isolated environment
- [ ] Notepad automation workflow passes
- [ ] Keyboard input tests pass
- [ ] Mouse input tests pass
- [ ] Screenshot + OCR workflow passes (with OCR feature)

#### Phase 4: Cross-Environment
- [ ] Tests pass on Windows 10
- [ ] Tests pass on Windows 11
- [ ] Tests pass with 100% DPI
- [ ] Tests pass with 150% DPI
- [ ] Tests pass with 200% DPI (known issues acceptable)
- [ ] Tests pass on single monitor
- [ ] Tests pass on dual monitor setup

#### Phase 5: Performance
- [ ] Run `cargo bench` successfully
- [ ] Screen capture <200ms (1080p)
- [ ] UIA operations <100ms
- [ ] Clipboard operations <10ms
- [ ] OCR processing <5s (with OCR feature)

#### Phase 6: CI/CD
- [ ] GitHub Actions workflow runs successfully
- [ ] Code coverage report generated
- [ ] Benchmarks tracked over time
- [ ] No flaky tests

## Success Criteria

Milestone is complete when:

- [ ] >70% code coverage achieved
- [ ] All unit tests pass on Windows 10 and 11
- [ ] All integration tests pass
- [ ] Performance benchmarks meet targets
- [ ] CI/CD pipeline green
- [ ] Test documentation complete
- [ ] Known issues documented
- [ ] Zero test regressions

## Notes for Testers

1. **Run safe tests first**: `cargo test --lib`
2. **Check coverage**: Use tarpaulin or similar
3. **Run interactive tests in isolation**: Use VM or dedicated test machine
4. **Document failures**: Include OS version, DPI, resolution, GPU
5. **Performance varies**: Benchmarks are relative, not absolute
6. **OCR requires Tesseract**: Install from https://github.com/tesseract-ocr/tesseract
7. **Admin tests**: Some tests may require admin elevation
