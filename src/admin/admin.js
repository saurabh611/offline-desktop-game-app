// Get references to DOM elements
const serverIpDisplay = document.getElementById('server-ip');
const connectedUsersDisplay = document.getElementById('connected-users');
const gameTimer = document.getElementById('game-timer');
const startGameBtn = document.getElementById('start-game');
const stopGameBtn = document.getElementById('stop-game');
const declareResultBtn = document.getElementById('declare-result');
const usersList = document.getElementById('users-list');
const betsList = document.getElementById('bets-list');
const manualResultInputs = document.querySelectorAll('#manual-result-input input');
const resultModeInputs = document.querySelectorAll('input[name="result-mode"]');

let currentGame = null;
let timerInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Get and display server IP
    const ip = await window.electron.getIPAddress();
    serverIpDisplay.textContent = ip;

    // Set up event listeners
    setupEventListeners();
    
    // Start listening for updates
    setupWebSocketListeners();
});

function setupEventListeners() {
    startGameBtn.addEventListener('click', startGame);
    stopGameBtn.addEventListener('click', stopGame);
    declareResultBtn.addEventListener('click', declareResult);

    // Result mode toggle
    resultModeInputs.forEach(input => {
        input.addEventListener('change', (e) => {
            const manualInputs = document.getElementById('manual-result-input');
            manualInputs.style.display = e.target.value === 'manual' ? 'grid' : 'none';
        });
    });
}

function setupWebSocketListeners() {
    // Listen for game state updates
    window.electron.onGameStateChange((game) => {
        currentGame = game;
        updateGameDisplay();
    });

    // Listen for user list updates
    window.electron.onConnectionStatus((data) => {
        connectedUsersDisplay.textContent = data.connectedUsers;
        updateUsersList(data.users);
    });

    // Listen for new bets
    window.electron.onBetPlaced((bet) => {
        addBetToList(bet);
    });
}

async function startGame() {
    try {
        await window.electron.startGame();
        startGameBtn.disabled = true;
        stopGameBtn.disabled = false;
    } catch (error) {
        console.error('Failed to start game:', error);
    }
}

async function stopGame() {
    try {
        await window.electron.stopGame();
        startGameBtn.disabled = false;
        stopGameBtn.disabled = true;
    } catch (error) {
        console.error('Failed to stop game:', error);
    }
}

async function declareResult() {
    const resultMode = document.querySelector('input[name="result-mode"]:checked').value;
    
    if (resultMode === 'manual') {
        const [openPanna, jodi, closePanna] = Array.from(manualResultInputs).map(input => input.value);
        
        if (!validateResult(openPanna, jodi, closePanna)) {
            alert('Please enter valid numbers for the result');
            return;
        }

        try {
            await window.electron.setGameResult({
                openPanna,
                jodi,
                closePanna,
                mode: 'manual'
            });
        } catch (error) {
            console.error('Failed to set result:', error);
        }
    } else {
        try {
            await window.electron.setGameResult({ mode: 'auto' });
        } catch (error) {
            console.error('Failed to set auto result:', error);
        }
    }
}

function validateResult(openPanna, jodi, closePanna) {
    // Validate open panna (3 digits)
    if (!/^\d{3}$/.test(openPanna)) return false;
    
    // Validate jodi (2 digits)
    if (!/^\d{2}$/.test(jodi)) return false;
    
    // Validate close panna (3 digits)
    if (!/^\d{3}$/.test(closePanna)) return false;
    
    return true;
}

function updateGameDisplay() {
    if (!currentGame) {
        gameTimer.textContent = '00:00';
        startGameBtn.disabled = false;
        stopGameBtn.disabled = true;
        return;
    }

    const now = new Date();
    const endTime = new Date(currentGame.endTime);
    const timeLeft = Math.max(0, endTime - now);

    if (timeLeft > 0) {
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        gameTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        startGameBtn.disabled = true;
        stopGameBtn.disabled = false;
    } else {
        gameTimer.textContent = '00:00';
        startGameBtn.disabled = false;
        stopGameBtn.disabled = true;
    }
}

function updateUsersList(users) {
    usersList.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                    <div class="text-sm font-medium text-gray-900">${user.username}</div>
                </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
                <div class="text-sm text-gray-900">₹${user.walletBalance.toFixed(2)}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm">
                <button onclick="addMoney('${user.id}')" class="text-green-600 hover:text-green-900 mr-3">
                    <i class="fas fa-plus-circle"></i>
                </button>
                <button onclick="removeMoney('${user.id}')" class="text-red-600 hover:text-red-900">
                    <i class="fas fa-minus-circle"></i>
                </button>
            </td>
        `;
        usersList.appendChild(row);
    });
}

async function addMoney(userId) {
    const amount = prompt('Enter amount to add:');
    if (amount && !isNaN(amount)) {
        try {
            await window.electron.updateWallet(userId, parseFloat(amount));
        } catch (error) {
            console.error('Failed to add money:', error);
        }
    }
}

async function removeMoney(userId) {
    const amount = prompt('Enter amount to remove:');
    if (amount && !isNaN(amount)) {
        try {
            await window.electron.updateWallet(userId, -parseFloat(amount));
        } catch (error) {
            console.error('Failed to remove money:', error);
        }
    }
}

function addBetToList(bet) {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            ${new Date(bet.created_at).toLocaleTimeString()}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            ${bet.username}
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
        <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                ${bet.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                bet.status === 'won' ? 'bg-green-100 text-green-800' : 
                'bg-red-100 text-red-800'}">
                ${bet.status}
            </span>
        </td>
    `;
    betsList.insertBefore(row, betsList.firstChild);
}

// Update timer display every second
setInterval(updateGameDisplay, 1000);
