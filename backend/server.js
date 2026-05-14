const express = require("express")
const cors = require("cors")

const authRoutes = require("./routes/auth.router");
const userRoutes = require("./routes/users.router");
const cardRoutes = require("./routes/cards.router");
const transactionRoutes = require("./routes/transactions.router");
const adminRoutes = require("./routes/admin.router");
const taskRoutes = require("./routes/tasks.router");
const supportTicketRoutes = require("./routes/supportTickets.router");

const app = express();

app.use(cors());
app.use(express.json());

const path = require("path")

app.use(express.static(path.join(__dirname, "../frontend/public")))


app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/cards", cardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/support-tickets", supportTicketRoutes);



app.listen(3000, () => {
  console.log("Servidor corriendo en puerto 3000")
})
