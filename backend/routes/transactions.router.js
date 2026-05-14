const express = require("express")
const router = express.Router()

const { getTransactions, createTransaction  } = require("../controllers/transactions.controller")
const auth = require("../middleware/auth.middleware")

router.get("/", auth(), getTransactions)
router.post("/", auth(), createTransaction)

module.exports = router
