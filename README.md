# PocketChat — Windows Desktop Messenger

A private, customizable desktop messenger with one-to-one chats, real-time group conversations, and a floating always-on-top pet companion.

## Features
- Account registration and login with bcrypt password hashing and JWT sessions
- Exact-username friend lookup; no public user directory or automatic people discovery
- Friend requests with accept, reject, and remove-friend controls
- Private group chats with group name, description, photo, member management, admin promotion/demotion, and leave controls
- Real-time group and direct messages with persistent history
- GIFs, stickers, message replies, reactions, and delete-for-me / delete-for-everyone
- Customizable themes, accent colour, chat wallpaper, font size, density, and message bubbles
- Floating pet with custom avatar, name, hide/show label, size, opacity, and animation
- Windows always-on-top pin control and in-app update support

## Stack
- Electron + React + Vite desktop UI
- Node.js + Express + Socket.IO backend
- MongoDB + Mongoose storage
- bcrypt password hashing and JWT authentication

## Requirements
- Node.js 20 or newer
- npm
- MongoDB database (MongoDB Atlas works)

## 1. Configure the backend
```bash
cd server
npm install
copy .env.example .env
```

Edit `server/.env`:
- `MONGODB_URI`: your MongoDB connection string
- `JWT_SECRET`: a random secret with at least 32 characters
- `CLIENT_ORIGIN=http://127.0.0.1:5173`

Do not commit `.env` or share database credentials. In MongoDB Atlas, restrict network access to the backend host where possible.

## 2. Install and run the desktop app
From the project root in a second terminal:
```bash
npm install
npm run dev
```

This starts the API, Vite UI, and Electron. Use the pin icon to keep the chat window above other apps. When unpinned, it hides on focus loss; the floating pet remains always-on-top.

## 3. Try direct and group messaging
1. Register two or more accounts on the same backend.
2. In the Chats tab, send a friend request using the exact username.
3. Accept the incoming request on the other account.
4. Open Chats for direct messages, or Groups → New group to create a private group with at least two accepted friends.
5. Group admins can edit group details, add accepted friends, promote/demote admins, and remove members.

## 4. Connect to a deployed backend
Set a root `.env` file before building:
```bash
VITE_API_URL=https://your-api.example.com
```

Set backend `CLIENT_ORIGIN` to your hosted UI origin when applicable. Use HTTPS/WSS in production.

## 5. Build a Windows installer
```bash
npm run package:win
```

The installer is output to `release/`.

## Validation
The GitHub Actions validation workflow builds the React UI, checks backend/Electron syntax, and runs backend smoke tests covering account privacy, friend requests, direct messages, group membership, group realtime messaging, reactions, and deletion.

## Security scope
Group and direct chats are authenticated and membership-checked, but this release is not end-to-end encrypted. Other production-hardening work such as password reset, email/phone verification, and comprehensive rate limiting remains future work. Do not use this MVP for highly sensitive conversations until it has received an independent security review.
