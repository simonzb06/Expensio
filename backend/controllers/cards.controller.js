const db = require('../db');
const { writeAuditLog } = require('./auditLogs.controller');

function cleanCardDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function cleanCardLast4(value) {
    return String(value || '').replace(/\D/g, '').slice(-4);
}

function getCards(req,res){

    db.query(
        'SELECT * FROM cards ORDER BY id DESC',
        (err,rows)=>{

            if(err)
                return res.status(500).json({error:err.message});

            res.json(rows);

});
}

function createCard(req,res){

    const {holder,first4,last4,type,balance} = req.body;
    const safeFirst4 = cleanCardDigits(first4);
    const safeLast4 = cleanCardLast4(last4);

    if (safeFirst4.length !== 4 || safeLast4.length !== 4) {
        return res.status(400).json({error:'first4 y last4 deben tener 4 digitos'});
    }

    db.query(
        'INSERT INTO cards (holder,first4,last4,type,balance) VALUES (?,?,?,?,?)',
        [holder,safeFirst4,safeLast4,type,balance],
        function(err){

            if(err)
                return res.status(500).json({error:err.message});

            res.json({
                id:this.insertId,
                holder,
                first4: safeFirst4,
                last4: safeLast4,
                type,
                balance: balance || 0,

            });

            writeAuditLog('card_created', 'cards', null, {
                cardId: this.insertId,
                type
            });
        }
    );
}

function updateCardBalance(req,res){
    const cardId = Number(req.params.id);
    const balance = Number(req.body.balance);

    if (!Number.isInteger(cardId) || cardId <= 0) {
        return res.status(400).json({error:'Id de tarjeta invalido'});
    }

    if (!Number.isFinite(balance)) {
        return res.status(400).json({error:'Balance invalido'});
    }

    db.query(
        'UPDATE cards SET balance = ? WHERE id = ?',
        [balance,cardId],
        function(err){

            if(err)
                return res.status(500).json({error:err.message});

            if(this.affectedRows === 0)
                return res.status(404).json({error:'Tarjeta no encontrada'});

            db.query(
                'SELECT * FROM cards WHERE id = ? LIMIT 1',
                [cardId],
                (selectErr,rows)=>{
                    if(selectErr)
                        return res.status(500).json({error:selectErr.message});

                    res.json(rows[0]);

                    writeAuditLog('card_balance_updated', 'cards', null, {
                        cardId,
                        balanceUpdated: true
                    });
                }
            );
        }
    );
}

module.exports = {
    getCards,
    createCard,
    updateCardBalance
}

