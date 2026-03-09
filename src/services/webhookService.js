const axios = require('axios');
const logger = require('../utils/logger');

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

async function sendWebhook(task, retryCount = 0) {
  const { id, callback_url, payload } = task;
  const webhookPayload = { taskId: id, payload };

  try {
    logger.info(`Attempting to send webhook for task ${id} to ${callback_url} (Attempt ${retryCount + 1})`);
    await axios.post(callback_url, webhookPayload, { timeout: 5000 }); // 5 second timeout
    logger.info(`Webhook successfully sent for task ${id}`);
  } catch (error) {
    logger.error(`Failed to send webhook for task ${id} to ${callback_url}: ${error.message}`);

    if (retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[retryCount];
      logger.warn(`Retrying webhook for task ${id} in ${delay / 1000} seconds...`);
      setTimeout(() => sendWebhook(task, retryCount + 1), delay);
    } else {
      logger.error(`Max retries reached for task ${id}. Webhook failed permanently.`);
      // TODO: Implement dead-letter queue or further error handling
    }
  }
}

module.exports = {
  sendWebhook,
};
