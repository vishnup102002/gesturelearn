// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");

// const app = express();
// app.use(cors());

// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: "*", // This allows connections from ANYWHERE (localhost, ngrok, etc.)
//     methods: ["GET", "POST"]
//   }
// });

// io.on("connection", (socket) => {
//   console.log("User connected:", socket.id);

//   socket.on("join-room", (roomId) => {
//     // Get a list of all client IDs in the room, excluding the current user
//     const otherUsers = Array.from(io.sockets.adapter.rooms.get(roomId) || []).filter(
//       (id) => id !== socket.id
//     );

//     socket.join(roomId);
//     console.log(`User ${socket.id} joined room: ${roomId}`);

//     // 1. Inform the new user about the other users already in the room
//     socket.emit("all-users", otherUsers);

//     // 2. Inform all other users that a new user has joined
//     socket.to(roomId).emit("user-joined", { sender: socket.id });
//     socket.to(roomId).emit("notification", `User joined: ${socket.id.substring(0, 5)}`);
//   });

//   socket.on("media-toggle", ({ roomId, type, status }) => {
//     // Add sender to media toggle updates
//     socket.to(roomId).emit("remote-media-update", { sender: socket.id, type, status });
//   });

//   // Relay signals to a specific user
//   socket.on("signal", ({ target, sender, data }) => {
//     io.to(target).emit("signal", {
//       sender,
//       data
//     });
//   });

//   socket.on("disconnecting", () => {
//     socket.rooms.forEach((room) => {
//       if (room !== socket.id) {
//         // Notify others in the room that this user has left
//         socket.to(room).emit("user-disconnected", socket.id);
//       }
//     });
//   });

//   socket.on("disconnect", () => { // This can stay for logging
//     console.log("User disconnected:", socket.id);
//   });
// });

// server.listen(5001, () => {
//   console.log("Server running on http://localhost:5001");
// });


const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs"); // Import file system to check for folder

const app = express();
app.use(cors());

// --- 1. DEFINE PATH TO FRONTEND BUILD ---
const buildPath = path.join(__dirname, "../frontend/build");

// --- 2. DEBUG: CHECK IF FOLDER EXISTS ---
if (fs.existsSync(buildPath)) {
  console.log("✅ SUCCESS: Found 'build' folder at:", buildPath);
} else {
  console.error("❌ ERROR: Could not find 'build' folder!");
  console.error("👉 Make sure you ran 'npm run build' inside the frontend folder.");
  console.error("👉 Server is looking here:", buildPath);
}

// --- 3. SERVE STATIC FILES ---
app.use(express.static(buildPath));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    const users = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    const otherUsers = users.filter(id => id !== socket.id);
    socket.join(roomId);
    socket.emit("all-users", otherUsers);
    
    // Notify others
    socket.to(roomId).emit("user-joined", { sender: socket.id });
  });

  socket.on("signal", (payload) => {
    io.to(payload.target).emit("signal", {
      sender: socket.id,
      data: payload.data
    });
  });

  socket.on("media-toggle", ({ roomId, type, status }) => {
    socket.to(roomId).emit("remote-media-update", { sender: socket.id, type, status });
  });

  // Relay gesture drawing events to everyone else in the room
  socket.on("gesture-draw", ({ roomId, ...payload }) => {
    if (!roomId) return;
    const msg = { sender: socket.id, ...payload };
    // Reliable emit for ALL gesture events (no volatile — prevents dropped packets)
    socket.to(roomId).emit("gesture-draw", msg);
  });

  socket.on("send-message", ({ roomId, message }) => {
    console.log(`[Chat] Room: ${roomId}, Sender: ${socket.id}, Message: ${message}`);
    io.to(roomId).emit("chat-message", { sender: socket.id, text: message });
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach((room) => {
        socket.to(room).emit("user-disconnected", socket.id);
    });
  });
});

// --- 4. CATCH-ALL ROUTE (FIXES REFRESH ERRORS) ---
// Valid syntax for Express 5 / newer path-to-regexp
// --- 4. CATCH-ALL ROUTE (FIXED FOR NEW EXPRESS VERSION) ---
app.get(/^(?!\/socket\.io).*/, (req, res) => {
  const indexPath = path.join(buildPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("<h1>404 Error</h1><p>Could not find index.html. Did you run <b>npm run build</b>?</p>");
  }
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});