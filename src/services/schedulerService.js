const { v4: uuidv4 } = require('uuid');
const persistenceService = require('./persistenceService');
const webhookService = require('./webhookService');
const HierarchicalTimingWheel = require('../timingwheel/hierarchicalTimingWheel');
const logger = require('../utils/logger');
const { getExecutionTime } = require('../utils/timeUtils');

// Initialize the timing wheel
const timingWheel = new HierarchicalTimingWheel();

async function initialize() {
  logger.info('Initializing scheduler: Loading pending tasks from database...');
  const pendingTasks = await persistenceService.loadPendingTasks();
  let executedImmediatelyCount = 0;

  for (const task of pendingTasks) {
    const now = Date.now();
    const scheduledAtMs = task.scheduled_at.getTime();

    if (scheduledAtMs <= now) {
      // Task is past due, execute immediately
      logger.warn(`Task ${task.id} is past due (scheduled for ${task.scheduled_at.toISOString()}). Executing immediately.`);
      webhookService.sendWebhook(task);
      executedImmediatelyCount++;
      // For recurring tasks, we re-schedule them from now
      if (task.is_recurring && task.interval_seconds > 0) {
        const nextScheduledAt = new Date(now + task.interval_seconds * 1000);
        await persistenceService.updateTaskScheduledAt(task.id, nextScheduledAt);
        timingWheel.scheduleTask({ ...task, scheduled_at: nextScheduledAt });
      } else {
        // One-time past-due tasks are considered done after immediate execution
        await persistenceService.deleteTask(task.id);
      }
    } else {
      // Task is in the future, schedule normally
      timingWheel.scheduleTask(task);
    }
  }
  logger.info(`Scheduler initialized. Loaded ${pendingTasks.length} tasks. ${executedImmediatelyCount} tasks executed immediately.`);
}

async function scheduleTask(taskData) {
  const taskId = taskData.id || uuidv4();
  const scheduledAt = getExecutionTime(taskData.delaySeconds);

  const task = {
    id: taskId,
    scheduled_at: scheduledAt,
    callback_url: taskData.callbackUrl,
    payload: taskData.payload || {},
    is_recurring: taskData.isRecurring,
    interval_seconds: taskData.intervalSeconds,
  };

  // 1. Save to PostgreSQL
  await persistenceService.saveTask(task);
  logger.info(`Task ${task.id} saved to DB, scheduled for ${task.scheduled_at.toISOString()}`);

  // 2. Insert into timing wheel
  timingWheel.scheduleTask(task);
  logger.info(`Task ${task.id} inserted into timing wheel.`);

  return task;
}

async function cancelTask(taskId) {
  // 1. Remove from timing wheel
  const removed = timingWheel.cancelTask(taskId);

  if (removed) {
    // 2. Delete from PostgreSQL
    await persistenceService.deleteTask(taskId);
    logger.info(`Task ${taskId} canceled and removed from DB.`);
    return true;
  }
  logger.warn(`Attempted to cancel task ${taskId}, but it was not found.`);
  return false;
}

function getSchedulerStats() {
  return timingWheel.getStats();
}

// Export the timing wheel instance for the ticker to use
function getTimingWheel() {
  return timingWheel;
}

module.exports = {
  initialize,
  scheduleTask,
  cancelTask,
  getSchedulerStats,
  getTimingWheel,
};
