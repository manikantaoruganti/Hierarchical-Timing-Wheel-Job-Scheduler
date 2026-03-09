const logger = require('../utils/logger');

/**
 * Represents a bucket in a timing wheel slot, holding tasks in a doubly linked list.
 */
class Bucket {
  constructor() {
    this.head = null; // Head of the linked list
    this.tail = null; // Tail of the linked list
    this.size = 0;    // Number of tasks in the bucket
  }

  /**
   * Adds a TaskNode to the end of the linked list.
   * @param {TaskNode} taskNode
   */
  add(taskNode) {
    taskNode.prev = this.tail;
    taskNode.next = null;
    if (this.tail) {
      this.tail.next = taskNode;
    } else {
      this.head = taskNode;
    }
    this.tail = taskNode;
    this.size++;
    taskNode.bucket = this; // Link taskNode back to this bucket
    logger.debug(`Task ${taskNode.task.id} added to bucket. Current size: ${this.size}`);
  }

  /**
   * Removes a specific TaskNode from the linked list.
   * @param {TaskNode} taskNode
   * @returns {boolean} true if the task was found and removed, false otherwise.
   */
  remove(taskNode) {
    if (!taskNode || taskNode.bucket !== this) {
      logger.warn(`Attempted to remove task ${taskNode ? taskNode.task.id : 'null'} from incorrect or null bucket.`);
      return false; // TaskNode not in this bucket or invalid
    }

    if (taskNode.prev) {
      taskNode.prev.next = taskNode.next;
    } else {
      this.head = taskNode.next; // Removing the head
    }

    if (taskNode.next) {
      taskNode.next.prev = taskNode.prev;
    } else {
      this.tail = taskNode.prev; // Removing the tail
    }

    taskNode.prev = null;
    taskNode.next = null;
    taskNode.bucket = null; // Unlink from bucket
    this.size--;
    logger.debug(`Task ${taskNode.task.id} removed from bucket. Current size: ${this.size}`);
    return true;
  }

  /**
   * Removes and returns all tasks from the bucket, clearing it.
   * @returns {Array<TaskNode>} An array of TaskNodes that were in the bucket.
   */
  popAll() {
    const tasks = [];
    let current = this.head;
    while (current) {
      tasks.push(current);
      current.bucket = null; // Unlink from bucket
      current = current.next;
    }
    this.head = null;
    this.tail = null;
    this.size = 0;
    logger.debug(`Popped all tasks from bucket. New size: ${this.size}`);
    return tasks;
  }
}

module.exports = Bucket;
