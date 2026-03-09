const HierarchicalTimingWheel = require('../src/timingwheel/hierarchicalTimingWheel');
const TaskNode = require('../src/timingwheel/taskNode');
const Bucket = require('../src/timingwheel/bucket');
const WheelLevel = require('../src/timingwheel/wheelLevel');
const schedulerService = require('../src/services/schedulerService');
const persistenceService = require('../src/services/persistenceService');
const webhookService = require('../src/services/webhookService');
const { getExecutionTime } = require('../src/utils/timeUtils');

// Mock dependencies
jest.mock('../src/services/persistenceService');
jest.mock('../src/services/webhookService');
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

describe('HierarchicalTimingWheel', () => {
  let timingWheel;

  beforeEach(() => {
    timingWheel = new HierarchicalTimingWheel();
    jest.clearAllMocks();
    // Reset currentTick for consistent testing
    timingWheel.currentTick = 0;
    // Ensure wheel levels are reset
    timingWheel.levels = [
      new WheelLevel(60, 1, 'seconds'),
      new WheelLevel(60, 60, 'minutes'),
      new WheelLevel(24, 3600, 'hours'),
    ];
    timingWheel.taskMap.clear();
  });

  test('should initialize with 3 levels', () => {
    expect(timingWheel.levels).toHaveLength(3);
    expect(timingWheel.levels[0].name).toBe('seconds');
    expect(timingWheel.levels[1].name).toBe('minutes');
    expect(timingWheel.levels[2].name).toBe('hours');
  });

  test('should schedule a task with short delay in seconds wheel', () => {
    const task = { id: 'task1', scheduled_at: getExecutionTime(5), callback_url: 'url', payload: {} };
    timingWheel.scheduleTask(task);

    expect(timingWheel.taskMap.has('task1')).toBe(true);
    // Assuming currentSlot is 0, task should be in slot 5
    const secondsWheel = timingWheel.levels[0];
    expect(secondsWheel.slots[5].size).toBe(1);
    expect(secondsWheel.slots[5].head.task.id).toBe('task1');
  });

  test('should schedule a task with medium delay in minutes wheel', () => {
    const task = { id: 'task2', scheduled_at: getExecutionTime(120), callback_url: 'url', payload: {} }; // 2 minutes delay
    timingWheel.scheduleTask(task);

    expect(timingWheel.taskMap.has('task2')).toBe(true);
    // 120 seconds delay, resolution 1s for seconds wheel, 60s for minutes wheel
    // 120 / 60 = 2. So it should be in minutes wheel, slot 2 (relative to currentSlot 0)
    const minutesWheel = timingWheel.levels[1];
    expect(minutesWheel.slots[2].size).toBe(1);
    expect(minutesWheel.slots[2].head.task.id).toBe('task2');
  });

  test('should schedule a task with long delay in hours wheel', () => {
    const task = { id: 'task3', scheduled_at: getExecutionTime(7200), callback_url: 'url', payload: {} }; // 2 hours delay
    timingWheel.scheduleTask(task);

    expect(timingWheel.taskMap.has('task3')).toBe(true);
    // 7200 seconds delay, resolution 3600s for hours wheel
    // 7200 / 3600 = 2. So it should be in hours wheel, slot 2 (relative to currentSlot 0)
    const hoursWheel = timingWheel.levels[2];
    expect(hoursWheel.slots[2].size).toBe(1);
    expect(hoursWheel.slots[2].head.task.id).toBe('task3');
  });

  test('should cancel a scheduled task', () => {
    const task = { id: 'task4', scheduled_at: getExecutionTime(10), callback_url: 'url', payload: {} };
    timingWheel.scheduleTask(task);
    expect(timingWheel.taskMap.has('task4')).toBe(true);
    expect(timingWheel.levels[0].slots[10].size).toBe(1);

    const canceled = timingWheel.cancelTask('task4');
    expect(canceled).toBe(true);
    expect(timingWheel.taskMap.has('task4')).toBe(false);
    expect(timingWheel.levels[0].slots[10].size).toBe(0);
  });

  test('should not cancel a non-existent task', () => {
    const canceled = timingWheel.cancelTask('non-existent-task');
    expect(canceled).toBe(false);
  });

  test('tick should advance seconds wheel and execute tasks', () => {
    const task = { id: 'task5', scheduled_at: getExecutionTime(1), callback_url: 'url', payload: {} };
    timingWheel.scheduleTask(task); // Task in slot 1 (currentSlot 0 + 1)

    timingWheel.tick(); // currentSlot becomes 1
    expect(timingWheel.levels[0].currentSlot).toBe(1);
    expect(webhookService.sendWebhook).toHaveBeenCalledWith(task);
    expect(timingWheel.taskMap.has('task5')).toBe(false); // One-time task removed
    expect(persistenceService.deleteTask).toHaveBeenCalledWith('task5');
  });

  test('tick should cascade tasks from seconds to minutes wheel', () => {
    // Schedule a task for 61 seconds (1 minute and 1 second)
    // It will initially be in minutes wheel, slot 1 (relative to currentSlot 0)
    const task = { id: 'task6', scheduled_at: getExecutionTime(61), callback_url: 'url', payload: {} };
    timingWheel.scheduleTask(task);
    expect(timingWheel.levels[1].slots[1].size).toBe(1); // In minutes wheel, slot 1

    // Advance seconds wheel 59 times (to slot 59)
    for (let i = 0; i < 59; i++) {
      timingWheel.tick();
    }
    expect(timingWheel.levels[0].currentSlot).toBe(59);
    expect(timingWheel.levels[1].slots[1].size).toBe(1); // Still in minutes wheel

    // Next tick: seconds wheel wraps around to 0, minutes wheel advances
    timingWheel.tick(); // currentTick = 60
    expect(timingWheel.levels[0].currentSlot).toBe(0);
    expect(timingWheel.levels[1].currentSlot).toBe(1); // Minutes wheel advanced
    expect(timingWheel.levels[1].slots[1].size).toBe(0); // Bucket 1 of minutes wheel should be empty
    expect(timingWheel.levels[0].slots[1].size).toBe(1); // Task should now be in seconds wheel, slot 1
  });

  test('tick should cascade tasks from minutes to hours wheel', () => {
    // Schedule a task for 3661 seconds (1 hour and 1 minute and 1 second)
    // It will initially be in hours wheel, slot 1
    const task = { id: 'task7', scheduled_at: getExecutionTime(3661), callback_url: 'url', payload: {} };
    timingWheel.scheduleTask(task);
    expect(timingWheel.levels[2].slots[1].size).toBe(1); // In hours wheel, slot 1

    // Advance seconds wheel 59 times (to slot 59)
    for (let i = 0; i < 59; i++) {
      timingWheel.tick();
    }
    expect(timingWheel.levels[0].currentSlot).toBe(59);

    // Advance seconds wheel 1 more time, seconds wheel wraps, minutes wheel advances
    timingWheel.tick(); // currentTick = 60
    expect(timingWheel.levels[0].currentSlot).toBe(0);
    expect(timingWheel.levels[1].currentSlot).toBe(1); // Minutes wheel advanced

    // Simulate 59 more minutes passing (59 * 60 ticks)
    for (let i = 0; i < 59 * 60 - 1; i++) { // -1 because minutes wheel is already at 1
      timingWheel.tick();
    }
    expect(timingWheel.levels[0].currentSlot).toBe(59); // Seconds wheel at end
    expect(timingWheel.levels[1].currentSlot).toBe(0); // Minutes wheel just wrapped

    // Next tick: seconds wheel wraps, minutes wheel wraps, hours wheel advances
    timingWheel.tick(); // currentTick = 3600
    expect(timingWheel.levels[0].currentSlot).toBe(0);
    expect(timingWheel.levels[1].currentSlot).toBe(0);
    expect(timingWheel.levels[2].currentSlot).toBe(1); // Hours wheel advanced
    expect(timingWheel.levels[2].slots[1].size).toBe(0); // Bucket 1 of hours wheel empty
    expect(timingWheel.levels[1].slots[1].size).toBe(1); // Task should now be in minutes wheel, slot 1
  });

  test('should reschedule recurring tasks', async () => {
    const task = {
      id: 'task8',
      scheduled_at: getExecutionTime(1),
      callback_url: 'url',
      payload: {},
      is_recurring: true,
      interval_seconds: 5,
    };
    timingWheel.scheduleTask(task);
    expect(timingWheel.levels[0].slots[1].size).toBe(1);

    // Mock persistence update for recurring task
    persistenceService.updateTaskScheduledAt.mockResolvedValueOnce({});

    timingWheel.tick(); // Execute task
    expect(webhookService.sendWebhook).toHaveBeenCalledWith(task);
    expect(persistenceService.updateTaskScheduledAt).toHaveBeenCalledWith(
      'task8',
      expect.any(Date)
    );
    // Task should be re-scheduled, so it should still be in the map
    expect(timingWheel.taskMap.has('task8')).toBe(true);
    // And in the wheel (new position based on interval)
    expect(timingWheel.levels[0].slots[6].size).toBe(1); // currentSlot 1 + 5 interval = slot 6
  });

  test('schedulerService.initialize should load and schedule pending tasks', async () => {
    const pendingTask1 = {
      id: 'pending1',
      scheduled_at: getExecutionTime(10),
      callback_url: 'url1',
      payload: {},
      is_recurring: false,
      interval_seconds: 0,
    };
    const pendingTask2 = {
      id: 'pending2',
      scheduled_at: getExecutionTime(-5), // Past due task
      callback_url: 'url2',
      payload: {},
      is_recurring: false,
      interval_seconds: 0,
    };
    const pendingTask3 = {
      id: 'pending3',
      scheduled_at: getExecutionTime(-10), // Past due recurring task
      callback_url: 'url3',
      payload: {},
      is_recurring: true,
      interval_seconds: 10,
    };

    persistenceService.loadPendingTasks.mockResolvedValueOnce([pendingTask1, pendingTask2, pendingTask3]);
    persistenceService.deleteTask.mockResolvedValue(true);
    persistenceService.updateTaskScheduledAt.mockResolvedValue({});

    await schedulerService.initialize();

    expect(persistenceService.loadPendingTasks).toHaveBeenCalledTimes(1);

    // pendingTask1 should be scheduled
    expect(schedulerService.getTimingWheel().taskMap.has('pending1')).toBe(true);
    expect(schedulerService.getTimingWheel().levels[0].slots[expect.any(Number)].size).toBe(1);

    // pendingTask2 should be executed immediately and deleted
    expect(webhookService.sendWebhook).toHaveBeenCalledWith(pendingTask2);
    expect(persistenceService.deleteTask).toHaveBeenCalledWith('pending2');
    expect(schedulerService.getTimingWheel().taskMap.has('pending2')).toBe(false);

    // pendingTask3 (recurring past due) should be executed immediately and re-scheduled
    expect(webhookService.sendWebhook).toHaveBeenCalledWith(pendingTask3);
    expect(persistenceService.updateTaskScheduledAt).toHaveBeenCalledWith('pending3', expect.any(Date));
    expect(schedulerService.getTimingWheel().taskMap.has('pending3')).toBe(true);
  });

  test('getSchedulerStats should return correct statistics', () => {
    const task1 = { id: 'stat_task1', scheduled_at: getExecutionTime(5), callback_url: 'url', payload: {} };
    const task2 = { id: 'stat_task2', scheduled_at: getExecutionTime(120), callback_url: 'url', payload: {} };
    const task3 = { id: 'stat_task3', scheduled_at: getExecutionTime(125), callback_url: 'url', payload: {} };

    timingWheel.scheduleTask(task1);
    timingWheel.scheduleTask(task2);
    timingWheel.scheduleTask(task3);

    const stats = timingWheel.getStats();

    expect(stats.totalTasks).toBe(3);
    expect(stats.wheelStats.seconds.total).toBe(1);
    expect(stats.wheelStats.seconds.slots).toEqual([{ slot: 5, count: 1 }]);
    expect(stats.wheelStats.minutes.total).toBe(2);
    expect(stats.wheelStats.minutes.slots).toEqual([{ slot: 2, count: 2 }]); // 120s -> 2min, 125s -> 2min
    expect(stats.wheelStats.hours.total).toBe(0);
  });
});

