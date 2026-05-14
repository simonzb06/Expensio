const db = require('../db');
const { writeAuditLog } = require('./auditLogs.controller');

const VALID_STATUSES = new Set(['pending', 'in_progress', 'responded', 'resolved']);

function normalizeStatus(status) {
    return VALID_STATUSES.has(status) ? status : 'pending';
}

function sanitizeText(value, maxLength) {
    return String(value || '').trim().slice(0, maxLength);
}

function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.query(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function attachMessages(tickets) {
    if (!tickets.length) return [];

    const ids = tickets.map(ticket => ticket.id);
    const messages = await query(
        `SELECT id, ticketId, senderRole, senderId, message, created_at
         FROM support_ticket_messages
         WHERE ticketId IN (?)
         ORDER BY created_at ASC, id ASC`,
        [ids]
    );

    return tickets.map(ticket => ({
        ...ticket,
        messages: messages.filter(message => Number(message.ticketId) === Number(ticket.id))
    }));
}

async function createTicket(req, res) {
    const subject = sanitizeText(req.body.subject, 180);
    const message = sanitizeText(req.body.message, 4000);
    const userId = req.user?.id || null;

    if (!userId) {
        return res.status(401).json({ error: 'Debes iniciar sesion para crear tickets' });
    }

    if (!subject || !message) {
        return res.status(400).json({ error: 'Asunto y mensaje son requeridos' });
    }

    try {
        const result = await query(
            'INSERT INTO support_tickets (userId, subject, message, status) VALUES (?, ?, ?, ?)',
            [userId, subject, message, 'pending']
        );

        await query(
            'INSERT INTO support_ticket_messages (ticketId, senderRole, senderId, message) VALUES (?, ?, ?, ?)',
            [result.insertId, 'user', userId, message]
        );

        writeAuditLog('support_ticket_created', 'support', userId, {
            ticketId: result.insertId,
            status: 'pending'
        });

        const tickets = await attachMessages([{
            id: result.insertId,
            userId,
            subject,
            message,
            status: 'pending'
        }]);

        res.status(201).json(tickets[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getTickets(req, res) {
    try {
        const rows = await query(
            `SELECT id, userId, subject, message, status, response, created_at, updated_at, responded_at
             FROM support_tickets
             ORDER BY FIELD(status, 'pending', 'in_progress', 'responded', 'resolved'), updated_at DESC, id DESC`
        );

        res.json(await attachMessages(rows));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getMyTickets(req, res) {
    try {
        const rows = await query(
            `SELECT id, userId, subject, message, status, response, created_at, updated_at, responded_at
             FROM support_tickets
             WHERE userId = ?
             ORDER BY FIELD(status, 'responded', 'pending', 'in_progress', 'resolved'), updated_at DESC, id DESC`,
            [req.user.id]
        );

        res.json(await attachMessages(rows));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function updateTicket(req, res) {
    const ticketId = Number(req.params.id);
    const requestedStatus = normalizeStatus(req.body.status);
    const response = sanitizeText(req.body.response, 4000);
    const status = response && requestedStatus !== 'resolved' ? 'responded' : requestedStatus;

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
        return res.status(400).json({ error: 'Ticket invalido' });
    }

    try {
        const existingRows = await query('SELECT id FROM support_tickets WHERE id = ? LIMIT 1', [ticketId]);
        if (!existingRows.length) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }

        await query(
            `UPDATE support_tickets
             SET status = ?, response = ?, responded_at = CASE WHEN ? <> '' THEN CURRENT_TIMESTAMP ELSE responded_at END
             WHERE id = ?`,
            [status, response || null, response, ticketId]
        );

        if (response) {
            await query(
                'INSERT INTO support_ticket_messages (ticketId, senderRole, senderId, message) VALUES (?, ?, ?, ?)',
                [ticketId, 'admin', req.user.id, response]
            );
        }

        writeAuditLog('support_ticket_updated', 'support', req.user.id, {
            ticketId,
            status,
            replied: Boolean(response)
        });

        const rows = await query(
            `SELECT id, userId, subject, message, status, response, created_at, updated_at, responded_at
             FROM support_tickets
             WHERE id = ?
             LIMIT 1`,
            [ticketId]
        );

        const tickets = await attachMessages(rows);
        res.json(tickets[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function addUserMessage(req, res) {
    const ticketId = Number(req.params.id);
    const message = sanitizeText(req.body.message, 4000);

    if (!Number.isInteger(ticketId) || ticketId <= 0) {
        return res.status(400).json({ error: 'Ticket invalido' });
    }

    if (!message) {
        return res.status(400).json({ error: 'Mensaje requerido' });
    }

    try {
        const rows = await query(
            'SELECT id, status FROM support_tickets WHERE id = ? AND userId = ? LIMIT 1',
            [ticketId, req.user.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Ticket no encontrado' });
        }

        const nextStatus = rows[0].status === 'resolved' ? 'pending' : 'in_progress';

        await query(
            'INSERT INTO support_ticket_messages (ticketId, senderRole, senderId, message) VALUES (?, ?, ?, ?)',
            [ticketId, 'user', req.user.id, message]
        );

        await query(
            'UPDATE support_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [nextStatus, ticketId]
        );

        writeAuditLog('support_ticket_user_reply', 'support', req.user.id, {
            ticketId,
            status: nextStatus
        });

        const updatedRows = await query(
            `SELECT id, userId, subject, message, status, response, created_at, updated_at, responded_at
             FROM support_tickets
             WHERE id = ?
             LIMIT 1`,
            [ticketId]
        );

        const tickets = await attachMessages(updatedRows);
        res.json(tickets[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    createTicket,
    getTickets,
    getMyTickets,
    updateTicket,
    addUserMessage
};
