const schedulerService = require('../services/schedulerService');
const logger = require('../utils/logger');

async function getStats(req, res, next) {
  try {
    const stats = schedulerService.getSchedulerStats();
    res.status(200).json(stats);
  } catch (error) {
    logger.error('Error getting scheduler stats:', error);
    next(error);
  }
}

module.exports = {
  getStats,
};
