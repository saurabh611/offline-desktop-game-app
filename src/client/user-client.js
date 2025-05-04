const WebSocket = require('ws');
const { ipcMain } = require('electron');
const { db, initializeDatabase } = require('../database/init');

initializeDatabase();
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
                    console.error('Database error during user lookup:', err);
                    reject(new Error('Database error: ' + err.message));
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
                            console.error('Database error during user insert:', err);
                            reject(new Error('Failed to register user: ' + err.message));
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
        return new Promise((resolve, reject) => {
            try {
                if (this.ws) {
                    this.ws.close();
                }

                // Validate server IP
                const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
                let cleanIP = serverIP;
                if (serverIP.includes(':')) {
                    cleanIP = serverIP.split(':')[0];
                }

                if (!ipRegex.test(cleanIP)) {
                    throw new Error('Invalid server IP address format');
                }

                this.serverUrl = `ws://${cleanIP}:8080`;
                this.ws = new WebSocket(this.serverUrl);
                this.connectionStatus = 'connecting';
                this.notifyConnectionStatus();

                // Set connection timeout
                const connectionTimeout = setTimeout(() => {
                    if (this.ws.readyState !== WebSocket.OPEN) {
                        this.ws.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 5000);

                this.ws.on('open', () => {
                    clearTimeout(connectionTimeout);
                    console.log('Connected to admin server');
                    this.reconnectAttempts = 0;
                    this.connectionStatus = 'connected';
                    this.notifyConnectionStatus();
                    
                    // Authenticate with server if user exists
                    if (this.currentUser) {
                        this.authenticate();
                    }
                    
                    resolve();
                });

                this.ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data);
                        this.handleServerMessage(message);
                    } catch (error) {
                        console.error('Error parsing server message:', error);
                        this.notifyError('Failed to process server message');
                    }
                });

                this.ws.on('close', () => {
                    console.log('Disconnected from server');
                    this.connectionStatus = 'disconnected';
                    this.notifyConnectionStatus();
                    this.attemptReconnect();
                });

                this.ws.on('error', (error) => {
                    console.error('WebSocket error:', error);
                    this.connectionStatus = 'error';
                    this.notifyConnectionStatus();
                    this.notifyError('Connection error occurred');
                    this.attemptReconnect();
                    reject(error);
                });

            } catch (error) {
                console.error('Connection setup error:', error);
                this.notifyError(error.message);
                reject(error);
            }
        });
    }

    authenticate() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return Promise.reject(new Error('Not connected to server'));
        }

        return new Promise((resolve, reject) => {
            try {
                const authMessage = {
                    type: 'auth',
                    payload: {
                        username: this.currentUser.username,
                        password: this.currentUser.password
                    }
                };

                this.ws.send(JSON.stringify(authMessage));
                resolve();
            } catch (error) {
                console.error('Authentication error:', error);
                reject(error);
            }
        });
    }

    notifyConnectionStatus() {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('connection:status', {
                status: this.connectionStatus,
                serverUrl: this.serverUrl
            });
        }
    }

    notifyError(message) {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('error', {
                message: message
            });
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            this.notifyError('Failed to reconnect to server after maximum attempts');
            return;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        const backoffTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Scheduling reconnect attempt in ${backoffTime/1000} seconds`);

        this.reconnectTimeout = setTimeout(async () => {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            try {
                await this.connectToServer(this.serverUrl);
                console.log('Reconnection successful');
            } catch (error) {
                console.error('Reconnection failed:', error);
                this.notifyError(`Reconnection attempt ${this.reconnectAttempts} failed`);
            }
        }, backoffTime);
    }

    handleServerMessage(message) {
        try {
            switch (message.type) {
                case 'auth_response':
                    if (message.success) {
                        this.currentUser = message.user;
                        this.sendToRenderer('auth:success', this.currentUser);
                    } else {
                        this.notifyError(message.message || 'Authentication failed');
                        this.sendToRenderer('auth:failed', message);
                    }
                    break;

                case 'game_state':
                    this.sendToRenderer('game:stateChanged', message.game);
                    break;

                case 'game_phase':
                    this.sendToRenderer('game:phaseChanged', message.phase);
                    break;

                case 'wallet_update':
                    if (this.currentUser) {
                        this.currentUser.walletBalance += message.amount;
                        this.sendToRenderer('wallet:updated', {
                            balance: this.currentUser.walletBalance,
                            change: message.amount,
                            timestamp: new Date().toISOString()
                        });
                    }
                    break;

                case 'bet_response':
                    this.sendToRenderer('bet:response', message);
                    break;

                case 'result_declared':
                    this.sendToRenderer('game:resultDeclared', {
                        result: message.result,
                        animate: message.animate
                    });
                    break;

                case 'error':
                    this.notifyError(message.message);
                    break;

                default:
                    console.warn('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error handling server message:', error);
            this.notifyError('Error processing server message');
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
