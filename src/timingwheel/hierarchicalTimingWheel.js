const WheelLevel = require('./wheelLevel');
const TaskNode = require('./taskNode');
const webhookService = require('../services/webhookService');
const persistenceService = require('../services/persistenceService');
const logger = require('../utils/logger');

class HierarchicalTimingWheel {
  constructor() {
    // 3-level hierarchical timing wheel
    // Seconds wheel: 60 slots, resolution 1 second
    // Minutes wheel: 60 slots, resolution 60 seconds
    // Hours wheel: 24 slots, resolution 3600 seconds
    this.levels = [
      new WheelLevel(60, 1, 'seconds'),    // 0: Seconds wheel
      new WheelLevel(60, 60, 'minutes'),   // 1: Minutes wheel
      new WheelLevel(24, 3600, 'hours'),   // 2: Hours wheel
    ];

    // Map taskId -> TaskNode for O(1) cancellation
    this.taskMap = new Map();

    // Current time in seconds since epoch (or an arbitrary start point)
    // This is a conceptual "tick" counter, not actual wall clock time.
    this.currentTick = 0;
  }

  /**
   * Schedules a task in the timing wheel.
   * @param {object} task - The task object from persistenceService.
   * @param {string} task.id
   * @param {Date} task.scheduled_at
   * @param {string} task.callback_url
   * @param {object} task.payload
   * @param {boolean} task.is_recurring
   * @param {number} task.interval_seconds
   */
  scheduleTask(task) {
    if (this.taskMap.has(task.id)) {
      logger.warn(`Task ${task.id} already exists in timing wheel. Overwriting.`);
      this.cancelTask(task.id); // Remove old instance first
    }

    const now = Date.now();
    const scheduledAtMs = task.scheduled_at.getTime();
    let delaySeconds = Math.ceil((scheduledAtMs - now) / 1000);

    if (delaySeconds < 0) {
      delaySeconds = 0; // Execute immediately if past due
    }

    const taskNode = new TaskNode(task);
    this.taskMap.set(task.id, taskNode);

    this._addTaskToWheel(taskNode, delaySeconds);
  }

  /**
   * Internal method to add a task node to the appropriate wheel level.
   * @param {TaskNode} taskNode
   * @param {number} delaySeconds
   */
  _addTaskToWheel(taskNode, delaySeconds) {
    let currentDelay = delaySeconds;
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i];
      if (currentDelay < level.size * level.resolution) {
        level.addTask(taskNode, currentDelay);
        return;
      }
      // If delay is too large for this wheel, it goes to the next higher wheel
      // The delay for the next wheel is relative to its resolution
      currentDelay = Math.floor(currentDelay / level.resolution);
    }
    // If delay is larger than the highest wheel, it goes into the highest wheel's last slot
    // This scenario should be rare with a 24-hour wheel, but handles very long delays.
    this.levels[this.levels.length - 1].addTask(taskNode, currentDelay);
  }

  /**
   * Cancels a task by its ID.
   * @param {string} taskId
   * @returns {boolean} true if task was found and canceled, false otherwise.
   */
  cancelTask(taskId) {
    const taskNode = this.taskMap.get(taskId);
    if (taskNode) {
      if (taskNode.bucket) {
        taskNode.bucket.remove(taskNode);
      }
      this.taskMap.delete(taskId);
      logger.info(`Task ${taskId} removed from timing wheel.`);
      return true;
    }
    return false;
  }

  /**
   * Advances the timing wheel by one tick (1 second).
   * This is the core execution loop.
   */
  tick() {
    this.currentTick++;

    // 1. Advance seconds wheel
    const secondsWheel = this.levels[0];
    const currentBucket = secondsWheel.advance();

    // 2. Execute tasks in current slot
    if (currentBucket) {
      this._executeTasksInBucket(currentBucket);
    }

    // 3. Cascade tasks from higher levels if a wheel completes a full rotation
    for (let i = 0; i < this.levels.length - 1; i++) {
      const currentLevel = this.levels[i];
      const nextLevel = this.levels[i + 1];

      if (currentLevel.currentSlot === 0 && this.currentTick % currentLevel.size === 0) {
        // Current level has completed a full rotation
        const bucketToCascade = nextLevel.advance(); // Advance the next level's pointer
        if (bucketToCascade) {
          this._cascadeTasks(bucketToCascade, currentLevel);
        }
      }
    }
  }

  /**
   * Executes all tasks in a given bucket.
   * @param {Bucket} bucket
   */
  _executeTasksInBucket(bucket) {
    const tasksToExecute = bucket.popAll();
    for (const taskNode of tasksToExecute) {
      const task = taskNode.task;
      if (!this.taskMap.has(task.id)) {
        // Task was cancelled before execution, skip
        logger.debug(`Skipping execution of cancelled task ${task.id}`);
        continue;
      }

      logger.info(`Executing task ${task.id} (scheduled for ${task.scheduled_at.toISOString()})`);
      webhookService.sendWebhook(task);

      // 5. Reschedule recurring tasks
      if (task.is_recurring && task.interval_seconds > 0) {
        const nextScheduledAt = new Date(Date.now() + task.interval_seconds * 1000);
        logger.info(`Rescheduling recurring task ${task.id} for ${nextScheduledAt.toISOString()}`);
        // Update in DB
        persistenceService.updateTaskScheduledAt(task.id, nextScheduledAt)
          .then(() => {
            // Re-insert into timing wheel
            this.scheduleTask({ ...task, scheduled_at: nextScheduledAt });
          })
          .catch(error => {
            logger.error(`Failed to update scheduled_at for recurring task ${task.id} in DB:`, error);
          });
      } else {
        // One-time task, remove from map and DB
        this.taskMap.delete(task.id);
        persistenceService.deleteTask(task.id)
          .catch(error => {
            logger.error(`Failed to delete one-time task ${task.id} from DB after execution:`, error);
          });
      }
    }
  }

  /**
   * Cascades tasks from a higher-level bucket to a lower-level wheel.
   * @param {Bucket} sourceBucket - The bucket from the higher level.
   * @param {WheelLevel} destinationLevel - The lower level wheel to cascade into.
   */
  _cascadeTasks(sourceBucket, destinationLevel) {
    const tasksToCascade = sourceBucket.popAll();
    for (const taskNode of tasksToCascade) {
      // Recalculate delay relative to the destination wheel's resolution
      // The task's original scheduled_at is used to determine its exact position
      const now = Date.now();
      const scheduledAtMs = taskNode.task.scheduled_at.getTime();
      let delaySeconds = Math.ceil((scheduledAtMs - now) / 1000);

      if (delaySeconds < 0) {
        delaySeconds = 0; // Should not happen often during cascade, but safety
      }

      // Add to the destination level
      destinationLevel.addTask(taskNode, delaySeconds);
      logger.debug(`Cascaded task ${taskNode.task.id} to ${destinationLevel.name} wheel.`);
    }
  }

  /**
   * Returns statistics about the timing wheel.
   */
  getStats() {
    let totalTasks = 0;
    const wheelStats = {};

    this.levels.forEach(level => {
      const levelTotal = level.getTaskCount();
      totalTasks += levelTotal;
      wheelStats[level.name] = {
        total: levelTotal,
        slots: level.getSlotCounts(),
      };
    });

    return {
      totalTasks: this.taskMap.size, // Use taskMap size for accurate total
      wheelStats,
    };
  }
}

module.exports = HierarchicalTimingWheel;
