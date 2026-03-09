# Hierarchical Timing Wheel Job Scheduler

This project implements a production-grade, highly efficient job scheduler using a custom-built hierarchical timing wheel. It's designed for scheduling tasks with varying delays, supporting both one-time and recurring executions, and ensuring O(1) complexity for scheduling and cancellation operations.

## Project Overview

The scheduler is built with Node.js and Express, using PostgreSQL for persistent storage. It leverages a multi-level timing wheel to manage tasks, providing a robust and scalable solution for time-based event triggering.

### Key Features:
- **O(1) Scheduling & Cancellation:** Achieved through the timing wheel's design and a `taskId` to `TaskNode` map.
- **Persistence:** Tasks are stored in PostgreSQL, allowing the scheduler to recover and resume operations after restarts.
- **Hierarchical Timing Wheel:** A 3-level wheel (seconds, minutes, hours) efficiently manages tasks across different time granularities.
- **Webhook Delivery:** Executes scheduled tasks by sending POST requests to specified callback URLs with retry logic.
- **API Endpoints:** Provides a RESTful API for scheduling, canceling, and querying scheduler statistics.
- **Dockerized:** Easy deployment and management using Docker and Docker Compose.

## Timing Wheel Architecture

The core of this scheduler is a 3-level hierarchical timing wheel:

1.  **Seconds Wheel:** 60 slots, 1-second resolution.
2.  **Minutes Wheel:** 60 slots, 60-second resolution.
3.  **Hours Wheel:** 24 slots, 3600-second resolution.

Each wheel level consists of an array of "buckets," where each bucket holds a linked list of `TaskNode` objects. A global `Map` stores `taskId` to `TaskNode` mappings, enabling O(1) access for cancellation.

The `tick()` mechanism, executed every second, advances the seconds wheel. When a bucket's tasks are due, they are executed. If a wheel completes a full rotation, its tasks are "cascaded" to the next higher-level wheel, effectively moving tasks from coarser-grained buckets to finer-grained ones as their execution time approaches.

## API Documentation

All API endpoints return JSON responses.

### 1. Schedule a Task

Schedules a new task for execution.

-   **Endpoint:** `POST /tasks`
-   **Body:**
    ```json
    {
      "taskId": "unique-task-id-123",
      "delaySeconds": 5,
      "callbackUrl": "http://localhost:9090/webhook",
      "payload": { "message": "Hello from scheduler" },
      "isRecurring": false,
      "intervalSeconds": 0
    }
    ```
    -   `taskId`: (string, required) A unique identifier for the task.
    -   `delaySeconds`: (number, required) The delay in seconds before the task should execute.
    -   `callbackUrl`: (string, required) The URL to which a POST request will be sent upon task execution.
    -   `payload`: (object, optional) Arbitrary JSON data to be sent with the webhook.
    -   `isRecurring`: (boolean, optional, default `false`) If `true`, the task will reschedule itself after execution.
    -   `intervalSeconds`: (number, optional) Required if `isRecurring` is `true`. The interval in seconds for recurring tasks.
-   **Response (201 Created):**
    ```json
    {
      "taskId": "unique-task-id-123",
      "executionTime": "2025-01-01T12:00:05.000Z"
    }
    ```

### 2. Cancel a Task

Cancels a scheduled task.

-   **Endpoint:** `DELETE /tasks/{taskId}`
-   **Response:**
    -   `204 No Content`: Task successfully canceled.
    -   `404 Not Found`: Task with the given `taskId` does not exist.

### 3. Get Scheduler Statistics

Retrieves current statistics about the scheduler and the timing wheel.

-   **Endpoint:** `GET /stats`
-   **Response (200 OK):**
    ```json
    {
      "totalTasks": 10,
      "wheelStats": {
        "hours": {
          "total": 1,
          "slots": [
            { "slot": 0, "count": 1 }
          ]
        },
        "minutes": {
          "total": 3,
          "slots": [
            { "slot": 5, "count": 1 },
            { "slot": 10, "count": 2 }
          ]
        },
        "seconds": {
          "total": 6,
          "slots": [
            { "slot": 1, "count": 2 },
            { "slot": 30, "count": 4 }
          ]
        }
      }
    }
    ```

