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

let isLogin = true;
let currentGame = null;
let currentUser = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupWebSocketListeners();
});

function setupEventListeners() {
    // Auth form toggle
    toggleAuthBtn.addEventListener('click', () => {
        isLogin = !isLogin;
        authTitle.textContent = isLogin ? 'Login' : 'Register';
        toggleAuthBtn.textContent = isLogin ? 'Register instead' : 'Login instead';
        serverIpInput.style.display = isLogin ? 'none' : 'block';
        authForm.reset();
    });

    // Auth form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const serverIP = document.getElementById('server-ip').value;

        try {
            if (isLogin) {
                currentUser = await window.electron.login({ username, password });
            } else {
                await window.electron.register({ username, password });
                // Connect to admin server after registration
                await window.electron.connectToServer(serverIP);
                currentUser = await window.electron.login({ username, password });
            }

            if (currentUser) {
                authModal.classList.add('hidden');
                mainContent.classList.remove('hidden');
                updateWalletDisplay(currentUser.walletBalance);
            }
        } catch (error) {
            alert(error.message);
        }
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
        location.reload();
    });

    // Bet form
    betForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentGame || currentGame.status !== 'active') {
            alert('No active game session');
            return;
        }

        const betData = {
            type: betType.value,
            number: betNumber.value,
            amount: parseFloat(betAmount.value)
        };

        if (!validateBet(betData)) {
            alert('Please enter valid bet details');
            return;
        }

        try {
            await window.electron.placeBet(betData);
            betForm.reset();
            updatePotentialPayout();
        } catch (error) {
            alert(error.message);
        }
    });

    // Update potential payout on input change
    betType.addEventListener('change', updatePotentialPayout);
    betAmount.addEventListener('input', updatePotentialPayout);
}

function setupWebSocketListeners() {
    // Game state updates
    window.electron.onGameStateChange((game) => {
        currentGame = game;
        updateGameDisplay();
    });

    // Wallet updates
    window.electron.onWalletUpdate((balance) => {
        updateWalletDisplay(balance);
    });

    // Result updates
    window.electron.onResultDeclared((result) => {
        showResult(result);
    });

    // Bet response
    window.electron.onBetResponse((response) => {
        if (response.success) {
            addBetToHistory(response.bet);
        } else {
            alert(response.message);
        }
    });
}

function validateBet(betData) {
    const { type, number, amount } = betData;

    if (amount <= 0) return false;

    switch (type) {
        case 'single_digit':
            return /^\d$/.test(number);
        case 'jodi':
            return /^\d{2}$/.test(number);
        case 'single_panna':
        case 'double_panna':
        case 'triple_panna':
            return /^\d{3}$/.test(number);
        default:
            return false;
    }
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
    potentialPayout.textContent = `₹${payout.toFixed(2)}`;
}

function updateWalletDisplay(balance) {
    if (typeof balance !== 'number' || isNaN(balance)) {
        walletBalance.textContent = '₹0.00';
        return;
    }
    walletBalance.textContent = `₹${balance.toFixed(2)}`;
}

function updateGameDisplay() {
    if (!currentGame) {
        gameTimer.textContent = '00:00';
        return;
    }

    const now = new Date();
    const endTime = new Date(currentGame.endTime);
    const timeLeft = Math.max(0, endTime - now);

    if (timeLeft > 0) {
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        gameTimer.textContent = '00:00';
    }
}

function showResult(result) {
    // Animate result display
    currentResult.classList.add('spinning');
    setTimeout(() => {
        currentResult.textContent = `${result.openPanna} ${result.jodi} ${result.closePanna}`;
        currentResult.classList.remove('spinning');
        addToResultHistory(result);
    }, 3000);
}

function addToResultHistory(result) {
    const historyItem = document.createElement('div');
    historyItem.className = 'bg-gray-50 p-2 rounded text-sm font-mono';
    historyItem.textContent = `${result.openPanna} ${result.jodi} ${result.closePanna}`;
    
    resultHistory.insertBefore(historyItem, resultHistory.firstChild);
    
    // Keep only last 5 results
    while (resultHistory.children.length > 5) {
        resultHistory.removeChild(resultHistory.lastChild);
    }
}

function addBetToHistory(bet) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${new Date(bet.created_at).toLocaleTimeString()}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${bet.bet_type}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${bet.bet_number}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ₹${bet.amount.toFixed(2)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${bet.result || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                ${bet.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                bet.status === 'won' ? 'bg-green-100 text-green-800' : 
                'bg-red-100 text-red-800'}">
                ${bet.status}
            </span>
        </td>
    `;
    bettingHistory.insertBefore(row, bettingHistory.firstChild);
}

// Update timer display every second
setInterval(updateGameDisplay, 1000);
