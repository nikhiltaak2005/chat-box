# Personal Messenger — Windows MVP

A compact always-on-top Windows desktop chat window with account registration, login, people search, persistent one-to-one messages, and real-time delivery.

## Stack
- Electron + React + Vite desktop UI
- Node.js + Express + Socket.IO backend
- MongoDB + Mongoose message/account storage
- bcrypt password hashing and JWT authentication

## Requirements
- Node.js 20 or newer
- npm
- A MongoDB database (MongoDB Atlas works)

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

Do not commit `.env` or share your database credentials. In MongoDB Atlas, allow network access only from the server's IP when deployed; avoid broad public access where possible.

## 2. Install and run the desktop app
From the project root in a second terminal:
```bash
npm install
npm run dev
```
This starts the API, Vite UI, and Electron. The app opens as a small, draggable, resizable, always-on-top window. Use the pin icon to toggle always-on-top; the minus button minimizes and X hides the window.

## 3. Test two-person messaging locally
1. Create account A in the desktop app.
2. For account B, use another browser window pointed at `http://127.0.0.1:5173` (while Vite is running) or launch a second app instance/profile.
3. Register a second username.
4. Search/select the other person, then send a message.

For a basic local test, both clients can use the same local API. To message between different computers, deploy the backend and MongoDB, then configure `VITE_API_URL` before building the UI.

## 4. Connect to a deployed backend
Set a root `.env` file before building:
```bash
VITE_API_URL=https://your-api.example.com
```
Set the backend `CLIENT_ORIGIN` to the actual UI origin if you host a web UI too. For the packaged Electron app, the server's CORS policy should be configured intentionally for your deployment and tested with Electron's production origin behavior. Use HTTPS/WSS in production.

## 5. Build a Windows installer
```bash
npm run package:win
```
The installer is output to `release/`.

## Current MVP scope
Included: registration/login, username-based people list, one-to-one conversations, stored message history, real-time delivery, always-on-top window controls.

Not included yet: end-to-end encryption, message read receipts, file uploads, push notifications while the app is closed, password reset, rate limiting, email/phone verification, automatic updates, and production hardening. Do not use this MVP for sensitive conversations until it has been security-reviewed and hardened.
