const { timings } = require('./game-config');

class GameTimer {
    constructor() {
        this.currentPhase = null;
        this.timer = null;
        this.callbacks = {
            onPhaseChange: null,
            onGameEnd: null
        };
    }

    getTimingPhases() {
        return {
            openBetting: timings.openBetting,    // 12:00 PM - 12:12 PM
            openResult: timings.openResult,      // 12:15 PM
            closeBetting: timings.closeBetting,  // 12:00 PM - 12:28 PM
            closeResult: timings.closeResult,    // 12:30 PM
            nextGame: timings.nextGame,          // 12:35 PM
            lastGame: timings.lastGame           // 10:00 PM (22:00)
        };
    }

    calculateTimeLeft(endTime) {
        const now = new Date();
        return Math.max(0, new Date(endTime) - now);
    }

    calculateNextGameTime() {
        const now = new Date();
        const nextGame = new Date(now);
        
        // Reset to next interval
        nextGame.setMinutes(Math.ceil(now.getMinutes() / timings.nextGame) * timings.nextGame);
        nextGame.setSeconds(0);
        nextGame.setMilliseconds(0);

        // If we're past the last game time (22:00), set to tomorrow
        if (now.getHours() >= timings.lastGame) {
            nextGame.setDate(nextGame.getDate() + 1);
            nextGame.setHours(9); // Start at 9 AM next day
            nextGame.setMinutes(0);
        }

        return nextGame;
    }

    startGameCycle(gameSession) {
        if (this.timer) {
            clearInterval(this.timer);
        }

        const startTime = new Date(gameSession.start_time);
        const endTime = new Date(gameSession.end_time);

        this.timer = setInterval(() => {
            const now = new Date();
            const timeLeft = this.calculateTimeLeft(endTime);

            // Determine current phase
            let currentPhase;
            const minutesPassed = Math.floor((now - startTime) / (1000 * 60));

            if (minutesPassed < timings.openBetting) {
                currentPhase = 'openBetting';
            } else if (minutesPassed < timings.openResult) {
                currentPhase = 'waitingOpenResult';
            } else if (minutesPassed < timings.closeBetting) {
                currentPhase = 'closeBetting';
            } else if (minutesPassed < timings.closeResult) {
                currentPhase = 'waitingCloseResult';
            } else {
                currentPhase = 'ended';
            }

            // Notify phase change if needed
            if (currentPhase !== this.currentPhase) {
                this.currentPhase = currentPhase;
                if (this.callbacks.onPhaseChange) {
                    this.callbacks.onPhaseChange(currentPhase);
                }
            }

            // Check if game has ended
            if (timeLeft <= 0) {
                clearInterval(this.timer);
                if (this.callbacks.onGameEnd) {
                    this.callbacks.onGameEnd();
                }
            }
        }, 1000);
    }

    stopGameCycle() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.currentPhase = null;
    }

    onPhaseChange(callback) {
        this.callbacks.onPhaseChange = callback;
    }

    onGameEnd(callback) {
        this.callbacks.onGameEnd = callback;
    }

    isValidGameTime() {
        const now = new Date();
        const hour = now.getHours();
        // Games run between 9 AM and 10 PM
        return hour >= 9 && hour < timings.lastGame;
    }

    formatTimeLeft(endTime) {
        const timeLeft = this.calculateTimeLeft(endTime);
        const minutes = Math.floor(timeLeft / 60000);
        const seconds = Math.floor((timeLeft % 60000) / 1000);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

module.exports = new GameTimer();
