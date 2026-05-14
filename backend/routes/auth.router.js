const express = require('express');
const router = express.Router()

const { login, googleLogin } = require('../controllers/auth.controller');

router.post("/login", login)
router.post("/google-login", googleLogin)


module.exports = router;
