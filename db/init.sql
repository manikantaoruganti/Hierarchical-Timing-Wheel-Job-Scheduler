CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(255) PRIMARY KEY,
    scheduled_at TIMESTAMPTZ NOT NULL,
    callback_url VARCHAR(2048) NOT NULL,
    payload JSONB,
    is_recurring BOOLEAN DEFAULT FALSE,
    interval_seconds INTEGER
);

-- Add an index for faster lookup of pending tasks
CREATE INDEX IF NOT EXISTS idx_tasks_scheduled_at ON tasks (scheduled_at);
