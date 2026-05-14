// db.js - inicializa SQLite y crea tablas necesarias para "La Unión"

const mysql = require('mysql2');
const bcrypt = require('bcrypt');


const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', // cambiar por tu contraseña
  database: 'control_gastos_familiar'

});

db.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err);
    return;
  }
  console.log('Conexión a la base de datos establecida');

  inicializarBase();

});

function inicializarBase() {



// Crear tablas: users
db.query(`
  CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255),
      name VARCHAR(100) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'user',
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      picture MEDIUMTEXT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

ensureColumn('users', 'email', 'VARCHAR(255)');
ensureColumn('users', 'currency', "VARCHAR(3) NOT NULL DEFAULT 'USD'");
ensureColumn('users', 'picture', 'MEDIUMTEXT NULL');
ensureColumn('users', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
ensureUniqueIndex('users', 'idx_users_email_unique', 'email');

  // Crear tabla cards
  db.query(`
    CREATE TABLE IF NOT EXISTS cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    holder VARCHAR(100) NOT NULL,
    first4 VARCHAR(4) NULL,
    last4 VARCHAR(4) NOT NULL,
    type VARCHAR(50) NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0
  )
`);
ensureColumn('cards', 'first4', 'VARCHAR(4) NULL');

// TRANSACTIONS
db.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date varchar(50) NOT NULL,
    description VARCHAR(255),
    category VARCHAR(100),
    userId INT,
    cardId INT,
    amount DECIMAL(10,2),
    foreign key (userId) references users(id),
    foreign key (cardId) references cards(id)
)
`);

// TASKS
db.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NULL,
    title VARCHAR(255) NOT NULL,
    priority VARCHAR(50) NOT NULL DEFAULT 'media',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    foreign key (userId) references users(id)
)
`);

// SUPPORT TICKETS
db.query(`
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    userId INT NULL,
    subject VARCHAR(180) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    response TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL,
    foreign key (userId) references users(id)
)
`);

db.query(`
  CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticketId INT NOT NULL,
    senderRole VARCHAR(20) NOT NULL,
    senderId INT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    foreign key (ticketId) references support_tickets(id) ON DELETE CASCADE,
    foreign key (senderId) references users(id)
)
`);

// AUDIT LOGS
db.query(`
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    userId INT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    foreign key (userId) references users(id)
)
`);


  // seed iniciar usuarios
  db.query('SELECT COUNT(*) AS count FROM users', (err, results) => {
    if (err) return console.error(err);

    if (results[0].count === 0) {
      bcrypt.hash('admin123', 10, (e, hashAdmin) => {
        if (e) return console.error(e);

        db.query(
          'INSERT INTO users (name, email, role, password) VALUES (?, ?, ?, ?)',
          ['Admin', 'admin@example.local', 'admin', hashAdmin],
        );
      });
    }
  });


// SEDD TARJETAS //
if (process.env.SEED_DEMO_CARDS === "true") {
  db.query('SELECT COUNT(*) AS count FROM cards', (err, results) => {
    if (err) return console.error(err);

    if (results[0].count === 0) {
      db.query(
        'INSERT INTO cards (holder, first4, last4, type, balance) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)',
        [
        'Visa', '4123', '1234', 'credit', 1000,
        'Mastercard', '5555', '5678', 'debit', 500,
        ],
        (err2)=>{
          if(err2) return console.error(err2);
          console.log('Tarjetas inicializadas');
        }
      );
    }
  });
}

}

function ensureColumn(table, column, definition) {
  db.query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column], (err, results) => {
    if (err) return console.error(`Error revisando columna ${table}.${column}:`, err);
    if (results.length > 0) return;

    db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
      if (alterErr) return console.error(`Error agregando columna ${table}.${column}:`, alterErr);
      console.log(`Columna ${table}.${column} verificada`);
    });
  });
}

function ensureUniqueIndex(table, indexName, column) {
  db.query(`SHOW INDEX FROM ${table} WHERE Key_name = ?`, [indexName], (err, results) => {
    if (err) return console.error(`Error revisando indice ${indexName}:`, err);
    if (results.length > 0) return;

    db.query(`ALTER TABLE ${table} ADD UNIQUE INDEX ${indexName} (${column})`, (alterErr) => {
      if (alterErr) return console.error(`Error creando indice ${indexName}:`, alterErr);
      console.log(`Indice ${indexName} verificado`);
    });
  });
}

module.exports = db;

           
  
