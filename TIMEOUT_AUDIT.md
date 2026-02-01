# AGI Task Timeout Audit Report

## Current Timeout Configuration

### 1. Background Agent Executor

**File:** `apps/desktop/src-tauri/src/core/agent/background_agent.rs`

| Component             | Current Value                           | Type                 | Location |
| --------------------- | --------------------------------------- | -------------------- | -------- |
| Default Agent Timeout | 5 minutes (300 secs)                    | Constant             | Line 43  |
| Status                | Used for all background agent execution | Applied to all tasks | Line 195 |
| Enforcement           | Hard timeout - fails task on exceeded   | Failure path         | Line 398 |

### 2. Step-Level Timeout

**File:** `apps/desktop/src-tauri/src/core/agent/executor.rs`

| Component         | Current Value           | Type               | Location        |
| ----------------- | ----------------------- | ------------------ | --------------- |
| Step Timeout      | Per-step Duration field | Configurable       | TaskStep struct |
| Command Execution | 30 seconds              | Hardcoded          | Line 142        |
| Wait Timeout      | Configurable            | Per-action         | Line 129        |
| Enforcement       | Timeout error returned  | Non-fatal per step | Line 65         |

### 3. Continuous Executor Configuration

**File:** `apps/desktop/src-tauri/src/core/agent/continuous_executor.rs`

| Component                | Current Value       | Type         | Location |
| ------------------------ | ------------------- | ------------ | -------- |
| Checkpoint Interval      | 5 steps             | Constant     | Line 39  |
| Max Consecutive Failures | 10 failures         | Constant     | Line 42  |
| Base Retry Delay         | 2 seconds           | Constant     | Line 45  |
| Max Retry Delay          | 300 seconds (5 min) | Constant     | Line 48  |
| Daily Token Limit        | 10,000,000 tokens   | Constant     | Line 51  |
| Daily Request Limit      | 10,000 requests     | Constant     | Line 54  |
| Auto-resume on Restart   | true                | Configurable | Field    |
| Deadline                 | Optional            | Configurable | Field    |

### 4. AGI Core Configuration

**File:** `apps/desktop/src-tauri/src/core/agi/mod.rs`

| Component             | Current Value | Type      | Location |
| --------------------- | ------------- | --------- | -------- |
| Max Planning Depth    | 20            | Constant  | Line 127 |
| Max Concurrent Tools  | 10            | Constant  | Line 117 |
| Resource CPU Limit    | 80%           | Hardcoded | Line 122 |
| Resource Memory Limit | 2GB           | Hardcoded | Line 123 |

### 5. Task Execution Model

**File:** `apps/desktop/src-tauri/src/core/agent/mod.rs`

| Component        | Current Value                             | Type            | Location    |
| ---------------- | ----------------------------------------- | --------------- | ----------- |
| TaskStep.timeout | Custom Duration                           | Per-step config | Line 149    |
| Max Retries      | Per-task config                           | Configurable    | Line 69     |
| Task Status      | 8 states (Pending/Planning/Executing/etc) | Enum            | Lines 49-58 |

## Key Findings

### Issues Blocking 30+ Hour Execution

1. **Default Agent Timeout (300 secs)**
   - Problem: Hardcoded 5-minute limit for all background agents
   - Impact: Tasks automatically fail after 5 minutes
   - Solution: Make configurable per-task
   - Criticality: CRITICAL

2. **No Timeout Extension Mechanism**
   - Problem: No way to extend timeout without restarting task
   - Impact: Long operations force restart, losing progress
   - Solution: Implement graceful timeout with warning/extend UI
   - Criticality: HIGH

3. **Limited Progress Persistence**
   - Problem: Checkpointing at 5-step intervals, not durable
   - Impact: System crash loses up to 5 steps of progress
   - Solution: Add persistent checkpoint to SQLite
   - Criticality: HIGH

4. **No Task Resumption After App Restart**
   - Problem: Background agents cleared on app exit
   - Impact: Long tasks lost if app crashes
   - Solution: Implement agent state persistence and resumption
   - Criticality: HIGH

5. **No Timeout Warnings**
   - Problem: Task fails silently when timeout reached
   - Impact: User unaware of timeout approaching
   - Solution: Emit warnings at 1hr, 30min, 5min remaining
   - Criticality: MEDIUM

## Design Requirements for Extended Timeout Support

### Requirements

1. Support timeouts from 1 minute to 72 hours
2. Configurable per-task timeout
3. Persistent checkpoint at every step
4. Graceful timeout handling with user choice
5. Progress tracking and ETA calculation
6. Background task monitoring UI
7. Resumption after app restart
8. Network/system sleep tolerance

### Safety Constraints

- Maintain undo capability for all executed steps
- Resource monitoring (CPU/RAM/Network)
- Daily usage limits still enforced
- User can pause/cancel at any time
- Automatic recovery from failures

## Implementation Plan

### Phase 1: Configuration (Day 1)

- [ ] Extend `AGIConfig` with `max_timeout_secs: u64`
- [ ] Add `timeout_minutes` to settingsStore (default 1440, max 4320)
- [ ] Create `timeout_config.rs` module for constants
- [ ] Add Tauri commands: `get_timeout_config`, `set_timeout_config`

### Phase 2: Background Task Persistence (Day 1-2)

- [ ] Create `background_tasks.rs` module
- [ ] Implement task queue persistence to SQLite
- [ ] Add task state serialization
- [ ] Implement `resume_task_on_restart` logic

### Phase 3: Graceful Timeout Handling (Day 2)

- [ ] Implement `TimeoutManager` trait
- [ ] Add timeout warning emitter at 1hr, 30min, 5min
- [ ] Create user choice dialog (extend/resume later/abort)
- [ ] Store extended timeout to database

### Phase 4: Progress Tracking (Day 2-3)

- [ ] Persistent step-level checkpoints
- [ ] Progress calculation and ETA estimation
- [ ] Database schema for progress storage
- [ ] Progress emission to frontend

### Phase 5: UI Components (Day 3)

- [ ] Background Tasks list component
- [ ] Task status display (running/paused/completed/failed)
- [ ] Time elapsed, ETA, and % complete
- [ ] Start, pause, resume, cancel buttons
- [ ] Task history and completion summary

### Phase 6: Testing & Polish (Day 3-4)

- [ ] Unit tests for timeout manager
- [ ] Integration tests for task resumption
- [ ] Manual testing of 30+ hour scenarios
- [ ] Error handling for edge cases

## Migration Path

Existing tasks will work with new configuration:

- Current tasks: Use `DEFAULT_AGENT_TIMEOUT_SECS` as initial value
- User-specified timeout: Override from settingsStore
- Per-task timeout: Override from goal constraints
- Precedence: Per-task > User setting > Default
