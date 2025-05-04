const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Create database in user's app data directory
const dbPath = path.join(__dirname, 'game.db');
const db = new sqlite3.Database(dbPath);

function initializeDatabase() {
    db.serialize(() => {
        console.log('Initializing database and creating tables if not exist...');
        // Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            wallet_balance REAL DEFAULT 0,
            is_admin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating users table:', err);
            else console.log('Users table ready');
        });

        // Game sessions table
        db.run(`CREATE TABLE IF NOT EXISTS game_sessions (
            id TEXT PRIMARY KEY,
            start_time DATETIME NOT NULL,
            end_time DATETIME NOT NULL,
            open_panna TEXT,
            jodi TEXT,
            close_panna TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('Error creating game_sessions table:', err);
            else console.log('Game sessions table ready');
        });

        // Bets table
        db.run(`CREATE TABLE IF NOT EXISTS bets (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            game_session_id TEXT NOT NULL,
            bet_type TEXT NOT NULL,
            bet_number TEXT NOT NULL,
            amount REAL NOT NULL,
            potential_payout REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (game_session_id) REFERENCES game_sessions(id)
        )`, (err) => {
            if (err) console.error('Error creating bets table:', err);
            else console.log('Bets table ready');
        });

        // Wallet transactions table
        db.run(`CREATE TABLE IF NOT EXISTS wallet_transactions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            amount REAL NOT NULL,
            type TEXT NOT NULL,
            reference_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, (err) => {
            if (err) console.error('Error creating wallet_transactions table:', err);
            else console.log('Wallet transactions table ready');
        });

        // Create default admin user if not exists
        const salt = bcrypt.genSaltSync(10);
        const defaultAdminPassword = bcrypt.hashSync('admin123', salt);
        
        db.run(`INSERT OR IGNORE INTO users (id, username, password, is_admin, wallet_balance) 
                VALUES (?, ?, ?, ?, ?)`, 
                ['admin', 'admin', defaultAdminPassword, 1, 1000000], (err) => {
                    if (err) console.error('Error inserting default admin user:', err);
                    else console.log('Default admin user ensured');
                });
    });
}

// Export database connection and initialization
module.exports = {
    db,
    initializeDatabase
};
