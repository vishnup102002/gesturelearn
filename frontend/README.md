# 🌌 GestureLearn Frontend Client

[![Vite Build](https://img.shields.io/badge/Vite-5.4.19-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React Version](https://img.shields.io/badge/React-18.3.1-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.17-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![MediaPipe Hands](https://img.shields.io/badge/MediaPipe-Hands-0288D1?style=for-the-badge&logo=google&logoColor=white)](https://google.github.io/mediapipe/solutions/hands.html)

This directory contains the React application for the **GestureLearn** frontend client.

> [!NOTE]
> For the complete system architecture, WebRTC signaling mechanics, coordinate mapping equations, and deployment workflows, please refer to the **[Root README](../README.md)**.

---

## 🛠️ Tech Stack & Key Libraries
* **Build System & Bundler**: Vite (using `@vitejs/plugin-react-swc` for ultra-fast compilation)
* **Application Library**: React 18 + TypeScript (enforcing strong typing across peer connections and landmark models)
* **Computer Vision Inference**: Google MediaPipe Hands (`@mediapipe/hands`) loaded via WebAssembly CDN
* **Real-time Networking**: `socket.io-client` for peer signaling and gesture data relays
* **Video/Audio Protocol**: Native browser WebRTC (`RTCPeerConnection`)
* **Styling**: Tailwind CSS + `shadcn-ui` (Radix UI primitives) + Cyberpunk glassmorphism layout

---

## 🚀 Client Setup & Commands

### Prerequisites
Make sure you have Node.js and a package manager (npm or bun) installed.

### 1. Environment Variable Setup
Ensure you configure the signaling server endpoint by creating a `.env` file in this folder:
```env
VITE_SIGNALING_SERVER=http://localhost:5001
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start Development Server
```bash
npm run dev
```
Starts the Vite dev server locally at `http://localhost:8080` (or the next available port) with hot module replacement (HMR).

### 4. Build for Production
```bash
npm run build
```
Compiles and bundles the application to the `/build` directory. The production Express server inside `../backend/server.js` is configured to serve static assets directly from this folder.

### 5. Run Linter
```bash
npm run lint
```
Runs ESLint to enforce code quality guidelines.

---

## 📂 Key File Map
* [App.tsx](file:///Users/vishnup/Desktop/gesturelearn/frontend/src/App.tsx): Client Router and Context Providers.
* [pages/Index.tsx](file:///Users/vishnup/Desktop/gesturelearn/frontend/src/pages/Index.tsx): Neon-glowing home dashboard for initiating/joining learning rooms.
* [pages/Room.tsx](file:///Users/vishnup/Desktop/gesturelearn/frontend/src/pages/Room.tsx): Core container managing getUserMedia camera feeds, canvas mirror translations, MediaPipe Hand inference loops, WebRTC RTCPeerConnections, and Socket.io channel routing.
* [pages/Room.css](file:///Users/vishnup/Desktop/gesturelearn/frontend/src/pages/Room.css): Dark room UI layout classes, styling for participants' video feeds, glow cards, and floating color palettes.
* [components/GlowCanvas.tsx](file:///Users/vishnup/Desktop/gesturelearn/frontend/src/components/GlowCanvas.tsx): Custom interactive canvas background rendering trailing particle effects on pointer movement.
