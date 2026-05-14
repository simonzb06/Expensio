const db = require('../db');
const bcrypt = require('bcrypt');

function normalizeCurrency(value) {
    const currency = String(value || '').trim().toUpperCase();
    return ['USD', 'COP', 'EUR'].includes(currency) ? currency : 'USD';
}

function getCurrencyLocale(currency) {
    return {
        USD: 'en-US',
        COP: 'es-CO',
        EUR: 'es-ES'
    }[normalizeCurrency(currency)];
}

function getUsers(req,res){

    db.query(
        'SELECT id,name,role,currency FROM users',
        (err,rows)=>{

            if(err)
                return res.status(500).json({error:err.message});

            res.json(rows);

})

}

function createUser(req,res){

    const {name,role,password,currency} = req.body
    const safeCurrency = normalizeCurrency(currency);

    bcrypt.hash(password,10,(err,hash)=>{

        db.query(
            'INSERT INTO users (name,role,currency,password) VALUES (?,?,?,?)',
            [name,role,safeCurrency,hash],
            function(err){

                if(err)
                    return res.status(500).json({error:err.message});

                res.json({
                    id:this.insertId,
                    name,
                    role,
                    currency: safeCurrency

                });
            }
        );
    });
}

function getMySettings(req,res){
    db.query(
        'SELECT id,name,email,role,currency,picture FROM users WHERE id = ? LIMIT 1',
        [req.user.id],
        (err,rows)=>{
            if(err)
                return res.status(500).json({error:err.message});

            if(!rows.length)
                return res.status(404).json({error:'Usuario no encontrado'});

            const user = rows[0];
            const currency = normalizeCurrency(user.currency);

            res.json({
                user: {
                    ...user,
                    currency
                },
                currency,
                currencyLocale: getCurrencyLocale(currency)
            });
        }
    );
}

function updateMySettings(req,res){
    const currency = normalizeCurrency(req.body.currency);
    const name = String(req.body.name || '').trim();
    const picture = typeof req.body.picture === 'string' ? req.body.picture.trim() : undefined;

    const fields = ['currency = ?'];
    const params = [currency];

    if (name) {
        fields.push('name = ?');
        params.push(name);
    }

    if (picture !== undefined) {
        if (picture && !picture.startsWith('data:image/')) {
            return res.status(400).json({error:'Formato de imagen invalido'});
        }

        if (picture.length > 1024 * 1024) {
            return res.status(400).json({error:'La imagen supera el tamano permitido'});
        }

        fields.push('picture = ?');
        params.push(picture || null);
    }

    params.push(req.user.id);

    db.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
        params,
        (err)=>{
            if(err)
                return res.status(500).json({error:err.message});

            db.query(
                'SELECT id,name,email,role,currency,picture FROM users WHERE id = ? LIMIT 1',
                [req.user.id],
                (selectErr,rows)=>{
                    if(selectErr)
                        return res.status(500).json({error:selectErr.message});

                    if(!rows.length)
                        return res.status(404).json({error:'Usuario no encontrado'});

                    const user = rows[0];
                    const safeCurrency = normalizeCurrency(user.currency);

                    res.json({
                        user: {
                            ...user,
                            currency: safeCurrency
                        },
                        currency: safeCurrency,
                        currencyLocale: getCurrencyLocale(safeCurrency)
                    });
                }
            );
        }
    );
}

module.exports = {
    getUsers,
    createUser,
    getMySettings,
    updateMySettings
}

     
