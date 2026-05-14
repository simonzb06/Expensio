const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limite de 100 solicitudes por IP
    message: 'Demasiadas solicitudes, por favor intente de nuevo más tarde.'

})

module.exports = limiter;


