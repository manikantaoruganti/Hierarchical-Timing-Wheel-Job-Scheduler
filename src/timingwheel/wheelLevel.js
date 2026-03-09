const Bucket = require('./bucket');
const logger = require('../utils/logger');

class WheelLevel {
  /**
   * @param {number} size - Number of slots in this wheel level.
   * @param {number} resolution - The time resolution of this wheel in seconds (e.g., 1 for seconds, 60 for minutes).
   * @param {string} name - Name of the wheel level (e.g., 'seconds', 'minutes').
   */
  constructor(size, resolution, name) {
    this.size = size;
    this.resolution = resolution;
    this.name = name;
    this.slots = Array.from({ length: size }, () => new Bucket());
    this.currentSlot = 0; // Pointer to the current slot being processed
    logger.info(`Initialized ${name} wheel with ${size} slots and ${resolution}s resolution.`);
  }

  /**
   * Advances the current slot pointer and returns the bucket at the new slot.
   * Handles wrap-around.
   * @returns {Bucket} The bucket at the new current slot.
   */
  advance() {
    this.currentSlot = (this.currentSlot + 1) % this.size;
    logger.debug(`Advanced ${this.name} wheel to slot ${this.currentSlot}`);
    return this.slots[this.currentSlot];
  }

  /**
   * Adds a task node to the appropriate bucket in this wheel level.
   * @param {TaskNode} taskNode
   * @param {number} delaySeconds - The remaining delay for the task in seconds.
   */
  addTask(taskNode, delaySeconds) {
    // Calculate target slot based on delay and wheel's resolution
    // Ensure delay is non-negative
    const effectiveDelay = Math.max(0, delaySeconds);
    const slotIndex = (this.currentSlot + Math.floor(effectiveDelay / this.resolution)) % this.size;

    this.slots[slotIndex].add(taskNode);
    taskNode.bucket = this.slots[slotIndex]; // Link taskNode to its bucket
    logger.debug(`Task ${taskNode.task.id} added to ${this.name} wheel, slot ${slotIndex}. Current slot: ${this.currentSlot}, Delay: ${delaySeconds}s`);
  }

  /**
   * Returns the total number of tasks in this wheel level.
   * @returns {number}
   */
  getTaskCount() {
    return this.slots.reduce((acc, bucket) => acc + bucket.size, 0);
  }

  /**
   * Returns an array of objects, each containing a slot index and the count of tasks in it.
   * @returns {Array<{slot: number, count: number}>}
   */
  getSlotCounts() {
    const counts = [];
    for (let i = 0; i < this.size; i++) {
      const count = this.slots[i].size;
      if (count > 0) {
        counts.push({ slot: i, count: count });
      }
    }
    return counts;
  }
}

module.exports = WheelLevel;
