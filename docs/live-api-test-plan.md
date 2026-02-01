# Google Live API Test Plan

## Unit Tests

### Configuration Tests

- ✅ `test_default_session_config` - Verify default configuration values
- ✅ `test_speech_config_defaults` - Verify speech configuration defaults
- ✅ `test_tool_config_defaults` - Verify tool configuration defaults
- ✅ `test_ephemeral_token_config` - Verify ephemeral token configuration

### Serialization Tests

- ✅ `test_voice_serialization` - Voice enum serialization to JSON
- ✅ `test_modality_serialization` - Modality enum serialization
- ✅ `test_client_message_serialization` - Client message formatting

### Provider Tests

- ✅ `test_provider_creation` - GoogleLiveApiProvider instantiation
- ✅ `test_connection_state` - Connection state management
- ✅ `test_provider_capabilities` - LLMProvider trait implementation

## Integration Tests

### Connection Tests

- [ ] `test_connect_success` - Successful WebSocket connection
- [ ] `test_connect_timeout` - Connection timeout handling
- [ ] `test_connect_invalid_key` - Invalid API key handling
- [ ] `test_disconnect_graceful` - Graceful disconnection with GoAway
- [ ] `test_reconnect_automatic` - Automatic reconnection on failure

### Session Management Tests

- [ ] `test_session_setup` - Session setup flow
- [ ] `test_session_resumption` - Resume with token
- [ ] `test_resumption_token_request` - Request resumption token
- [ ] `test_resumption_token_expiry` - Expired token handling
- [ ] `test_session_timeout` - Session timeout after 15 minutes

### Audio Streaming Tests

- [ ] `test_send_audio_chunk` - Send audio data
- [ ] `test_receive_audio_chunk` - Receive audio data
- [ ] `test_audio_transcription_input` - Input transcription
- [ ] `test_audio_transcription_output` - Output transcription
- [ ] `test_audio_format_16khz` - 16kHz input format validation
- [ ] `test_audio_format_24khz` - 24kHz output format validation

### Text Messaging Tests

- [ ] `test_send_text_message` - Send text content
- [ ] `test_receive_text_message` - Receive text content
- [ ] `test_turn_complete_flag` - Turn completion signaling

### Function Calling Tests

- [ ] `test_function_call_received` - Receive function call
- [ ] `test_function_response_sent` - Send function response
- [ ] `test_function_call_cancellation` - Handle cancellation
- [ ] `test_google_search_grounding` - Google Search integration
- [ ] `test_async_function_calling` - Non-blocking execution
- [ ] `test_function_scheduling_interrupt` - INTERRUPT mode
- [ ] `test_function_scheduling_when_idle` - WHEN_IDLE mode

### Voice Activity Detection Tests

- [ ] `test_vad_automatic` - Automatic VAD mode
- [ ] `test_vad_manual` - Manual VAD mode
- [ ] `test_vad_off` - Disabled VAD mode

### Multimodal Tests

- [ ] `test_text_only_mode` - Text-only session
- [ ] `test_audio_only_mode` - Audio-only session
- [ ] `test_text_audio_mode` - Text + Audio session
- [ ] `test_text_audio_video_mode` - Full multimodal session

### Error Handling Tests

- [ ] `test_error_event_handling` - Error event processing
- [ ] `test_network_error_recovery` - Network failure recovery
- [ ] `test_invalid_message_handling` - Malformed message handling
- [ ] `test_rate_limit_handling` - Rate limit error handling

### Context Compression Tests

- [ ] `test_sliding_window_compression` - Sliding window mode
- [ ] `test_token_trigger_compression` - Token threshold trigger
- [ ] `test_compression_disabled` - No compression mode

### Security Tests

- [ ] `test_ephemeral_token_generation` - Generate ephemeral token
- [ ] `test_ephemeral_token_expiry` - Token expiration
- [ ] `test_config_locking` - Config lock validation

## Performance Tests

### Latency Tests

- [ ] `test_round_trip_latency` - Measure end-to-end latency
- [ ] `test_audio_streaming_latency` - Audio chunk latency
- [ ] `test_function_call_latency` - Function call round-trip

### Throughput Tests

