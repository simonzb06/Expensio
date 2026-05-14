const jwt = require('jsonwebtoken')

const SECRET = process.env.JWT_SECRET || "claveSecreta123"

function auth(requiredRole){

    return (req,res,next)=>{
        const authHeader = req.headers.authorization

        if(!authHeader)
            return res.status(401).json({error:'No token'})

        const token = authHeader.startsWith('Bearer ')
            ? authHeader.split(' ')[1]
            : authHeader

        try{
            const decoded = jwt.verify(token,SECRET)

            req.user = decoded

            if(requiredRole && decoded.role !== requiredRole)
                return res.status(403).json({error:'Permiso denegado'})
            next()

        }catch(err){

            return res.status(401).json({error:'Token inválido'})
        }
    }

        }

module.exports = auth
