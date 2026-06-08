# 🌌 GestureLearn Backend Server

[![Express Version](https://img.shields.io/badge/Express-5.2.1-000000?style=for-the-badge&logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.io Version](https://img.shields.io/badge/Socket.io-4.8.3-010101?style=for-the-badge&logo=socket.io&logoColor=white)](https://socket.io/)
[![Docker Support](https://img.shields.io/badge/Docker-Enabled-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

This directory houses the Node.js Express server that orchestrates WebRTC signaling, chat messages, and gesture events for **GestureLearn**.

> [!NOTE]
> For the complete system architecture, WebRTC signaling mechanics, coordinate mapping equations, and deployment workflows, please refer to the **[Root README](../README.md)**.

---

## ⚙️ Core Responsibilities
1. **WebRTC Signaling Broker**: Relays session offers, answers, and ICE candidates between peers to bootstrap direct P2P connections.
2. **Real-time Event synchronization**:
   * Relays live chat messages (`send-message` / `chat-message`).
   * Synchronizes remote camera/microphone toggles (`media-toggle` / `remote-media-update`).
   * Broadcasts high-frequency drawing, erasing, and clearing operations (`gesture-draw`).
3. **Production Static Asset Hosting**: Serves the compiled React client build from `/frontend/build` with catch-all routing to prevent SPA reload issues (404s).

---

## 🔌 Socket.io Events Reference

| Event Name (Incoming) | Payload Structure | Action / Relay Details |
| :--- | :--- | :--- |
| `join-room` | `roomId` | Inserts the socket into the specified room. Emits `all-users` back to the sender and `user-joined` to other room members. |
| `signal` | `{ target, sender, data: { type, offer/answer/candidate } }` | Relays WebRTC signaling payloads to the specified target socket ID. |
| `media-toggle` | `{ roomId, type: "mic"\|"cam", status: boolean }` | Broadcasts media state changes (`remote-media-update`) to other users in the room. |
| `gesture-draw` | `{ roomId, mode, color, prev, curr, thickness }` | Relays normalized coordinate operations to all other sockets in the room. |
| `send-message` | `{ roomId, message }` | Relays a text message (`chat-message`) to all users in the room. |

---

## 🚀 Server Installation & Configuration

### Prerequisites
Make sure you have Node.js (v18.x or higher) installed.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Dev Server
```bash
node server.js
```
The server will run on `http://localhost:5001` (or the port specified in your `PORT` environment variable).

### 3. Environment Variables
* `PORT`: Port to run the server on (defaults to `5001`).
* `NODE_ENV`: Runs optimizations when set to `production`.

---

## 🐳 Docker Containerization
A `Dockerfile` is provided for containerized server hosting.

1. **Build Container**:
   ```bash
   docker build -t gesturelearn-backend .
   ```
2. **Run Container**:
   ```bash
   docker run -p 5001:5001 gesturelearn-backend
   ```
