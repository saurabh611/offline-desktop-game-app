const WebSocket = require('ws');
const { networkInterfaces } = require('os');
const { db } = require('../database/init');
const { v4: uuidv4 } = require('uuid');

// Get local IP address
const getLocalIP = () => {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
};

class GameServer {
    constructor() {
        this.port = 8080;
        this.clients = new Map(); // Map of WebSocket clients
        this.currentGame = null;
        this.gameTimer = null;
        this.initServer();
    }

    initServer() {
        this.server = new WebSocket.Server({ port: this.port });
        console.log(`Admin server running on ws://${getLocalIP()}:${this.port}`);

        this.server.on('connection', (ws, req) => {
            const clientId = uuidv4();
            this.clients.set(clientId, { ws, isAuthenticated: false });

            ws.on('message', async (message) => {
                try {
                    const data = JSON.parse(message);
                    await this.handleMessage(clientId, data);
                } catch (error) {
                    console.error('Error handling message:', error);
                    this.sendToClient(clientId, {
                        type: 'error',
                        message: 'Invalid message format'
                    });
                }
            });

            ws.on('close', () => {
                this.clients.delete(clientId);
                this.broadcastUsersList();
            });
        });
    }

    async handleMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client) return;

        switch (data.type) {
            case 'auth':
                await this.handleAuth(clientId, data.payload);
                break;
            case 'place_bet':
                if (client.isAuthenticated) {
                    await this.handleBet(clientId, data.payload);
                }
                break;
            case 'get_wallet':
                if (client.isAuthenticated) {
                    await this.sendWalletBalance(clientId);
                }
                break;
            case 'admin_action':
                if (client.isAuthenticated && client.isAdmin) {
                    await this.handleAdminAction(data.payload);
                }
                break;
        }
    }

    async handleAuth(clientId, { username, password }) {
        // Authenticate user from database
        db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
            if (err || !user) {
                this.sendToClient(clientId, {
                    type: 'auth_response',
                    success: false,
                    message: 'Authentication failed'
                });
                return;
            }

            const client = this.clients.get(clientId);
            client.isAuthenticated = true;
            client.userId = user.id;
            client.isAdmin = user.is_admin;

            this.sendToClient(clientId, {
                type: 'auth_response',
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    isAdmin: user.is_admin,
                    walletBalance: user.wallet_balance
                }
            });

            this.broadcastUsersList();
        });
    }

    async handleBet(clientId, betData) {
        const client = this.clients.get(clientId);
        if (!this.currentGame || this.currentGame.status !== 'active') {
            this.sendToClient(clientId, {
                type: 'bet_response',
                success: false,
                message: 'No active game session'
            });
            return;
        }

        // Process bet in database
        db.run(`INSERT INTO bets (id, user_id, game_session_id, bet_type, bet_number, amount, potential_payout)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), client.userId, this.currentGame.id, betData.type, 
             betData.number, betData.amount, this.calculatePotentialPayout(betData)],
            (err) => {
                if (err) {
                    this.sendToClient(clientId, {
                        type: 'bet_response',
                        success: false,
                        message: 'Failed to place bet'
                    });
                    return;
                }

                this.updateWalletBalance(client.userId, -betData.amount);
                this.sendToClient(clientId, {
                    type: 'bet_response',
                    success: true,
                    message: 'Bet placed successfully'
                });
            });
    }

    calculatePotentialPayout(betData) {
        const multipliers = {
            'single_digit': 9,
            'jodi': 90,
            'single_panna': 150,
            'double_panna': 300,
            'triple_panna': 600
        };
        return betData.amount * multipliers[betData.type];
    }

    async handleAdminAction(action) {
        switch (action.command) {
            case 'start_game':
                this.startNewGame();
                break;
            case 'stop_game':
                this.stopCurrentGame();
                break;
            case 'set_result':
                this.setGameResult(action.result);
                break;
        }
    }

    startNewGame() {
        const gameId = uuidv4();
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + 35 * 60000); // 35 minutes

        db.run(`INSERT INTO game_sessions (id, start_time, end_time, status)
                VALUES (?, ?, ?, ?)`,
            [gameId, startTime, endTime, 'active'],
            (err) => {
                if (err) {
                    console.error('Error starting new game:', err);
                    return;
                }

                this.currentGame = {
                    id: gameId,
                    startTime,
                    endTime,
                    status: 'active'
                };

                this.broadcastGameState();
                this.startGameTimer();
            });
    }

    stopCurrentGame() {
        if (this.currentGame) {
            clearTimeout(this.gameTimer);
            this.currentGame.status = 'stopped';
            this.broadcastGameState();
        }
    }

    startGameTimer() {
        if (this.gameTimer) {
            clearTimeout(this.gameTimer);
        }

        const timeLeft = this.currentGame.endTime - new Date();
        this.gameTimer = setTimeout(() => {
            this.stopCurrentGame();
        }, timeLeft);
    }

    broadcastGameState() {
        this.broadcast({
            type: 'game_state',
            game: this.currentGame
        });
    }

    broadcastUsersList() {
        const users = Array.from(this.clients.values())
            .filter(client => client.isAuthenticated)
            .map(client => ({
                id: client.userId,
                isAdmin: client.isAdmin
            }));

        this.broadcast({
            type: 'users_list',
            users
        });
    }

    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(data));
        }
    }

    broadcast(data) {
        this.clients.forEach(client => {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify(data));
            }
        });
    }

    async updateWalletBalance(userId, amount) {
        db.run('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?',
            [amount, userId],
            (err) => {
                if (err) {
                    console.error('Error updating wallet:', err);
                    return;
                }

                // Notify user of wallet update
                const client = Array.from(this.clients.values())
                    .find(c => c.userId === userId);
                
                if (client) {
                    this.sendToClient(client.id, {
                        type: 'wallet_update',
                        amount
                    });
                }
            });
    }
}

// Start the game server
new GameServer();
