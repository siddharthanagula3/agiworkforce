use super::types::{Priority, Task};
use std::collections::{BinaryHeap, HashMap};
use std::cmp::Ordering;
use tokio::sync::RwLock;

/// Queue item with priority ordering
#[derive(Debug, Clone)]
struct QueueItem {
    task: Task,
    sequence: u64, // For FIFO within same priority
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
        // First compare by priority (higher priority first)
        match self.task.priority.cmp(&other.task.priority) {
            Ordering::Equal => {
                // If same priority, use FIFO (lower sequence first)
                // Note: BinaryHeap is a max-heap, so we reverse the comparison
                other.sequence.cmp(&self.sequence)
            }
            ordering => ordering,
        }
    }
}

/// Priority queue for task scheduling
pub struct TaskQueue {
    heap: RwLock<BinaryHeap<QueueItem>>,
    sequence: RwLock<u64>,
    task_index: RwLock<HashMap<String, Task>>, // For quick lookup
}

impl TaskQueue {
    pub fn new() -> Self {
        Self {
            heap: RwLock::new(BinaryHeap::new()),
            sequence: RwLock::new(0),
            task_index: RwLock::new(HashMap::new()),
        }
    }

    /// Add a task to the queue
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

    /// Get the next highest priority task from the queue
    pub async fn dequeue(&self) -> Option<Task> {
        let mut heap = self.heap.write().await;
        let mut index = self.task_index.write().await;

        if let Some(item) = heap.pop() {
            index.remove(&item.task.id);
            Some(item.task)
        } else {
            None
        }
    }

    /// Peek at the next task without removing it
    pub async fn peek(&self) -> Option<Task> {
        let heap = self.heap.read().await;
        heap.peek().map(|item| item.task.clone())
    }

    /// Get the number of tasks in the queue
    pub async fn len(&self) -> usize {
        let heap = self.heap.read().await;
        heap.len()
    }

    /// Check if the queue is empty
    pub async fn is_empty(&self) -> bool {
        let heap = self.heap.read().await;
        heap.is_empty()
    }

    /// Remove a specific task from the queue
    pub async fn remove(&self, task_id: &str) -> Option<Task> {
        let mut heap = self.heap.write().await;
        let mut index = self.task_index.write().await;

        if let Some(task) = index.remove(task_id) {
            // Rebuild heap without the removed task
            let items: Vec<_> = heap.drain().filter(|item| item.task.id != task_id).collect();
            *heap = items.into_iter().collect();
            Some(task)
        } else {
            None
        }
    }

    /// Get a task by ID without removing it
    pub async fn get(&self, task_id: &str) -> Option<Task> {
        let index = self.task_index.read().await;
        index.get(task_id).cloned()
    }

    /// List all tasks in the queue (unordered)
    pub async fn list_all(&self) -> Vec<Task> {
        let index = self.task_index.read().await;
        index.values().cloned().collect()
    }

    /// Clear all tasks from the queue
    pub async fn clear(&self) {
        let mut heap = self.heap.write().await;
        let mut index = self.task_index.write().await;
        heap.clear();
        index.clear();
    }

    /// Get tasks by priority
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

        // High priority should come first
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

        // Should come out in FIFO order for same priority
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
