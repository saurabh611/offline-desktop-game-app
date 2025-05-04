const { contextBridge, ipcRenderer } = require('electron');
const gameConfig = require('./src/config/game-config');

// Helper to handle callback removal
const listeners = new Map();

function createListener(channel, callback) {
    const listener = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return listener;
}

function removeListener(channel, listener) {
    ipcRenderer.removeListener(channel, listener);
}

// Game validation helpers
function validatePanna(type, number) {
    switch(type) {
        case 'single_panna':
            return gameConfig.utils.isPannaSingle(number) && gameConfig.utils.isValidPanna(number);
        case 'double_panna':
            return gameConfig.utils.isPannaDouble(number) && gameConfig.utils.isValidPanna(number);
        case 'triple_panna':
            return gameConfig.utils.isPannaTriple(number) && gameConfig.utils.isValidPanna(number);
        default:
            return false;
    }
}

// Game constants
const GAME_PHASES = {
    OPEN_BETTING: 'openBetting',
    WAITING_OPEN_RESULT: 'waitingOpenResult',
    CLOSE_BETTING: 'closeBetting',
    WAITING_CLOSE_RESULT: 'waitingCloseResult',
    ENDED: 'ended'
};

// Expose protected methods that allow the renderer process to use
// specific electron APIs without exposing the entire API
contextBridge.exposeInMainWorld('electron', {
    // Authentication
    register: (userData) => ipcRenderer.invoke('user:register', userData),
    login: (credentials) => ipcRenderer.invoke('user:login', credentials),
    logout: () => ipcRenderer.invoke('user:logout'),
    
    // Wallet operations
    getWalletBalance: () => ipcRenderer.invoke('wallet:getBalance'),
    updateWallet: (userId, amount) => ipcRenderer.invoke('wallet:update', userId, amount),
    
    // Game operations
    placeBet: (betData) => ipcRenderer.invoke('game:placeBet', betData),
    getGameState: () => ipcRenderer.invoke('game:getState'),
    getGameResults: () => ipcRenderer.invoke('game:getResults'),
    getGamePhase: () => ipcRenderer.invoke('game:getPhase'),
    validatePanna,
    
    // Admin specific operations
    startGame: () => ipcRenderer.invoke('admin:startGame'),
    stopGame: () => ipcRenderer.invoke('admin:stopGame'),
    setGameResult: (result, mode) => ipcRenderer.invoke('admin:setResult', { result, mode }),
    getUsersList: () => ipcRenderer.invoke('admin:getUsers'),
    getBettingHistory: () => ipcRenderer.invoke('admin:getBettingHistory'),
    
    // Event listeners with cleanup
    on: (channel, callback) => {
        if (!listeners.has(channel)) {
            listeners.set(channel, new Set());
        }
        const listener = createListener(channel, callback);
        listeners.get(channel).add(listener);
        return () => {
            removeListener(channel, listener);
            listeners.get(channel).delete(listener);
        };
    },

    // WebSocket events
    onWalletUpdate: (callback) => {
        const cleanup = ipcRenderer.on('wallet:updated', (event, data) => callback(data));
        return () => cleanup();
    },
    onGameStateChange: (callback) => {
        const cleanup = ipcRenderer.on('game:stateChanged', (event, state) => callback(state));
        return () => cleanup();
    },
    onGamePhaseChange: (callback) => {
        const cleanup = ipcRenderer.on('game:phaseChanged', (event, phase) => callback(phase));
        return () => cleanup();
    },
    onResultDeclared: (callback) => {
        const cleanup = ipcRenderer.on('game:resultDeclared', (event, result) => callback(result));
        return () => cleanup();
    },
    onConnectionStatus: (callback) => {
        const cleanup = ipcRenderer.on('connection:status', (event, status) => callback(status));
        return () => cleanup();
    },
    onError: (callback) => {
        const cleanup = ipcRenderer.on('error', (event, error) => callback(error));
        return () => cleanup();
    },
    onBetResponse: (callback) => {
        const cleanup = ipcRenderer.on('bet:response', (event, response) => callback(response));
        return () => cleanup();
    },
    onBetPlaced: (callback) => {
        const cleanup = ipcRenderer.on('bet:placed', (event, bet) => callback(bet));
        return () => cleanup();
    },
    
    // System info
    getIPAddress: () => ipcRenderer.invoke('system:getIP'),
    getSystemInfo: () => ipcRenderer.invoke('system:getInfo'),

    // Connection
    connectToServer: (serverIP) => ipcRenderer.invoke('system:connectToServer', serverIP),
    disconnectFromServer: () => ipcRenderer.invoke('system:disconnect'),
    
    // Game constants
    constants: {
        PAYOUT_MULTIPLIERS: gameConfig.payouts,
        GAME_TIMINGS: gameConfig.timings,
        GAME_PHASES: GAME_PHASES
    },
    
    // Cleanup all listeners for a channel
    removeAllListeners: (channel) => {
        if (listeners.has(channel)) {
            listeners.get(channel).forEach(listener => {
                removeListener(channel, listener);
            });
            listeners.get(channel).clear();
        }
    }
});

// Cleanup on window unload
window.addEventListener('unload', () => {
    listeners.forEach((channelListeners, channel) => {
        channelListeners.forEach(listener => {
            removeListener(channel, listener);
        });
    });
    listeners.clear();
});