## Example cURL Commands

### Schedule a one-time task
```bash
curl -X POST http://localhost:8080/tasks \
     -H "Content-Type: application/json" \
     -d '{
           "taskId": "my-one-time-task-1",
           "delaySeconds": 10,
           "callbackUrl": "http://localhost:9090/webhook",
           "payload": { "event": "order_processed", "orderId": "XYZ789" }
         }'
```

### Schedule a recurring task
```bash
curl -X POST http://localhost:8080/tasks \
     -H "Content-Type: application/json" \
     -d '{
           "taskId": "my-recurring-task-2",
           "delaySeconds": 5,
           "callbackUrl": "http://localhost:9090/webhook",
           "payload": { "metric": "cpu_usage" },
           "isRecurring": true,
           "intervalSeconds": 15
         }'
```

### Cancel a task
```bash
curl -X DELETE http://localhost:8080/tasks/my-one-time-task-1
```

### Get stats
```bash
curl http://localhost:8080/stats
```

## Docker Instructions

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd scheduler-timing-wheel
    ```

2.  **Create `.env` file:**
    Copy `.env.example` to `.env` and adjust variables if necessary.
    ```bash
    cp .env.example .env
    ```

3.  **Build and run with Docker Compose:**
    ```bash
    docker-compose up --build
    ```
    This will:
    -   Build the Node.js application image.
    -   Start a PostgreSQL container.
    -   Initialize the PostgreSQL database with the `tasks` table.
    -   Start the Node.js application container, waiting for the database to be healthy.

4.  **Access the API:**
    The API will be available at `http://localhost:8080`.

5.  **Stop the services:**
    ```bash
    docker-compose down
    ```

## Persistence Strategy

The scheduler employs a robust persistence strategy to ensure task reliability and system resilience:

1.  **On Scheduling:** When a new task is submitted via the API, it is first saved to the PostgreSQL `tasks` table. Only after successful database persistence is the task inserted into the in-memory hierarchical timing wheel. This ensures that no task is lost if the application crashes immediately after being scheduled.

2.  **On Startup/Recovery:**
    -   Upon application startup, the `persistenceService` queries the PostgreSQL database to retrieve all tasks that are currently marked as pending (i.e., `is_completed` is false, though not explicitly in schema, we infer from `scheduled_at` and `is_recurring`).
    -   For each loaded task, the scheduler calculates its remaining delay until its `scheduled_at` time.
    -   If the `scheduled_at` time is in the future, the task is re-inserted into the hierarchical timing wheel.
    -   If the `scheduled_at` time has already passed (e.g., due to a long downtime), the task is immediately executed by the `webhookService`. This ensures that no tasks are missed due to system restarts.

3.  **Task Completion/Cancellation:**
    -   When a one-time task is executed, it is removed from the timing wheel and marked as completed in the database (or deleted, depending on retention policy; for this project, we'll delete it for simplicity after execution).
    -   When a recurring task is executed, it is re-scheduled in the timing wheel for its next interval, and its `scheduled_at` time is updated in the database.
    -   When a task is canceled via the API, it is removed from both the timing wheel and the database.

This dual-storage approach (in-memory timing wheel for active scheduling and PostgreSQL for durable storage) provides both high performance and fault tolerance.

## Benchmark Summary

The hierarchical timing wheel offers significant performance advantages over traditional scheduling mechanisms like min-heaps, especially for large numbers of tasks and frequent operations.

-   **Scheduling Performance:** O(1) for timing wheels vs. O(log n) for min-heaps. This means adding a task takes constant time regardless of the number of existing tasks.
-   **Cancellation Performance:** O(1) for timing wheels (with a `taskId` map) vs. O(log n) for min-heaps (if the task's position is known, otherwise O(n) to find it).
-   **Tick Processing Performance:** O(k) for timing wheels (where k is the number of tasks in the current bucket) vs. O(log n) for min-heaps (to extract the minimum). In sparse scenarios, k is often very small, making timing wheels highly efficient.

For a detailed benchmark methodology and comparison, refer to `benchmark.md`.
