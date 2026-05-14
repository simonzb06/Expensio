const client = require('../config/googleAuth');
const jwt = require('../security/jwt');
const db = require('../db');
const bcrypt = require('bcrypt');

function normalizeCurrency(value) {
  const currency = String(value || '').trim().toUpperCase();
  return ['USD', 'COP', 'EUR'].includes(currency) ? currency : 'USD';
}

async function googleLogin(req, res) {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token requerido' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const email = payload.email;
    const name = payload.name || email;

    if (!email) {
      return res.status(400).json({ message: 'Email no disponible en Google' });
    }

    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (results.length > 0) {
        return sendAuthResponse(res, results[0]);
      }

      bcrypt.hash(`google:${payload.sub || email}`, 10, (hashErr, hash) => {
        if (hashErr) {
          return res.status(500).json({ error: hashErr.message });
        }

        db.query(
          'INSERT INTO users (name, email, role, currency, password) VALUES (?, ?, ?, ?, ?)',
          [name, email, 'user', 'USD', hash],
          (insertErr, insertResult) => {
            if (insertErr) {
              return res.status(500).json({ error: insertErr.message });
            }

            return sendAuthResponse(res, {
              id: insertResult.insertId,
              name,
              email,
              role: 'user',
              currency: 'USD'
            });
          }
        );
      });
    });
  } catch (error) {
    return res.status(401).json({ message: 'Token invalido' });
  }
}

function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({ message: 'Correo y contrasena son requeridos' });
  }

  db.query('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1', [email], (err, results) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!results.length) {
      return res.status(401).json({ message: 'Credenciales invalidas' });
    }

    const user = results[0];

    bcrypt.compare(password, user.password, (compareErr, passwordMatches) => {
      if (compareErr) {
        return res.status(500).json({ error: compareErr.message });
      }

      if (!passwordMatches) {
        return res.status(401).json({ message: 'Credenciales invalidas' });
      }

      return sendAuthResponse(res, user);
    });
  });
}

function sendAuthResponse(res, user) {
  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    currency: normalizeCurrency(user.currency),
    picture: user.picture || null
  };

  return res.json({
    token: jwt.generateToken(safeUser),
    user: safeUser
  });
}

module.exports = {
  login,
  googleLogin
};
