const express = require('express');
const router = express.Router();

const { createTicket, getTickets, getMyTickets, updateTicket, addUserMessage } = require('../controllers/supportTickets.controller');
const auth = require('../middleware/auth.middleware');

router.post('/', auth(), createTicket);
router.get('/mine', auth(), getMyTickets);
router.get('/', auth('admin'), getTickets);
router.patch('/:id', auth('admin'), updateTicket);
router.post('/:id/messages', auth(), addUserMessage);

module.exports = router;
