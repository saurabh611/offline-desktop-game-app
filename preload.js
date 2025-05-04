const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// specific electron APIs without exposing the entire API
contextBridge.exposeInMainWorld(
    'electron', {
        // Authentication
        register: (userData) => ipcRenderer.invoke('user:register', userData),
        login: (credentials) => ipcRenderer.invoke('user:login', credentials),
        
        // Wallet operations
        getWalletBalance: () => ipcRenderer.invoke('wallet:getBalance'),
        updateWallet: (amount) => ipcRenderer.invoke('wallet:update', amount),
        
        // Game operations
        placeBet: (betData) => ipcRenderer.invoke('game:placeBet', betData),
        getGameState: () => ipcRenderer.invoke('game:getState'),
        getGameResults: () => ipcRenderer.invoke('game:getResults'),
        
        // Admin specific operations
        startGame: () => ipcRenderer.invoke('admin:startGame'),
        stopGame: () => ipcRenderer.invoke('admin:stopGame'),
        setGameResult: (result) => ipcRenderer.invoke('admin:setResult', result),
        getUsersList: () => ipcRenderer.invoke('admin:getUsers'),
        getBettingHistory: () => ipcRenderer.invoke('admin:getBettingHistory'),
        
        // WebSocket events
        onWalletUpdate: (callback) => ipcRenderer.on('wallet:updated', callback),
        onGameStateChange: (callback) => ipcRenderer.on('game:stateChanged', callback),
        onResultDeclared: (callback) => ipcRenderer.on('game:resultDeclared', callback),
        onConnectionStatus: (callback) => ipcRenderer.on('connection:status', callback),
        
        // System info
        getIPAddress: () => ipcRenderer.invoke('system:getIP')
    }
);
