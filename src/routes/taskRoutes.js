const express = require('express');
const taskController = require('../controllers/taskController');
const { validateScheduleTask, validateTaskId } = require('../utils/validation');

const router = express.Router();

router.post('/', validateScheduleTask, taskController.scheduleTask);
router.delete('/:taskId', validateTaskId, taskController.cancelTask);

module.exports = router;
