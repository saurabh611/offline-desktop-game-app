const WebSocket = require('ws');
const { networkInterfaces } = require('os');
const { db, initializeDatabase } = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const gameTimer = require('../config/game-timer');
const gameConfig = require('../config/game-config');

// Initialize database
initializeDatabase();

// Error logging function
function logError(context, error) {
    console.error(`[${new Date().toISOString()}] ${context}:`, error);
    // TODO: Add file logging if needed
}

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
        try {
            this.server = new WebSocket.Server({ port: this.port });
            const serverIP = getLocalIP();
            console.log(`Admin server running on ws://${serverIP}:${this.port}`);

            // Setup game timer callbacks
            gameTimer.onPhaseChange((phase) => {
                this.broadcast({
                    type: 'game_phase',
                    phase: phase
                });
            });

            gameTimer.onGameEnd(() => {
                this.stopCurrentGame();
            });

            this.server.on('connection', (ws, req) => {
                const clientId = uuidv4();
                const clientIP = req.socket.remoteAddress;
                console.log(`New client connected from ${clientIP} with ID: ${clientId}`);

                this.clients.set(clientId, { 
                    ws, 
                    isAuthenticated: false,
                    ip: clientIP,
                    connectTime: new Date()
                });

                ws.on('message', async (message) => {
                    try {
                        const data = JSON.parse(message);
                        await this.handleMessage(clientId, data);
                    } catch (error) {
                        logError('Message handling', error);
                        this.sendToClient(clientId, {
                            type: 'error',
                            message: 'Invalid message format'
                        });
                    }
                });

                ws.on('close', () => {
                    const client = this.clients.get(clientId);
                    if (client && client.isAuthenticated) {
                        console.log(`Authenticated client ${clientId} disconnected`);
                    }
                    this.clients.delete(clientId);
                    this.broadcastUsersList();
                });

                ws.on('error', (error) => {
                    logError(`WebSocket error for client ${clientId}`, error);
                    this.clients.delete(clientId);
                    this.broadcastUsersList();
                });
            });

            this.server.on('error', (error) => {
                logError('WebSocket server error', error);
            });
        } catch (error) {
            logError('Server initialization', error);
            throw error; // Re-throw to handle at process level
        }
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
        try {
            switch (action.command) {
                case 'start_game':
                    if (this.currentGame && this.currentGame.status === 'active') {
                        throw new Error('A game is already in progress');
                    }
                    await this.startNewGame();
                    break;

                case 'stop_game':
                    if (!this.currentGame || this.currentGame.status !== 'active') {
                        throw new Error('No active game to stop');
                    }
                    await this.stopCurrentGame();
                    break;

                case 'set_result':
                    if (!this.currentGame) {
                        throw new Error('No active game to set result for');
                    }

                    let result;
                    if (action.mode === 'auto') {
                        result = gameConfig.utils.generateAutoResult();
                    } else {
                        // Validate manual result format
                        if (!this.validateResultFormat(action.result)) {
                            throw new Error('Invalid result format');
                        }
                        result = action.result;
                    }

                    await this.setGameResult(result);
                    break;

                case 'update_wallet':
                    if (!action.userId || typeof action.amount !== 'number') {
                        throw new Error('Invalid wallet update parameters');
                    }
                    await this.updateWalletBalance(action.userId, action.amount);
                    break;

                default:
                    throw new Error('Unknown admin command');
            }
        } catch (error) {
            logError('Admin action', error);
            this.broadcast({
                type: 'error',
                message: error.message
            });
        }
    }

    validateResultFormat(result) {
        if (!result || !result.openPanna || !result.jodi || !result.closePanna) {
            return false;
        }

        // Validate open panna (3 digits)
        if (!/^\d{3}$/.test(result.openPanna)) return false;
        
        // Validate jodi (2 digits)
        if (!/^\d{2}$/.test(result.jodi)) return false;
        
        // Validate close panna (3 digits)
        if (!/^\d{3}$/.test(result.closePanna)) return false;

        // Validate against valid panna list
        if (!gameConfig.utils.isValidPanna(result.openPanna) || 
            !gameConfig.utils.isValidPanna(result.closePanna)) {
            return false;
        }

        return true;
    }

    async setGameResult(result) {
        try {
            if (!this.currentGame) {
                throw new Error('No active game to set result');
            }

            // Update game session with result
            await new Promise((resolve, reject) => {
                db.run(`UPDATE game_sessions 
                       SET open_panna = ?, jodi = ?, close_panna = ?, status = 'completed' 
                       WHERE id = ?`,
                    [result.openPanna, result.jodi, result.closePanna, this.currentGame.id],
                    (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
            });

            // Update current game state
            this.currentGame.result = result;
            this.currentGame.status = 'completed';

            // Broadcast result with animation flag
            this.broadcast({
                type: 'result_declared',
                result: result,
                animate: true
            });

            // Process bets after result declaration
            await this.processPendingBets();

        } catch (error) {
            logError('Setting game result', error);
            throw error;
        }
    }

    startNewGame() {
        try {
            // Check if it's a valid game time
            if (!gameTimer.isValidGameTime()) {
                this.broadcast({
                    type: 'error',
                    message: 'Games can only be started between 9 AM and 10 PM'
                });
                return;
            }

            const gameId = uuidv4();
            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + 35 * 60000); // 35 minutes

            db.run(`INSERT INTO game_sessions (id, start_time, end_time, status)
                    VALUES (?, ?, ?, ?)`,
                [gameId, startTime, endTime, 'active'],
                (err) => {
                    if (err) {
                        logError('Starting new game', err);
                        this.broadcast({
                            type: 'error',
                            message: 'Failed to start new game'
                        });
                        return;
                    }

                    this.currentGame = {
                        id: gameId,
                        startTime,
                        endTime,
                        status: 'active',
                        phase: 'openBetting'
                    };

                    // Start game timer
                    gameTimer.startGameCycle(this.currentGame);
                    
                    this.broadcastGameState();
                    console.log(`New game started with ID: ${gameId}`);
                });
        } catch (error) {
            logError('Starting new game', error);
            this.broadcast({
                type: 'error',
                message: 'Failed to start new game'
            });
        }
    }

    stopCurrentGame() {
        try {
            if (!this.currentGame) {
                return;
            }

            gameTimer.stopGameCycle();

            db.run(`UPDATE game_sessions SET status = 'stopped' WHERE id = ?`,
                [this.currentGame.id],
                (err) => {
                    if (err) {
                        logError('Stopping game', err);
                        return;
                    }

                    this.currentGame.status = 'stopped';
                    this.broadcastGameState();
                    console.log(`Game ${this.currentGame.id} stopped`);

                    // Process any pending bets
                    this.processPendingBets();
                });
        } catch (error) {
            logError('Stopping game', error);
        }
    }

    async processPendingBets() {
        try {
            db.all(`SELECT * FROM bets WHERE game_session_id = ? AND status = 'pending'`,
                [this.currentGame.id],
                (err, bets) => {
                    if (err) {
                        logError('Processing pending bets', err);
                        return;
                    }

                    bets.forEach(bet => {
                        // Update bet status based on result
                        this.updateBetStatus(bet);
                    });
                });
        } catch (error) {
            logError('Processing pending bets', error);
        }
    }

    updateBetStatus(bet) {
        // Implementation of bet status update logic
        // This will be called when game results are declared
        try {
            const result = this.currentGame.result;
            if (!result) return;

            let won = false;
            let payout = 0;

            // Check if bet won based on type and result
            switch (bet.bet_type) {
                case 'single_digit':
                    won = bet.bet_number === result.openPanna[0];
                    payout = won ? bet.amount * gameConfig.payouts.single_digit : 0;
                    break;
                case 'jodi':
                    won = bet.bet_number === result.jodi;
                    payout = won ? bet.amount * gameConfig.payouts.jodi : 0;
                    break;
                // Add other bet types...
            }

            const status = won ? 'won' : 'lost';

            // Update bet status and process payout if won
            db.run(`UPDATE bets SET status = ?, payout = ? WHERE id = ?`,
                [status, payout, bet.id],
                (err) => {
                    if (err) {
                        logError('Updating bet status', err);
                        return;
                    }

                    if (won) {
                        this.updateWalletBalance(bet.user_id, payout);
                    }
                });
        } catch (error) {
            logError('Updating bet status', error);
        }
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
                username: client.username || 'Unknown',
                walletBalance: client.walletBalance || 0,
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
