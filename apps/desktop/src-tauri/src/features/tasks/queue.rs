use super::types::{Priority, Task};
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap, HashSet};
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
struct QueueItem {
    task: Task,
    sequence: u64,
}

impl PartialEq for QueueItem {
    fn eq(&self, other: &Self) -> bool {
        self.task.id == other.task.id
    }
}

impl Eq for QueueItem {}

impl PartialOrd for QueueItem {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueueItem {
    fn cmp(&self, other: &Self) -> Ordering {
        match self.task.priority.cmp(&other.task.priority) {
            Ordering::Equal => other.sequence.cmp(&self.sequence),
            ordering => ordering,
        }
    }
}

// AUDIT-004-004: Added removed_ids set for mark-and-sweep removal pattern
// Previously O(n) per removal due to heap rebuild; now O(1) mark + amortized cleanup
/// Threshold for triggering heap compaction (removed items / total items)
const COMPACTION_THRESHOLD: f64 = 0.25;

pub struct TaskQueue {
    heap: RwLock<BinaryHeap<QueueItem>>,
    sequence: RwLock<u64>,
    task_index: RwLock<HashMap<String, Task>>,
    /// Set of task IDs that have been logically removed but not yet cleaned from heap
    removed_ids: RwLock<HashSet<String>>,
}

impl TaskQueue {
    pub fn new() -> Self {
        Self {
            heap: RwLock::new(BinaryHeap::new()),
            sequence: RwLock::new(0),
            task_index: RwLock::new(HashMap::new()),
            removed_ids: RwLock::new(HashSet::new()),
        }
    }

    pub async fn enqueue(&self, task: Task) -> anyhow::Result<()> {
        let mut heap = self.heap.write().await;
        let mut sequence = self.sequence.write().await;
        let mut index = self.task_index.write().await;

        let item = QueueItem {
            task: task.clone(),
            sequence: *sequence,
        };

        heap.push(item);
        index.insert(task.id.clone(), task);
        *sequence += 1;

        Ok(())
    }

    pub async fn dequeue(&self) -> Option<Task> {
        let mut heap = self.heap.write().await;
        let mut index = self.task_index.write().await;
        let mut removed = self.removed_ids.write().await;

        // Skip over logically removed items (mark-and-sweep pattern)
        while let Some(item) = heap.pop() {
            if removed.remove(&item.task.id) {
                // This item was marked as removed, skip it
                continue;
            }
            index.remove(&item.task.id);
            // Compact heap if too many removed items accumulated
            self.maybe_compact_heap(&mut heap, &mut removed);
            return Some(item.task);
        }

        None
    }

    /// Compact the heap by removing all logically deleted entries
    /// Called when removed_ids exceeds threshold of heap size
    fn maybe_compact_heap(&self, heap: &mut BinaryHeap<QueueItem>, removed: &mut HashSet<String>) {
        if removed.is_empty() {
            return;
        }

        let heap_len = heap.len();
        let removed_len = removed.len();

        // Only compact if removed items exceed threshold
        if heap_len > 0 && (removed_len as f64 / heap_len as f64) > COMPACTION_THRESHOLD {
            let items: Vec<_> = heap
                .drain()
                .filter(|item| !removed.contains(&item.task.id))
                .collect();
            *heap = items.into_iter().collect();
            removed.clear();
        }
    }

    pub async fn peek(&self) -> Option<Task> {
        let heap = self.heap.read().await;
        let removed = self.removed_ids.read().await;

        // Find first non-removed item
        for item in heap.iter() {
            if !removed.contains(&item.task.id) {
                return Some(item.task.clone());
            }
        }
        None
    }

    pub async fn len(&self) -> usize {
        let index = self.task_index.read().await;
        index.len()
    }

    pub async fn is_empty(&self) -> bool {
        let index = self.task_index.read().await;
        index.is_empty()
    }

    // AUDIT-004-004: O(1) removal using mark-and-sweep pattern
    // Previously drained and rebuilt entire heap O(n); now marks for lazy removal O(1)
    pub async fn remove(&self, task_id: &str) -> Option<Task> {
        let mut index = self.task_index.write().await;
        let mut removed = self.removed_ids.write().await;

        if let Some(task) = index.remove(task_id) {
            // Mark as removed; will be cleaned up during dequeue or compaction
            removed.insert(task_id.to_string());
            Some(task)
        } else {
            None
        }
    }

    pub async fn get(&self, task_id: &str) -> Option<Task> {
        let index = self.task_index.read().await;
        index.get(task_id).cloned()
    }

    pub async fn list_all(&self) -> Vec<Task> {
        let index = self.task_index.read().await;
        index.values().cloned().collect()
    }

    pub async fn clear(&self) {
        let mut heap = self.heap.write().await;
        let mut index = self.task_index.write().await;
        let mut removed = self.removed_ids.write().await;
        heap.clear();
        index.clear();
        removed.clear();
    }

    pub async fn get_by_priority(&self, priority: Priority) -> Vec<Task> {
        let index = self.task_index.read().await;
        index
            .values()
            .filter(|task| task.priority == priority)
            .cloned()
            .collect()
    }
}

impl Default for TaskQueue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_priority_ordering() {
        let queue = TaskQueue::new();

        let low = Task::new("Low".to_string(), None, Priority::Low);
        let normal = Task::new("Normal".to_string(), None, Priority::Normal);
        let high = Task::new("High".to_string(), None, Priority::High);

        queue.enqueue(low).await.unwrap();
        queue.enqueue(normal).await.unwrap();
        queue.enqueue(high.clone()).await.unwrap();

        let next = queue.dequeue().await;
        assert!(next.is_some());
        assert_eq!(next.unwrap().id, high.id);
    }

    #[tokio::test]
    async fn test_fifo_within_priority() {
        let queue = TaskQueue::new();

        let task1 = Task::new("Task1".to_string(), None, Priority::Normal);
        let task2 = Task::new("Task2".to_string(), None, Priority::Normal);
        let task3 = Task::new("Task3".to_string(), None, Priority::Normal);

        queue.enqueue(task1.clone()).await.unwrap();
        queue.enqueue(task2.clone()).await.unwrap();
        queue.enqueue(task3).await.unwrap();

        assert_eq!(queue.dequeue().await.unwrap().id, task1.id);
        assert_eq!(queue.dequeue().await.unwrap().id, task2.id);
    }

    #[tokio::test]
    async fn test_remove() {
        let queue = TaskQueue::new();

        let task1 = Task::new("Task1".to_string(), None, Priority::Normal);
        let task2 = Task::new("Task2".to_string(), None, Priority::Normal);

        queue.enqueue(task1.clone()).await.unwrap();
        queue.enqueue(task2.clone()).await.unwrap();

        assert_eq!(queue.len().await, 2);

        queue.remove(&task1.id).await;

        assert_eq!(queue.len().await, 1);
        assert_eq!(queue.dequeue().await.unwrap().id, task2.id);
    }
}