describe('Bucket', () => {
  let bucket;

  beforeEach(() => {
    bucket = new Bucket();
  });

  test('should add tasks to the linked list', () => {
    const task1 = new TaskNode({ id: 't1' });
    const task2 = new TaskNode({ id: 't2' });

    bucket.add(task1);
    expect(bucket.size).toBe(1);
    expect(bucket.head).toBe(task1);
    expect(bucket.tail).toBe(task1);
    expect(task1.bucket).toBe(bucket);

    bucket.add(task2);
    expect(bucket.size).toBe(2);
    expect(bucket.head).toBe(task1);
    expect(bucket.tail).toBe(task2);
    expect(task1.next).toBe(task2);
    expect(task2.prev).toBe(task1);
    expect(task2.bucket).toBe(bucket);
  });

  test('should remove a task from the middle of the list', () => {
    const task1 = new TaskNode({ id: 't1' });
    const task2 = new TaskNode({ id: 't2' });
    const task3 = new TaskNode({ id: 't3' });

    bucket.add(task1);
    bucket.add(task2);
    bucket.add(task3);

    expect(bucket.remove(task2)).toBe(true);
    expect(bucket.size).toBe(2);
    expect(bucket.head).toBe(task1);
    expect(bucket.tail).toBe(task3);
    expect(task1.next).toBe(task3);
    expect(task3.prev).toBe(task1);
    expect(task2.bucket).toBe(null);
  });

  test('should remove the head of the list', () => {
    const task1 = new TaskNode({ id: 't1' });
    const task2 = new TaskNode({ id: 't2' });

    bucket.add(task1);
    bucket.add(task2);

    expect(bucket.remove(task1)).toBe(true);
    expect(bucket.size).toBe(1);
    expect(bucket.head).toBe(task2);
    expect(bucket.tail).toBe(task2);
    expect(task2.prev).toBe(null);
    expect(task1.bucket).toBe(null);
  });

  test('should remove the tail of the list', () => {
    const task1 = new TaskNode({ id: 't1' });
    const task2 = new TaskNode({ id: 't2' });

    bucket.add(task1);
    bucket.add(task2);

    expect(bucket.remove(task2)).toBe(true);
    expect(bucket.size).toBe(1);
    expect(bucket.head).toBe(task1);
    expect(bucket.tail).toBe(task1);
    expect(task1.next).toBe(null);
    expect(task2.bucket).toBe(null);
  });

  test('should remove the only task in the list', () => {
    const task1 = new TaskNode({ id: 't1' });

    bucket.add(task1);

    expect(bucket.remove(task1)).toBe(true);
    expect(bucket.size).toBe(0);
    expect(bucket.head).toBe(null);
    expect(bucket.tail).toBe(null);
    expect(task1.bucket).toBe(null);
  });

  test('should return false if task not in bucket', () => {
    const task1 = new TaskNode({ id: 't1' });
    const task2 = new TaskNode({ id: 't2' });
    bucket.add(task1);
    expect(bucket.remove(task2)).toBe(false);
    expect(bucket.size).toBe(1);
  });

  test('should pop all tasks and clear the bucket', () => {
    const task1 = new TaskNode({ id: 't1' });
    const task2 = new TaskNode({ id: 't2' });

    bucket.add(task1);
    bucket.add(task2);

    const poppedTasks = bucket.popAll();
    expect(poppedTasks).toEqual([task1, task2]);
    expect(bucket.size).toBe(0);
    expect(bucket.head).toBe(null);
    expect(bucket.tail).toBe(null);
    expect(task1.bucket).toBe(null);
    expect(task2.bucket).toBe(null);
  });
});
