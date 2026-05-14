const express = require("express");
const router = express.Router();

const { getTasks, createTask, updateTask, deleteTask } = require("../controllers/tasks.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth(), getTasks);
router.post("/", auth(), createTask);
router.put("/:id", auth(), updateTask);
router.delete("/:id", auth(), deleteTask);

module.exports = router;
