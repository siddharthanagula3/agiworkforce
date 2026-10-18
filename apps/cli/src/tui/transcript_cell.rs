//! Lifecycle state of a tool row in the transcript.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TranscriptCellState {
    Running,
    Complete,
    Failed,
    Cancelled,
}
