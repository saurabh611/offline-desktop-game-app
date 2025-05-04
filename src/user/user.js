// DOM Elements
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const toggleAuthBtn = document.getElementById('toggle-auth');
const mainContent = document.getElementById('main-content');
const serverIpInput = document.getElementById('server-ip-input');
const logoutBtn = document.getElementById('logout');
const walletBalance = document.getElementById('wallet-balance');
const gameTimer = document.getElementById('game-timer');
const currentResult = document.getElementById('current-result');
const resultHistory = document.getElementById('result-history');
const betForm = document.getElementById('bet-form');
const betType = document.getElementById('bet-type');
const betNumber = document.getElementById('bet-number');
const betAmount = document.getElementById('bet-amount');
const potentialPayout = document.getElementById('potential-payout');
const bettingHistory = document.getElementById('betting-history');
const connectionStatus = document.getElementById('connection-status');
const gamePhase = document.getElementById('game-phase');
const notifications = document.getElementById('notifications');

// State management
let isLogin = true;
let currentGame = null;
let currentUser = null;
let lastNotificationTimeout = null;

// Constants
const NOTIFICATION_DURATION = 5000; // 5 seconds

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupWebSocketListeners();
    setupFormValidation();
});

// Cleanup on window unload
window.addEventListener('unload', () => {
    if (window.updateTimer) {
        clearInterval(window.updateTimer);
    }
});

function setupFormValidation() {
    // Add input validation for bet number based on selected type
    betType.addEventListener('change', () => {
        const type = betType.value;
        let maxLength, pattern;
        
        switch(type) {
            case 'single_digit':
                maxLength = 1;
                pattern = '[0-9]';
                break;
            case 'jodi':
                maxLength = 2;
                pattern = '[0-9]{2}';
                break;
            case 'single_panna':
            case 'double_panna':
            case 'triple_panna':
                maxLength = 3;
                pattern = '[0-9]{3}';
                break;
        }
        
        betNumber.setAttribute('maxlength', maxLength);
        betNumber.setAttribute('pattern', pattern);
        betNumber.value = ''; // Clear existing value
        updatePotentialPayout();
    });

    // Validate bet amount
    betAmount.addEventListener('input', () => {
        const amount = parseFloat(betAmount.value);
        if (amount < 1) {
            betAmount.setCustomValidity('Minimum bet amount is ₹1');
        } else if (amount > 10000) {
            betAmount.setCustomValidity('Maximum bet amount is ₹10,000');
        } else {
            betAmount.setCustomValidity('');
        }
        updatePotentialPayout();
    });
}

function setupEventListeners() {
    // Auth form toggle
    toggleAuthBtn.addEventListener('click', () => {
        isLogin = !isLogin;
        authTitle.textContent = isLogin ? 'Login' : 'Register';
        toggleAuthBtn.textContent = isLogin ? 'Register instead' : 'Login instead';
        serverIpInput.style.display = isLogin ? 'none' : 'block';
        authForm.reset();
    });

    // Auth form submission with improved error handling
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitButton = authForm.querySelector('button[type="submit"]');
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const serverIP = document.getElementById('server-ip').value;

        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            if (isLogin) {
                currentUser = await window.electron.login({ username, password });
            } else {
                await window.electron.register({ username, password });
                await window.electron.connectToServer(serverIP);
                currentUser = await window.electron.login({ username, password });
            }

            if (currentUser) {
                showNotification('Successfully logged in', 'success');
                authModal.classList.add('hidden');
                mainContent.classList.remove('hidden');
                updateWalletDisplay(currentUser.walletBalance);
            }
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = isLogin ? 'Login' : 'Register';
        }
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
        location.reload();
    });

    // Bet form with improved validation and feedback
    betForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitButton = betForm.querySelector('button[type="submit"]');

        if (!currentGame || currentGame.status !== 'active') {
            showNotification('No active game session', 'error');
            return;
        }

        if (currentGame.phase !== 'openBetting' && currentGame.phase !== 'closeBetting') {
            showNotification('Betting is currently closed', 'error');
            return;
        }

        const betData = {
            type: betType.value,
            number: betNumber.value,
            amount: parseFloat(betAmount.value)
        };

        if (!validateBet(betData)) {
            showNotification('Please enter valid bet details', 'error');
            return;
        }

        try {
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Placing Bet...';

            await window.electron.placeBet(betData);
            betForm.reset();
            updatePotentialPayout();
            showNotification('Bet placed successfully', 'success');
        } catch (error) {
            showNotification(error.message, 'error');
        } finally {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Place Bet';
        }
    });

    // Update potential payout on input change
    betType.addEventListener('change', updatePotentialPayout);
    betAmount.addEventListener('input', updatePotentialPayout);
}

