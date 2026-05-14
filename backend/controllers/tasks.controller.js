const db = require("../db");
const { writeAuditLog } = require("./auditLogs.controller");

function getUserId(req) {
  return req.user?.id || null;
}

function getTasks(req, res) {
  const userId = getUserId(req);
  const sql = userId
    ? "SELECT * FROM tasks WHERE userId = ? OR userId IS NULL ORDER BY id DESC"
    : "SELECT * FROM tasks ORDER BY id DESC";
  const params = userId ? [userId] : [];

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
}

function createTask(req, res) {
  const userId = getUserId(req);
  const { title, priority, status } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: "Titulo requerido" });
  }

  db.query(
    "INSERT INTO tasks (userId, title, priority, status) VALUES (?, ?, ?, ?)",
    [userId, String(title).trim(), priority || "media", status || "pending"],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      res.json({
        id: this.insertId,
        userId,
        title: String(title).trim(),
        priority: priority || "media",
        status: status || "pending"
      });

      writeAuditLog("task_created", "tasks", userId, {
        taskId: this.insertId,
        status: status || "pending"
      });
    }
  );
}

function updateTask(req, res) {
  const userId = getUserId(req);
  const { id } = req.params;
  const { title, priority, status } = req.body;

  db.query(
    "UPDATE tasks SET title = COALESCE(?, title), priority = COALESCE(?, priority), status = COALESCE(?, status) WHERE id = ? AND (userId = ? OR userId IS NULL)",
    [
      title === undefined ? null : title,
      priority === undefined ? null : priority,
      status === undefined ? null : status,
      id,
      userId
    ],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.affectedRows === 0) return res.status(404).json({ error: "Tarea no encontrada" });

      res.json({ id: Number(id), title, priority, status });

      writeAuditLog("task_updated", "tasks", userId, {
        taskId: Number(id),
        status: status || null
      });
    }
  );
}

function deleteTask(req, res) {
  const userId = getUserId(req);
  const { id } = req.params;

  db.query(
    "DELETE FROM tasks WHERE id = ? AND (userId = ? OR userId IS NULL)",
    [id, userId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.affectedRows === 0) return res.status(404).json({ error: "Tarea no encontrada" });

      res.json({ ok: true, id: Number(id) });

      writeAuditLog("task_deleted", "tasks", userId, {
        taskId: Number(id)
      });
    }
  );
}

module.exports = {
  getTasks,
  createTask,
  updateTask,
  deleteTask
};
