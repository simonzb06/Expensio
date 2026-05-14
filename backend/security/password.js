const bycript = require("bcryptjs")

async function hashPassword(password) {

    return await bycript.hash(password, 10)

}

async function comparePassword(password, hash) {

    return await bycript.compare(password, hash)

}

module.exports = {
    hashPassword,
    comparePassword

}