function showNotification(message, type = 'info') {
    if (lastNotificationTimeout) {
        clearTimeout(lastNotificationTimeout);
    }

    const notification = document.createElement('div');
    notification.className = `fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white transform transition-transform duration-300 ease-in-out ${
        type === 'error' ? 'bg-red-500' :
        type === 'success' ? 'bg-green-500' :
        'bg-blue-500'
    }`;
    notification.textContent = message;

    // Remove existing notifications
    while (notifications.firstChild) {
        notifications.removeChild(notifications.firstChild);
    }

    notifications.appendChild(notification);

    // Animate in
    requestAnimationFrame(() => {
        notification.style.transform = 'translateY(0)';
    });

    // Remove after duration
    lastNotificationTimeout = setTimeout(() => {
        notification.style.transform = 'translateY(100%)';
        setTimeout(() => {
            if (notifications.contains(notification)) {
                notifications.removeChild(notification);
            }
        }, 300);
    }, NOTIFICATION_DURATION);
}

function setupWebSocketListeners() {
    // Connection status updates
    window.electron.onConnectionStatus(({ status, serverUrl }) => {
        connectionStatus.className = `px-2 py-1 rounded text-sm ${
            status === 'connected' ? 'bg-green-100 text-green-800' :
            status === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
            'bg-red-100 text-red-800'
        }`;
        connectionStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    });

    // Game state and phase updates
    window.electron.onGameStateChange((game) => {
        currentGame = game;
        updateGameDisplay();
        updateBetFormState();
    });

    window.electron.onGamePhaseChange((phase) => {
        gamePhase.textContent = phase;
        updateBetFormState();
    });

    // Wallet updates with animation
    window.electron.onWalletUpdate(({ balance, change }) => {
        const oldBalance = parseFloat(walletBalance.textContent.replace('₹', ''));
        updateWalletDisplay(balance);
        
        if (change > 0) {
            showNotification(`Added ₹${change.toFixed(2)} to wallet`, 'success');
        } else if (change < 0) {
            showNotification(`Deducted ₹${Math.abs(change).toFixed(2)} from wallet`, 'info');
        }
    });

    // Result updates with animation
    window.electron.onResultDeclared(({ result, animate }) => {
        if (animate) {
            showResult(result);
        } else {
            updateResult(result);
        }
    });

    // Bet response with improved feedback
    window.electron.onBetResponse((response) => {
        if (response.success) {
            addBetToHistory(response.bet);
            showNotification('Bet placed successfully', 'success');
        } else {
            showNotification(response.message, 'error');
        }
    });

    // Error handling
    window.electron.onError(({ message }) => {
        showNotification(message, 'error');
    });
}

function validateBet(betData) {
    const { type, number, amount } = betData;

    // Validate amount
    if (amount < 1 || amount > 10000) {
        showNotification('Bet amount must be between ₹1 and ₹10,000', 'error');
        return false;
    }

    // Validate number format based on type
    switch (type) {
        case 'single_digit':
            if (!/^\d$/.test(number)) {
                showNotification('Single digit bet must be a single number (0-9)', 'error');
                return false;
            }
            break;
        case 'jodi':
            if (!/^\d{2}$/.test(number)) {
                showNotification('Jodi bet must be two digits (00-99)', 'error');
                return false;
            }
            break;
        case 'single_panna':
        case 'double_panna':
        case 'triple_panna':
            if (!/^\d{3}$/.test(number)) {
                showNotification('Panna bet must be three digits (000-999)', 'error');
                return false;
            }
            // Validate against game config panna list
            if (!window.electron.validatePanna(type, number)) {
                showNotification('Invalid panna number for selected type', 'error');
                return false;
            }
            break;
        default:
            showNotification('Invalid bet type', 'error');
            return false;
    }

    return true;
}

function updatePotentialPayout() {
    const amount = parseFloat(betAmount.value) || 0;
    const multipliers = {
        'single_digit': 9,
        'jodi': 90,
        'single_panna': 150,
        'double_panna': 300,
        'triple_panna': 600
    };
    
    const payout = amount * multipliers[betType.value];
    
    // Animate payout update
    const currentPayout = parseFloat(potentialPayout.textContent.replace('₹', '')) || 0;
    if (currentPayout !== payout) {
        potentialPayout.classList.add('text-green-600');
        setTimeout(() => potentialPayout.classList.remove('text-green-600'), 300);
    }
    
    potentialPayout.textContent = `₹${payout.toFixed(2)}`;
}

function updateWalletDisplay(balance) {
    if (typeof balance !== 'number' || isNaN(balance)) {
        walletBalance.textContent = '₹0.00';
        return;
    }

    const currentBalance = parseFloat(walletBalance.textContent.replace('₹', ''));
    if (balance > currentBalance) {
        walletBalance.classList.add('text-green-600');
        setTimeout(() => walletBalance.classList.remove('text-green-600'), 1000);
    } else if (balance < currentBalance) {
        walletBalance.classList.add('text-red-600');
        setTimeout(() => walletBalance.classList.remove('text-red-600'), 1000);
    }

    walletBalance.textContent = `₹${balance.toFixed(2)}`;
}

