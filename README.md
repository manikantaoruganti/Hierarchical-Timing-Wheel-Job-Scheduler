# Hierarchical Timing Wheel Job Scheduler

A **production-grade job scheduler** built using a **Hierarchical Timing Wheel** architecture. It efficiently schedules and executes delayed and recurring tasks with **O(1) scheduling and cancellation complexity**.

The system is built with:

* **Node.js + Express**
* **PostgreSQL** for durable persistence
* **Docker & Docker Compose** for deployment

It executes scheduled jobs by sending **webhook POST requests** to configured callback URLs.

---

# Table of Contents

1. Project Overview
2. Key Features
3. Architecture
4. Timing Wheel Design
5. API Documentation
6. Example cURL Commands
7. Docker Setup
8. Persistence Strategy
9. Benchmark Summary

---

# Project Overview

This scheduler is designed to handle **large volumes of delayed tasks efficiently**. Instead of traditional scheduling structures like priority queues or min-heaps, it uses a **Hierarchical Timing Wheel** which provides **constant-time operations** for task scheduling and cancellation.

The system supports:

* One-time delayed jobs
* Recurring jobs
* Persistent storage and recovery
* Webhook-based task execution
* Real-time scheduler statistics

---

# Key Features

### O(1) Scheduling and Cancellation

Tasks are inserted into timing wheel buckets, allowing constant-time operations regardless of task count.

### Persistent Storage

Tasks are stored in **PostgreSQL**, enabling system recovery after crashes or restarts.

### Hierarchical Timing Wheel

A **3-level timing wheel** efficiently handles different delay ranges.

### Webhook Execution

Tasks trigger **HTTP POST requests** to specified callback URLs.

### REST API

Full API for scheduling, canceling, and monitoring tasks.

### Dockerized Deployment

Easy setup and deployment using **Docker Compose**.

---

# Architecture

The scheduler consists of several core components:

```
Client/API Request
        │
        ▼
 Express REST API
        │
        ▼
 Persistence Layer (PostgreSQL)
        │
        ▼
 Hierarchical Timing Wheel (In-Memory)
        │
        ▼
 Tick Processor (Runs Every Second)
        │
        ▼
 Webhook Service
        │
        ▼
 External Callback URL
```

### Core Components

| Component                  | Responsibility                             |
| -------------------------- | ------------------------------------------ |
| **API Layer**              | Handles scheduling and management requests |
| **Persistence Service**    | Stores tasks in PostgreSQL                 |
| **Timing Wheel Scheduler** | In-memory scheduling system                |
| **Tick Engine**            | Advances wheel every second                |
| **Webhook Service**        | Executes tasks via HTTP POST               |

---

# Timing Wheel Architecture

The scheduler uses a **3-level hierarchical timing wheel**.

| Wheel Level   | Slots | Resolution   | Range        |
| ------------- | ----- | ------------ | ------------ |
| Seconds Wheel | 60    | 1 second     | 0-59 seconds |
| Minutes Wheel | 60    | 60 seconds   | 1-59 minutes |
| Hours Wheel   | 24    | 3600 seconds | 1-23 hours   |

### Internal Structure

Each wheel contains **buckets**, and each bucket contains a **linked list of tasks**.

```
Timing Wheel
 ├── Hours Wheel (24 slots)
 ├── Minutes Wheel (60 slots)
 └── Seconds Wheel (60 slots)
```

Each scheduled task is represented by a **TaskNode** and stored in:

* A **linked list bucket**
* A **global Map**

```
taskId -> TaskNode
```

This enables **O(1) cancellation and lookup**.

---

# Tick Mechanism

A **tick runs every second** and performs the following:

1. Advances the seconds wheel.
2. Executes tasks in the current slot.
3. If the seconds wheel completes a rotation:

   * Cascade tasks from **minutes wheel** to **seconds wheel**.
