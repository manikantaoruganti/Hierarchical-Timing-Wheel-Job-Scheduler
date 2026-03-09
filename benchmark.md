# Hierarchical Timing Wheel Job Scheduler Benchmarks

This document outlines the methodology and expected performance characteristics when comparing a Hierarchical Timing Wheel (HTW) against a Min-Heap Priority Queue for job scheduling.

## Methodology

To accurately benchmark the performance, we would typically conduct the following tests:

1.  **Setup:**
    *   **Environment:** Dedicated test environment with consistent hardware resources (CPU, RAM, Disk I/O).
    *   **Task Generation:** Generate a large dataset of synthetic tasks with varying `delaySeconds` (e.g., uniformly distributed across a few minutes to several hours).
    *   **Implementations:**
        *   **Hierarchical Timing Wheel:** The custom implementation provided in this project.
        *   **Min-Heap Priority Queue:** A standard min-heap implementation where tasks are prioritized by their `scheduled_at` timestamp.

2.  **Benchmark Scenarios:**

    *   **Scheduling Performance (Insertion):**
        *   Measure the average time taken to schedule `N` tasks (e.g., N = 1k, 10k, 100k, 1M).
        *   Record the time for each insertion and calculate the average.
        *   Plot average insertion time vs. `N`.

    *   **Cancellation Performance (Deletion):**
        *   Schedule `N` tasks.
        *   Randomly select `M` tasks (e.g., M = N/2) and measure the average time to cancel them.
        *   Record the time for each cancellation and calculate the average.
        *   Plot average cancellation time vs. `N`.

    *   **Tick Processing Performance (Execution/Extraction):**
        *   Schedule `N` tasks such that a certain percentage (e.g., 1%, 5%, 10%) are due within a single "tick" interval.
        *   Measure the time taken for a single `tick()` operation (for HTW) or `extractMin()` followed by re-insertion for recurring tasks (for Min-Heap).
        *   Plot average tick processing time vs. `N` and vs. `k` (number of tasks due in a tick).

    *   **Memory Usage:** Monitor memory consumption for both implementations as `N` increases.

## Benchmark Comparison: Hierarchical Timing Wheel vs. Min-Heap Priority Queue

### Theoretical Complexity

| Operation           | Hierarchical Timing Wheel (HTW) | Min-Heap Priority Queue |
| :------------------ | :------------------------------ | :---------------------- |
| **Schedule Task**   | O(1)                            | O(log n)                |
| **Cancel Task**     | O(1) (with `taskId` map)        | O(log n) (if node ref) / O(n) (if search) |
| **Tick Processing** | O(k) (k = tasks in current bucket) | O(log n) (extract min)  |

### Explanation of O(1) vs O(log n)

#### Hierarchical Timing Wheel (HTW)

The HTW achieves O(1) complexity for scheduling and cancellation due to its unique structure:

*   **Scheduling (O(1)):**
    1.  **Calculate Slot:** Given a task's `delaySeconds`, the HTW directly calculates which bucket in which wheel level the task belongs to. This is a constant-time arithmetic operation.
    2.  **Insert into Bucket:** Each bucket is a simple linked list. Inserting a new task at the tail of a linked list is an O(1) operation.
    3.  **Map Storage:** A global `Map<taskId, TaskNode>` stores a direct reference to the `TaskNode` object. This lookup is O(1) on average.

*   **Cancellation (O(1)):**
    1.  **Lookup TaskNode:** Using the `taskId`, the `TaskNode` is retrieved from the global `Map` in O(1) time.
    2.  **Remove from Bucket:** The `TaskNode` contains pointers to its `prev` and `next` nodes within its bucket's linked list. Removing a node from a linked list when you have a direct reference to it is an O(1) operation.

*   **Tick Processing (O(k)):**
    1.  **Advance Pointer:** The `tick()` operation simply advances a pointer to the next slot in the current wheel (e.g., seconds wheel). This is O(1).
    2.  **Process Bucket:** All tasks within the current bucket's linked list are processed. If there are `k` tasks in that bucket, this takes O(k) time. In a well-distributed timing wheel, `k` is typically very small, making this highly efficient.
    3.  **Cascading:** Cascading tasks from higher-level wheels to lower-level wheels also involves processing tasks within specific buckets, again O(k) for the tasks being moved.

#### Min-Heap Priority Queue

A min-heap stores tasks based on their `scheduled_at` timestamp, with the earliest task always at the root.

*   **Scheduling (O(log n)):**
    1.  **Insert:** When a new task is added, it's placed at the end of the heap and then "bubbled up" (heapified) to maintain the heap property. This involves comparing and swapping elements up the tree, taking O(log n) time, where `n` is the number of tasks in the heap.

*   **Cancellation (O(log n) or O(n)):**
    1.  **Find Task:** If you need to cancel a specific task by its ID, you first need to find it in the heap. This can take O(n) time in the worst case if you don't have a direct reference to its position.
    2.  **Delete and Re-heapify:** Once found, deleting an arbitrary node from a heap and then re-heapifying the structure takes O(log n) time. If a map is used to store references to heap nodes, the lookup becomes O(1), but the deletion and re-heapify remain O(log n).

*   **Tick Processing (O(log n)):**
    1.  **Extract Minimum:** To find tasks that are due, the scheduler repeatedly extracts the minimum element (the task with the earliest `scheduled_at`) from the heap. This is an O(log n) operation.
    2.  **Re-insertion (for recurring tasks):** If a task is recurring, it must be re-inserted into the heap after execution, which again takes O(log n).

### Expected Performance Graphs (Conceptual)

#### Scheduling Performance (Time vs. Number of Tasks)

```
  ^ Time (ms)
  |
  |    HTW (O(1))
  |    +----------------------------------------------------
  |   /
  |  /
  | /
  |/
  +-----------------------------------------------------> N (Number of Tasks)
                                          Min-Heap (O(log n))
```
*   **HTW:** The time taken for scheduling remains relatively constant, regardless of the total number of tasks.
*   **Min-Heap:** The time taken for scheduling increases logarithmically with the number of tasks.

#### Cancellation Performance (Time vs. Number of Tasks)

```
  ^ Time (ms)
  |
  |    HTW (O(1))
  |    +----------------------------------------------------
  |   /
  |  /
  | /
  |/
  +-----------------------------------------------------> N (Number of Tasks)
                                          Min-Heap (O(log n))
```
*   **HTW:** Cancellation time is constant due to direct lookup and linked list removal.
*   **Min-Heap:** Cancellation time increases logarithmically (assuming direct node reference) or linearly (if searching).

#### Tick Processing Performance (Time vs. Tasks Due in Tick)

```
  ^ Time (ms)
  |
  |    HTW (O(k))
  |    +----------------------------------------------------
  |   /
  |  /
  | /
  |/
  +-----------------------------------------------------> k (Tasks Due in Tick)
                                          Min-Heap (O(log n) per task)
```
*   **HTW:** The time taken for a tick is proportional to `k`, the number of tasks actually due in that specific second. If `k` is small (which is common in sparse scheduling), this is very fast.
*   **Min-Heap:** Each task extracted from the heap takes O(log n). If multiple tasks are due, this operation is repeated, leading to `k * O(log n)`.

### Conclusion

The Hierarchical Timing Wheel is superior for job scheduling scenarios requiring high throughput for scheduling, cancellation, and efficient processing of tasks that are due. Its O(1) characteristics make it highly scalable, as performance does not degrade significantly with an increasing number of scheduled tasks, unlike min-heap based approaches which suffer from logarithmic (or even linear) performance degradation.
