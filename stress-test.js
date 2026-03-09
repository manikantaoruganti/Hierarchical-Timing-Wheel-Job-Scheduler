const axios = require("axios");

const URL = "http://localhost:8081/tasks";
const TOTAL_TASKS = 100000;

async function scheduleTasks() {
  console.log(`Scheduling ${TOTAL_TASKS} tasks...`);

  const start = Date.now();

  for (let i = 0; i < TOTAL_TASKS; i++) {
    try {
      await axios.post(URL, {
        taskId: "task-" + i,
        delaySeconds: Math.floor(Math.random() * 300) + 1,
        callbackUrl: "http://localhost:9090/webhook",
        payload: { index: i }
      });

      if (i % 1000 === 0) {
        console.log(`Scheduled ${i} tasks`);
      }

    } catch (err) {
      console.error("Error scheduling:", err.message);
    }
  }

  const end = Date.now();
  console.log("Total time:", (end - start) / 1000, "seconds");
}

scheduleTasks();