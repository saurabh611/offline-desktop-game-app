const WebSocket = require('ws');
const { ipcMain } = require('electron');
const { db } = require('../database/init');
const { networkInterfaces } = require('os');

class GameClient {
    constructor() {
        this.ws = null;
        this.serverUrl = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectTimeout = null;
        this.currentUser = null;
        this.setupIPC();
    }

    setupIPC() {
        // Authentication
        ipcMain.handle('user:register', async (event, userData) => {
            return this.registerUser(userData);
        });

        ipcMain.handle('user:login', async (event, credentials) => {
            return this.loginUser(credentials);
        });

        // Game operations
        ipcMain.handle('game:placeBet', async (event, betData) => {
            return this.placeBet(betData);
        });

        ipcMain.handle('game:getState', async () => {
            return this.getGameState();
        });

        // Wallet operations
        ipcMain.handle('wallet:getBalance', async () => {
            return this.getWalletBalance();
        });

        // System operations
        ipcMain.handle('system:connectToServer', async (event, serverIP) => {
            return this.connectToServer(serverIP);
        });
    }

    async registerUser(userData) {
        return new Promise((resolve, reject) => {
            const { username, password } = userData;

            // Check if username exists
            db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                if (err) {
                    reject(new Error('Database error'));
                    return;
                }
                if (row) {
                    reject(new Error('Username already exists'));
                    return;
                }

                // Insert new user
                db.run(`INSERT INTO users (id, username, password, wallet_balance) 
                        VALUES (?, ?, ?, ?)`,
                    [username, username, password, 0],
                    (err) => {
                        if (err) {
                            reject(new Error('Failed to register user'));
                            return;
                        }
                        resolve({ success: true, message: 'Registration successful' });
                    });
            });
        });
    }

    async loginUser(credentials) {
        return new Promise((resolve, reject) => {
            const { username, password } = credentials;
            
            db.get('SELECT * FROM users WHERE username = ? AND password = ?',
                [username, password],
                (err, user) => {
                    if (err || !user) {
                        reject(new Error('Invalid credentials'));
                        return;
                    }

                    this.currentUser = user;
                    resolve({
                        success: true,
                        user: {
                            id: user.id,
                            username: user.username,
                            walletBalance: user.wallet_balance
                        }
                    });
                });
        });
    }

    connectToServer(serverIP) {
        if (this.ws) {
            this.ws.close();
        }

        this.serverUrl = `ws://${serverIP}:8080`;
        this.ws = new WebSocket(this.serverUrl);

        this.ws.on('open', () => {
            console.log('Connected to admin server');
            this.reconnectAttempts = 0;
            
            // Authenticate with server
            if (this.currentUser) {
                this.ws.send(JSON.stringify({
                    type: 'auth',
                    payload: {
                        username: this.currentUser.username,
                        password: this.currentUser.password
                    }
                }));
            }
        });

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleServerMessage(message);
            } catch (error) {
                console.error('Error parsing server message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('Disconnected from server');
            this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.attemptReconnect();
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            return;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.connectToServer(this.serverUrl);
        }, 5000); // Wait 5 seconds before reconnecting
    }

    handleServerMessage(message) {
        switch (message.type) {
            case 'auth_response':
                if (message.success) {
                    this.currentUser = message.user;
                }
                break;

            case 'game_state':
                // Forward game state to renderer
                this.sendToRenderer('game:stateChanged', message.game);
                break;

            case 'wallet_update':
                // Update local wallet balance and notify renderer
                if (this.currentUser) {
                    this.currentUser.walletBalance += message.amount;
                    this.sendToRenderer('wallet:updated', this.currentUser.walletBalance);
                }
                break;

            case 'bet_response':
                this.sendToRenderer('bet:response', message);
                break;
        }
    }

    sendToRenderer(channel, data) {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send(channel, data);
        }
    }

    placeBet(betData) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { success: false, message: 'Not connected to server' };
        }

        this.ws.send(JSON.stringify({
            type: 'place_bet',
            payload: betData
        }));
    }

    getGameState() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return { status: 'disconnected' };
        }

        this.ws.send(JSON.stringify({ type: 'get_game_state' }));
    }

    getWalletBalance() {
        return this.currentUser ? this.currentUser.walletBalance : 0;
    }
}

// Create game client instance
const gameClient = new GameClient();
module.exports = gameClient;
