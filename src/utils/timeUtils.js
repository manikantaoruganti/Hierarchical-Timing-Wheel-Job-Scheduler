/**
 * Calculates the exact execution time based on a delay.
 * @param {number} delaySeconds - The delay in seconds from now.
 * @returns {Date} The calculated execution time.
 */
function getExecutionTime(delaySeconds) {
  const now = new Date();
  return new Date(now.getTime() + delaySeconds * 1000);
}

module.exports = {
  getExecutionTime,
};
