const db = require('../db');

function writeAuditLog(event, type, userId = null, metadata = {}) {
    db.query(
        'INSERT INTO audit_logs (event, type, userId, metadata) VALUES (?, ?, ?, ?)',
        [
            String(event || 'event').slice(0, 100),
            String(type || 'system').slice(0, 50),
            Number.isInteger(Number(userId)) ? Number(userId) : null,
            JSON.stringify(metadata || {})
        ],
        (err) => {
            if (err) console.error('Error guardando audit log:', err.message);
        }
    );
}

module.exports = {
    writeAuditLog
};
