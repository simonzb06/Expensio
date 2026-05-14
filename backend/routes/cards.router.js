const express = require("express")
const router = express.Router()

const { getCards, createCard, updateCardBalance } = require("../controllers/cards.controller")
const auth = require("../middleware/auth.middleware")

/*router.get("/", auth(), getCards)
router.post("/", auth("admin"), createCard)*/

router.get("/", getCards)
router.post("/", createCard)
router.put("/:id/balance", updateCardBalance)

module.exports = router
