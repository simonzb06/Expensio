const db = require("../db")
const { writeAuditLog } = require("./auditLogs.controller")

function getTransactions(req,res){

 db.query(
 "SELECT * FROM transactions ORDER BY date DESC, id DESC",
 (err,rows)=>{

  if(err)
   return res.status(500).json({error:err.message})

  res.json(rows)

 })

}

function createTransaction(req,res){

 const {date,desc,description,category,userId,cardId,amount} = req.body

 db.query(
 "INSERT INTO transactions (date,description,category,userId,cardId,amount) VALUES (?,?,?,?,?,?)",
 [date,description || desc,category,userId,cardId,amount],
 function(err){

  if(err)
   return res.status(500).json({error:err.message})

  res.json({
   id:this.insertId
  })

  writeAuditLog("transaction_created", "transactions", userId || null, {
   transactionId: this.insertId,
   hasCard: Boolean(cardId)
  })

 })

}

module.exports={
 getTransactions,
 createTransaction
}
