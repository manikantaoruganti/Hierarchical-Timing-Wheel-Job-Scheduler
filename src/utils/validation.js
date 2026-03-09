const logger = require('./logger');

function validateScheduleTask(req, res, next) {
  const { taskId, delaySeconds, callbackUrl, isRecurring, intervalSeconds } = req.body;

  if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
    logger.warn('Validation error: taskId is required and must be a non-empty string.');
    return res.status(400).json({ error: 'taskId is required and must be a non-empty string.' });
  }
  if (typeof delaySeconds !== 'number' || delaySeconds < 0) {
    logger.warn('Validation error: delaySeconds is required and must be a non-negative number.');
    return res.status(400).json({ error: 'delaySeconds is required and must be a non-negative number.' });
  }
  if (!callbackUrl || typeof callbackUrl !== 'string' || !isValidUrl(callbackUrl)) {
    logger.warn('Validation error: callbackUrl is required and must be a valid URL.');
    return res.status(400).json({ error: 'callbackUrl is required and must be a valid URL.' });
  }
  if (typeof isRecurring !== 'boolean' && isRecurring !== undefined) {
    logger.warn('Validation error: isRecurring must be a boolean if provided.');
    return res.status(400).json({ error: 'isRecurring must be a boolean if provided.' });
  }
  if (isRecurring && (typeof intervalSeconds !== 'number' || intervalSeconds <= 0)) {
    logger.warn('Validation error: intervalSeconds is required and must be a positive number for recurring tasks.');
    return res.status(400).json({ error: 'intervalSeconds is required and must be a positive number for recurring tasks.' });
  }

  next();
}

function validateTaskId(req, res, next) {
  const { taskId } = req.params;
  if (!taskId || typeof taskId !== 'string' || taskId.trim() === '') {
    logger.warn('Validation error: taskId parameter is required and must be a non-empty string.');
    return res.status(400).json({ error: 'taskId parameter is required and must be a non-empty string.' });
  }
  next();
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  validateScheduleTask,
  validateTaskId,
};
