require('dotenv').config();
const app = require('./app');
const { connectDb } = require('./config/database');
const logger = require('./utils/logger');
const schedulerService = require('./services/schedulerService');
const ticker = require('./workers/ticker');

const PORT = process.env.APP_PORT || 8080;

async function startServer() {
  try {
    await connectDb();
    logger.info('Database connected successfully.');

    // Initialize scheduler and load pending tasks
    await schedulerService.initialize();
    logger.info('Scheduler initialized and pending tasks loaded.');

    // Start the timing wheel ticker
    ticker.start();
    logger.info('Timing wheel ticker started.');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  ticker.stop(); // Stop the ticker
  // Optionally, save current state if needed (though persistence handles most)
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  ticker.stop(); // Stop the ticker
  process.exit(0);
});
