const express = require("express");
const router = express.Router();

const { getMetrics, getActivity, getSystem } = require("../controllers/admin.controller");
const auth = require("../middleware/auth.middleware");

router.get("/metrics", auth("admin"), getMetrics);
router.get("/activity", auth("admin"), getActivity);
router.get("/system", auth("admin"), getSystem);

module.exports = router;
