/**
 * Represents a node in the linked list within a timing wheel bucket.
 */
class TaskNode {
  /**
   * @param {object} task - The actual task object.
   */
  constructor(task) {
    this.task = task;
    this.prev = null; // Previous node in the linked list
    this.next = null; // Next node in the linked list
    this.bucket = null; // Reference to the bucket this node is currently in
  }
}

module.exports = TaskNode;
