const db = require('../config/database');
const logger = require('../utils/logger');

async function saveTask(task) {
  const { id, scheduled_at, callback_url, payload, is_recurring, interval_seconds } = task;
  const query = `
    INSERT INTO tasks (id, scheduled_at, callback_url, payload, is_recurring, interval_seconds)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      scheduled_at = EXCLUDED.scheduled_at,
      callback_url = EXCLUDED.callback_url,
      payload = EXCLUDED.payload,
      is_recurring = EXCLUDED.is_recurring,
      interval_seconds = EXCLUDED.interval_seconds
    RETURNING *;
  `;
  const values = [id, scheduled_at, callback_url, payload, is_recurring, interval_seconds];
  try {
    const res = await db.query(query, values);
    return res.rows[0];
  } catch (error) {
    logger.error(`Error saving task ${id} to DB:`, error);
    throw error;
  }
}

async function deleteTask(taskId) {
  const query = 'DELETE FROM tasks WHERE id = $1 RETURNING id;';
  try {
    const res = await db.query(query, [taskId]);
    return res.rows.length > 0;
  } catch (error) {
    logger.error(`Error deleting task ${taskId} from DB:`, error);
    throw error;
  }
}

async function loadPendingTasks() {
  // Load all tasks that are either recurring or have a future scheduled_at
  // For simplicity, we'll load all tasks and let the scheduler decide if they are past due.
  const query = `
    SELECT id, scheduled_at, callback_url, payload, is_recurring, interval_seconds
    FROM tasks;
  `;
  try {
    const res = await db.query(query);
    return res.rows;
  } catch (error) {
    logger.error('Error loading pending tasks from DB:', error);
    throw error;
  }
}

async function updateTaskScheduledAt(taskId, newScheduledAt) {
  const query = `
    UPDATE tasks
    SET scheduled_at = $2
    WHERE id = $1
    RETURNING *;
  `;
  try {
    const res = await db.query(query, [taskId, newScheduledAt]);
    return res.rows[0];
  } catch (error) {
    logger.error(`Error updating scheduled_at for task ${taskId} in DB:`, error);
    throw error;
  }
}

module.exports = {
  saveTask,
  deleteTask,
  loadPendingTasks,
  updateTaskScheduledAt,
};
