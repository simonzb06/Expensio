const express = require('express');
const router = express.Router();

const { getUsers, createUser, getMySettings, updateMySettings, /*updateUser, deleteUser */} = require('../controllers/users.controller.js');
const auth = require('../middleware/auth.middleware');

router.get("/me/settings", auth(), getMySettings)
router.patch("/me/settings", auth(), updateMySettings)
router.get("/", auth("admin"), getUsers)
router.post("/", auth("admin"), createUser)


module.exports = router