- [ ] `test_audio_chunk_throughput` - Audio chunks per second
- [ ] `test_text_message_throughput` - Text messages per second
- [ ] `test_concurrent_operations` - Multiple operations in parallel

### Resource Tests

- [ ] `test_memory_usage` - Memory consumption
- [ ] `test_cpu_usage` - CPU utilization
- [ ] `test_connection_pool` - Multiple connections

## Stress Tests

### Load Tests

- [ ] `test_long_session` - 15-minute session
- [ ] `test_high_message_volume` - Many messages rapidly
- [ ] `test_large_audio_chunks` - Large audio buffers
- [ ] `test_many_function_calls` - High function call rate

### Reliability Tests

- [ ] `test_reconnection_stability` - Repeated reconnections
- [ ] `test_network_interruption` - Simulated network failures
- [ ] `test_heartbeat_mechanism` - Heartbeat ping/pong
- [ ] `test_graceful_degradation` - Partial failure handling

## End-to-End Tests

### Voice Assistant Test

```rust
#[tokio::test]
async fn test_voice_assistant_e2e() {
    // 1. Connect
    // 2. Send audio
    // 3. Receive audio response
    // 4. Verify transcription
    // 5. Disconnect
}
```

### Function Calling Test

```rust
#[tokio::test]
async fn test_function_calling_e2e() {
    // 1. Connect with tools
    // 2. Send query requiring tool
    // 3. Receive function call
    // 4. Execute and respond
    // 5. Receive final answer
}
```

### Session Resumption Test

```rust
#[tokio::test]
async fn test_session_resumption_e2e() {
    // 1. Connect and chat
    // 2. Request resumption token
    // 3. Disconnect
    // 4. Reconnect
    // 5. Resume with token
    // 6. Continue conversation
}
```

## Test Utilities

### Mock Server

```rust
struct MockLiveApiServer {
    port: u16,
    responses: Vec<ServerMessage>,
}

impl MockLiveApiServer {
    fn new() -> Self { /* ... */ }
    fn add_response(&mut self, msg: ServerMessage) { /* ... */ }
    async fn start(&self) { /* ... */ }
}
```

### Audio Generator

```rust
fn generate_test_audio(duration_secs: f64, sample_rate: u32) -> Vec<u8> {
    // Generate sine wave or silence
}
```

### Event Collector

```rust
async fn collect_events(
    rx: &mut mpsc::UnboundedReceiver<LiveApiEvent>,
    timeout: Duration,
) -> Vec<LiveApiEvent> {
    // Collect all events until timeout
}
```

## Test Coverage Goals

- **Unit Tests**: 95%+ coverage
- **Integration Tests**: All major flows
- **Performance Tests**: Baseline metrics
- **Stress Tests**: Edge cases and limits
- **E2E Tests**: Real-world scenarios

## Running Tests

```bash
# All tests
cargo test google_live_api

# Unit tests only
cargo test google_live_api::tests

# Integration tests
cargo test --test integration_live_api

# With logging
RUST_LOG=debug cargo test google_live_api

# Performance tests
cargo test --release --test perf_live_api

# Single test
cargo test test_default_session_config
```

## Test Data

### Audio Test Files

- `test_audio_16khz_1s.pcm` - 1 second, 16kHz
- `test_audio_24khz_1s.pcm` - 1 second, 24kHz
- `test_silence_1s.pcm` - Silence sample

### Configuration Test Cases

- `config_minimal.json` - Minimal config
- `config_full.json` - All options
- `config_audio_only.json` - Audio-only mode
- `config_multimodal.json` - All modalities

## Continuous Integration

```yaml
# .github/workflows/live-api-tests.yml
name: Live API Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: cargo test google_live_api
        env:
          GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY_TEST }}
```

## Test Metrics

Track over time:

- Test execution time
- Code coverage percentage
- Flaky test rate
- Performance benchmarks

## Test Maintenance

- Review tests quarterly
- Update for API changes
- Add tests for bug fixes
- Remove obsolete tests
- Keep mock data current

---

**Status**: Test plan defined | **Current Coverage**: ~15% (unit tests)
**Target**: 95%+ coverage with full integration suite
