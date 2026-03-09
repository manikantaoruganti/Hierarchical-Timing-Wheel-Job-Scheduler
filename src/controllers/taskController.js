const schedulerService = require('../services/schedulerService');
const logger = require('../utils/logger');

async function scheduleTask(req, res, next) {
  try {
    const { taskId, delaySeconds, callbackUrl, payload, isRecurring, intervalSeconds } = req.body;

    const scheduledTask = await schedulerService.scheduleTask({
      id: taskId,
      delaySeconds,
      callbackUrl,
      payload,
      isRecurring: isRecurring || false,
      intervalSeconds: isRecurring ? (intervalSeconds || 0) : 0,
    });

    res.status(201).json({
      taskId: scheduledTask.id,
      executionTime: scheduledTask.scheduled_at.toISOString(),
    });
  } catch (error) {
    logger.error(`Error scheduling task ${req.body.taskId}:`, error);
    if (error.message.includes('duplicate key')) {
      return res.status(409).json({ error: `Task with ID '${req.body.taskId}' already exists.` });
    }
    next(error);
  }
}

async function cancelTask(req, res, next) {
  try {
    const { taskId } = req.params;
    const success = await schedulerService.cancelTask(taskId);

    if (success) {
      res.status(204).send();
    } else {
      res.status(404).json({ error: `Task with ID '${taskId}' not found.` });
    }
  } catch (error) {
    logger.error(`Error canceling task ${req.params.taskId}:`, error);
    next(error);
  }
}

module.exports = {
  scheduleTask,
  cancelTask,
};
