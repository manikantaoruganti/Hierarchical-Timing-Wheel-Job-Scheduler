const request = require('supertest');
const app = require('../src/app');
const schedulerService = require('../src/services/schedulerService');
const { getExecutionTime } = require('../src/utils/timeUtils');

// Mock schedulerService to control its behavior during API tests
jest.mock('../src/services/schedulerService', () => ({
  initialize: jest.fn(),
  scheduleTask: jest.fn(),
  cancelTask: jest.fn(),
  getSchedulerStats: jest.fn(),
  getTimingWheel: jest.fn(() => ({
    tick: jest.fn(),
    getStats: jest.fn(() => ({
      totalTasks: 0,
      wheelStats: {
        hours: { total: 0, slots: [] },
        minutes: { total: 0, slots: [] },
        seconds: { total: 0, slots: [] },
      },
    })),
  })),
}));

describe('Task API Endpoints', () => {
  beforeAll(async () => {
    // Ensure schedulerService.initialize is called once before tests
    await schedulerService.initialize();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /tasks', () => {
    test('should schedule a new one-time task successfully', async () => {
      const mockTask = {
        id: 'test-task-1',
        delaySeconds: 5,
        callbackUrl: 'http://localhost:9090/webhook',
        payload: { data: 'test' },
        isRecurring: false,
        intervalSeconds: 0,
      };
      const mockScheduledAt = getExecutionTime(mockTask.delaySeconds);
      schedulerService.scheduleTask.mockResolvedValueOnce({
        ...mockTask,
        scheduled_at: mockScheduledAt,
      });

      const res = await request(app)
        .post('/tasks')
        .send(mockTask)
        .expect(201);

      expect(res.body).toEqual({
        taskId: mockTask.id,
        executionTime: mockScheduledAt.toISOString(),
      });
      expect(schedulerService.scheduleTask).toHaveBeenCalledWith(expect.objectContaining({
        id: mockTask.id,
        delaySeconds: mockTask.delaySeconds,
        callbackUrl: mockTask.callbackUrl,
        payload: mockTask.payload,
        isRecurring: false,
        intervalSeconds: 0,
      }));
    });

    test('should schedule a new recurring task successfully', async () => {
      const mockTask = {
        taskId: 'test-task-recurring',
        delaySeconds: 10,
        callbackUrl: 'http://localhost:9090/webhook/recurring',
        payload: { type: 'recurring' },
        isRecurring: true,
        intervalSeconds: 60,
      };
      const mockScheduledAt = getExecutionTime(mockTask.delaySeconds);
      schedulerService.scheduleTask.mockResolvedValueOnce({
        id: mockTask.taskId,
        scheduled_at: mockScheduledAt,
        callback_url: mockTask.callbackUrl,
        payload: mockTask.payload,
        is_recurring: mockTask.isRecurring,
        interval_seconds: mockTask.intervalSeconds,
      });

      const res = await request(app)
        .post('/tasks')
        .send(mockTask)
        .expect(201);

      expect(res.body).toEqual({
        taskId: mockTask.taskId,
        executionTime: mockScheduledAt.toISOString(),
      });
      expect(schedulerService.scheduleTask).toHaveBeenCalledWith(expect.objectContaining({
        id: mockTask.taskId,
        delaySeconds: mockTask.delaySeconds,
        callbackUrl: mockTask.callbackUrl,
        payload: mockTask.payload,
        isRecurring: true,
        intervalSeconds: 60,
      }));
    });

    test('should return 400 for invalid input (missing taskId)', async () => {
      const invalidTask = {
        delaySeconds: 5,
        callbackUrl: 'http://localhost:9090/webhook',
        payload: {},
      };

      const res = await request(app)
        .post('/tasks')
        .send(invalidTask)
        .expect(400);

      expect(res.body).toEqual({ error: 'taskId is required and must be a non-empty string.' });
      expect(schedulerService.scheduleTask).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid input (negative delaySeconds)', async () => {
      const invalidTask = {
        taskId: 'invalid-delay',
        delaySeconds: -5,
        callbackUrl: 'http://localhost:9090/webhook',
        payload: {},
      };

      const res = await request(app)
        .post('/tasks')
        .send(invalidTask)
        .expect(400);

      expect(res.body).toEqual({ error: 'delaySeconds is required and must be a non-negative number.' });
      expect(schedulerService.scheduleTask).not.toHaveBeenCalled();
    });

    test('should return 400 for invalid input (invalid callbackUrl)', async () => {
      const invalidTask = {
        taskId: 'invalid-url',
        delaySeconds: 5,
        callbackUrl: 'not-a-url',
        payload: {},
      };

      const res = await request(app)
        .post('/tasks')
        .send(invalidTask)
        .expect(400);

      expect(res.body).toEqual({ error: 'callbackUrl is required and must be a valid URL.' });
      expect(schedulerService.scheduleTask).not.toHaveBeenCalled();
    });

    test('should return 400 for recurring task without intervalSeconds', async () => {
      const invalidTask = {
        taskId: 'recurring-no-interval',
        delaySeconds: 5,
        callbackUrl: 'http://localhost:9090/webhook',
        isRecurring: true,
        payload: {},
      };

      const res = await request(app)
        .post('/tasks')
        .send(invalidTask)
        .expect(400);

      expect(res.body).toEqual({ error: 'intervalSeconds is required and must be a positive number for recurring tasks.' });
      expect(schedulerService.scheduleTask).not.toHaveBeenCalled();
    });

    test('should return 409 if task ID already exists (simulated)', async () => {
      const mockTask = {
        taskId: 'existing-task',
        delaySeconds: 5,
        callbackUrl: 'http://localhost:9090/webhook',
        payload: {},
      };
      schedulerService.scheduleTask.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "tasks_pkey"'));

      const res = await request(app)
        .post('/tasks')
        .send(mockTask)
        .expect(409);

      expect(res.body).toEqual({ error: "Task with ID 'existing-task' already exists." });
      expect(schedulerService.scheduleTask).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /tasks/{taskId}', () => {
    test('should cancel an existing task successfully', async () => {
      const taskId = 'task-to-cancel';
      schedulerService.cancelTask.mockResolvedValueOnce(true);

      await request(app)
        .delete(`/tasks/${taskId}`)
        .expect(204);

      expect(schedulerService.cancelTask).toHaveBeenCalledWith(taskId);
    });

    test('should return 404 if task not found', async () => {
      const taskId = 'non-existent-task';
      schedulerService.cancelTask.mockResolvedValueOnce(false);

      const res = await request(app)
        .delete(`/tasks/${taskId}`)
        .expect(404);

      expect(res.body).toEqual({ error: `Task with ID '${taskId}' not found.` });
      expect(schedulerService.cancelTask).toHaveBeenCalledWith(taskId);
    });

    test('should return 400 for invalid taskId parameter', async () => {
      const invalidTaskId = ' '; // Empty string after trim

      const res = await request(app)
        .delete(`/tasks/${invalidTaskId}`)
        .expect(400);

      expect(res.body).toEqual({ error: 'taskId parameter is required and must be a non-empty string.' });
      expect(schedulerService.cancelTask).not.toHaveBeenCalled();
    });
  });

  describe('GET /stats', () => {
    test('should return scheduler statistics', async () => {
      const mockStats = {
        totalTasks: 5,
        wheelStats: {
          hours: { total: 1, slots: [{ slot: 0, count: 1 }] },
          minutes: { total: 2, slots: [{ slot: 5, count: 2 }] },
          seconds: { total: 2, slots: [{ slot: 10, count: 2 }] },
        },
      };
      schedulerService.getSchedulerStats.mockReturnValueOnce(mockStats);

      const res = await request(app)
        .get('/stats')
        .expect(200);

      expect(res.body).toEqual(mockStats);
      expect(schedulerService.getSchedulerStats).toHaveBeenCalledTimes(1);
    });

    test('should return empty stats if no tasks', async () => {
      const emptyStats = {
        totalTasks: 0,
        wheelStats: {
          hours: { total: 0, slots: [] },
          minutes: { total: 0, slots: [] },
          seconds: { total: 0, slots: [] },
        },
      };
      schedulerService.getSchedulerStats.mockReturnValueOnce(emptyStats);

      const res = await request(app)
        .get('/stats')
        .expect(200);

      expect(res.body).toEqual(emptyStats);
    });
  });

  describe('GET /health', () => {
    test('should return 200 OK for health check', async () => {
      const res = await request(app)
        .get('/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'UP');
      expect(res.body).toHaveProperty('timestamp');
      expect(typeof res.body.timestamp).toBe('string');
    });
  });
});