4. If minutes wheel rotates:

   * Cascade tasks from **hours wheel**.

This cascading moves tasks from **coarse granularity → fine granularity** as execution time approaches.

---

# API Documentation

All endpoints return **JSON responses**.

---

# 1. Schedule a Task

Creates a new scheduled task.

**Endpoint**

```
POST /tasks
```

### Request Body

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

### Parameters

| Field           | Type    | Required    | Description            |
| --------------- | ------- | ----------- | ---------------------- |
| taskId          | string  | yes         | Unique identifier      |
| delaySeconds    | number  | yes         | Delay before execution |
| callbackUrl     | string  | yes         | Webhook endpoint       |
| payload         | object  | no          | JSON payload           |
| isRecurring     | boolean | no          | Recurring task flag    |
| intervalSeconds | number  | conditional | Required if recurring  |

### Response

**201 Created**

```json
{
  "taskId": "unique-task-id-123",
  "executionTime": "2025-01-01T12:00:05.000Z"
}
```

---

# 2. Cancel a Task

Cancels a scheduled task.

**Endpoint**

```
DELETE /tasks/{taskId}
```

### Responses

| Status | Meaning                    |
| ------ | -------------------------- |
| 204    | Task canceled successfully |
| 404    | Task not found             |

---

# 3. Get Scheduler Statistics

Retrieves runtime stats of the scheduler.

**Endpoint**

```
GET /stats
```

### Example Response

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

---

# Example cURL Commands

### Schedule a One-Time Task

```bash
curl -X POST http://localhost:8080/tasks \
-H "Content-Type: application/json" \
-d '{
  "taskId": "my-one-time-task-1",
  "delaySeconds": 10,
  "callbackUrl": "http://localhost:9090/webhook",
  "payload": {
    "event": "order_processed",
    "orderId": "XYZ789"
  }
}'
```

---

### Schedule a Recurring Task

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

---

### Cancel a Task

```bash
curl -X DELETE http://localhost:8080/tasks/my-one-time-task-1
```

---

### Get Scheduler Stats

```bash
curl http://localhost:8080/stats
```

---

# Docker Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd scheduler-timing-wheel
```

---

### 2. Create Environment File

```bash
cp .env.example .env
```

Modify environment variables if required.

---

### 3. Start Services

```bash
docker-compose up --build
```

This will:

* Build the Node.js application
* Start PostgreSQL
* Initialize the database
* Start the scheduler service

---

### 4. Access API

```
http://localhost:8080
```

---

### 5. Stop Services

```bash
docker-compose down
```

---

# Persistence Strategy

The system ensures **task reliability and crash recovery**.

## 1. Task Scheduling

When a task is scheduled:

1. Task is saved to **PostgreSQL**
2. After successful save, it is inserted into the **timing wheel**

This prevents task loss during crashes.

---

## 2. Startup Recovery

On application startup:

1. Load all **pending tasks** from PostgreSQL.
2. Calculate remaining delay.
3. If execution time is **in the future**:

   * Reinsert into timing wheel.
4. If execution time **already passed**:

   * Execute immediately.

This guarantees **no tasks are missed**.

---

## 3. Task Completion

### One-time tasks

* Executed
* Removed from timing wheel
* Deleted from database

### Recurring tasks

* Executed
* Rescheduled
* `scheduled_at` updated in database

### Cancelled tasks

* Removed from timing wheel
* Deleted from database

---

# Benchmark Summary

Hierarchical timing wheels provide **significant performance advantages** over traditional schedulers.

| Operation       | Timing Wheel | Min Heap |
| --------------- | ------------ | -------- |
| Schedule Task   | **O(1)**     | O(log n) |
| Cancel Task     | **O(1)**     | O(log n) |
| Tick Processing | **O(k)**     | O(log n) |

Where:

* **n** = total tasks
* **k** = tasks in current bucket

Since buckets are usually small, **tick processing is extremely fast**.
