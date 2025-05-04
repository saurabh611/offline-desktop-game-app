# Offline Desktop Game Application

A fully offline desktop game application built with Electron.js, Node.js, and SQLite. Supports admin and user roles with real-time communication over LAN/Wi-Fi.

## Features

- Fully offline operation - no internet required
- Admin computer acts as local server
- Multiple user computers can connect via LAN/Wi-Fi
- Real-time game updates and wallet management
- Secure user authentication
- Automated game cycles with configurable timings
- Manual and automatic result generation
- Support for multiple bet types with different payouts

## Installation

1. Install dependencies:
```bash
npm install
```

2. Initialize the SQLite database:
```bash
node src/database/init.js
```

## Running the Application

### Admin Mode
To run the application in admin mode (server):
```bash
npm run start:admin
```

The admin interface will display the server's IP address that users need to connect to.

### User Mode
To run the application in user mode (client):
```bash
npm run start:user
```

When registering as a new user, you'll need to enter the admin server's IP address.

## Game Cycle

Each game cycle lasts 35 minutes with the following phases:
- Open Betting: First 12 minutes
- Open Result: At 15 minutes
- Close Betting: Until 28 minutes
- Close Result: At 30 minutes
- Next Game: Starts at 35 minutes

The last game cycle ends at 10:00 PM and the system auto-resets daily.

## Bet Types and Payouts

| Bet Type      | Payout Formula    |
|---------------|-------------------|
| Single Digit  | ₹9 × Bet Amount  |
| Jodi          | ₹90 × Bet Amount |
| Single Panna  | ₹150 × Bet Amount|
| Double Panna  | ₹300 × Bet Amount|
| Triple Panna  | ₹600 × Bet Amount|

## Default Admin Credentials

Username: admin
Password: admin123

## Technical Details

- Frontend: Electron.js with Tailwind CSS
- Backend: Node.js
- Database: SQLite
- Communication: WebSocket for real-time updates
- Local Network: Uses LAN/Wi-Fi for connectivity

## Security Notes

- All data is stored locally
- Passwords are hashed before storage
- No external internet connection required
- Communication is limited to local network

## Configuration

Game settings can be modified in `src/config/game-config.js`:
- Game cycle timings
- Payout multipliers
- Valid panna numbers
- Result generation logic
