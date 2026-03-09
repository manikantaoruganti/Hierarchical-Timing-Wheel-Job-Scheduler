const schedulerService = require('../services/schedulerService');
const logger = require('../utils/logger');

let intervalId = null;
const TICK_INTERVAL_MS = 1000; // 1 second

function start() {
  if (intervalId) {
    logger.warn('Ticker is already running.');
    return;
  }

  const timingWheel = schedulerService.getTimingWheel();
  if (!timingWheel) {
    logger.error('Timing wheel not initialized. Cannot start ticker.');
    return;
  }

  logger.info(`Starting timing wheel ticker with ${TICK_INTERVAL_MS / 1000} second interval.`);
  intervalId = setInterval(() => {
    try {
      timingWheel.tick();
    } catch (error) {
      logger.error('Error during timing wheel tick:', error);
    }
  }, TICK_INTERVAL_MS);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Timing wheel ticker stopped.');
  } else {
    logger.warn('Ticker is not running.');
  }
}

module.exports = {
  start,
  stop,
};
