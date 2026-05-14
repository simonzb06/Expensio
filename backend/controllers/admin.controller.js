const db = require("../db");

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function pingDb() {
  return new Promise((resolve, reject) => {
    db.ping((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function getMetrics(req, res) {
  try {
    const [usersRows, cardsRows, transactionsRows, totalAmountRows] = await Promise.all([
      query("SELECT COUNT(*) AS total FROM users"),
      query("SELECT COUNT(*) AS total FROM cards"),
      query("SELECT COUNT(*) AS total FROM transactions"),
      query("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions")
    ]);

    res.json({
      users: Number(usersRows[0]?.total || 0),
      cards: Number(cardsRows[0]?.total || 0),
      transactions: Number(transactionsRows[0]?.total || 0),
      totalExpenses: Number(totalAmountRows[0]?.total || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getActivity(req, res) {
  try {
    const logs = await query(`
      SELECT id, event, type, userId, metadata, created_at
      FROM audit_logs
      ORDER BY created_at DESC, id DESC
      LIMIT 12
    `);

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        event: log.event,
        type: log.type,
        userId: log.userId || null,
        metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}),
        created_at: log.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getSystem(req, res) {
  try {
    await pingDb();
    res.json({
      api: "online",
      db: "connected",
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      api: "online",
      db: "disconnected",
      serverTime: new Date().toISOString(),
      error: err.message
    });
  }
}

module.exports = {
  getMetrics,
  getActivity,
  getSystem
};