function updateGameDisplay() {
    if (!currentGame) {
        gameTimer.textContent = '00:00';
        gamePhase.textContent = 'No Active Game';
        updateBetFormState();
        return;
    }

    const now = new Date();
    const endTime = new Date(currentGame.endTime);
    const timeLeft = Math.max(0, endTime - now);

    // Update timer display
    if (timeLeft > 0) {
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Add urgency indication when less than 1 minute remains
        if (timeLeft < 60000) {
            gameTimer.classList.add('text-red-600', 'animate-pulse');
        } else {
            gameTimer.classList.remove('text-red-600', 'animate-pulse');
        }
    } else {
        gameTimer.textContent = '00:00';
        gameTimer.classList.remove('text-red-600', 'animate-pulse');
    }

    // Update game phase display
    const phase = currentGame.phase || 'unknown';
    gamePhase.textContent = phase.charAt(0).toUpperCase() + phase.slice(1);
    
    // Update betting form state
    updateBetFormState();
}

function updateBetFormState() {
    const submitButton = betForm.querySelector('button[type="submit"]');
    
    if (!currentGame || currentGame.status !== 'active') {
        betForm.classList.add('opacity-50');
        submitButton.disabled = true;
        submitButton.title = 'No active game session';
        return;
    }

    const phase = currentGame.phase;
    if (phase === 'openBetting' || phase === 'closeBetting') {
        betForm.classList.remove('opacity-50');
        submitButton.disabled = false;
        submitButton.title = 'Place your bet';
    } else {
        betForm.classList.add('opacity-50');
        submitButton.disabled = true;
        submitButton.title = 'Betting is currently closed';
    }
}

function showResult(result) {
    // Start spinning animation
    currentResult.classList.add('spinning');
    currentResult.classList.add('blur-sm');
    
    // Play spinning animation for 3 seconds
    setTimeout(() => {
        updateResult(result);
        currentResult.classList.remove('spinning', 'blur-sm');
        
        // Add highlight effect
        currentResult.classList.add('bg-yellow-100');
        setTimeout(() => {
            currentResult.classList.remove('bg-yellow-100');
        }, 1000);
    }, 3000);
}

function updateResult(result) {
    currentResult.textContent = `${result.openPanna} ${result.jodi} ${result.closePanna}`;
    addToResultHistory(result);
}

function addToResultHistory(result) {
    const historyItem = document.createElement('div');
    historyItem.className = 'bg-gray-50 p-2 rounded text-sm font-mono transform transition-all duration-300 scale-0';
    
    const timestamp = document.createElement('div');
    timestamp.className = 'text-xs text-gray-500 mb-1';
    timestamp.textContent = new Date().toLocaleTimeString();
    
    const resultText = document.createElement('div');
    resultText.className = 'flex justify-between items-center';
    resultText.innerHTML = `
        <span class="text-blue-600">${result.openPanna}</span>
        <span class="text-green-600">${result.jodi}</span>
        <span class="text-purple-600">${result.closePanna}</span>
    `;
    
    historyItem.appendChild(timestamp);
    historyItem.appendChild(resultText);
    resultHistory.insertBefore(historyItem, resultHistory.firstChild);
    
    // Animate entry
    requestAnimationFrame(() => {
        historyItem.classList.add('scale-100');
    });
    
    // Keep only last 5 results with animation
    if (resultHistory.children.length > 5) {
        const lastItem = resultHistory.lastChild;
        lastItem.classList.add('scale-0');
        setTimeout(() => {
            if (resultHistory.contains(lastItem)) {
                resultHistory.removeChild(lastItem);
            }
        }, 300);
    }
}

function addBetToHistory(bet) {
    const row = document.createElement('tr');
    row.className = 'transform transition-all duration-300 scale-0';
    
    const statusClass = 
        bet.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
        bet.status === 'won' ? 'bg-green-100 text-green-800' :
        'bg-red-100 text-red-800';
    
    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${new Date(bet.created_at).toLocaleTimeString()}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${bet.bet_type.replace('_', ' ').toUpperCase()}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-mono">
            ${bet.bet_number}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
            <span class="font-semibold">₹${bet.amount.toFixed(2)}</span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
            ${bet.result ? `<span class="font-mono">${bet.result}</span>` : '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClass}">
                ${bet.status.toUpperCase()}
            </span>
        </td>
    `;
    
    bettingHistory.insertBefore(row, bettingHistory.firstChild);
    
    // Animate entry
    requestAnimationFrame(() => {
        row.classList.add('scale-100');
    });
    
    // Limit history size with animation
    const maxHistory = 20;
    if (bettingHistory.children.length > maxHistory) {
        const lastRow = bettingHistory.lastChild;
        lastRow.classList.add('scale-0');
        setTimeout(() => {
            if (bettingHistory.contains(lastRow)) {
                bettingHistory.removeChild(lastRow);
            }
        }, 300);
    }
}

// Update timer display every second
setInterval(updateGameDisplay, 1000);
