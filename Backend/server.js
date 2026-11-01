
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { YSocketIO } from "y-socket.io/dist/server";
import path from "path";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// Existing Yjs collaboration server
const ysocketio = new YSocketIO(io);
ysocketio.initialize();

// Temporary interview rooms (memory only)
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // Join an interview room
  socket.on("interview:join", ({ roomId, username } = {}) => {
    if (socket.data.roomId) return;

    if (
      typeof roomId !== "string" ||
      typeof username !== "string" ||
      !/^[a-zA-Z0-9_-]{3,40}$/.test(roomId) ||
      !username.trim() ||
      username.trim().length > 30
    ) {
      socket.emit("interview:error", {
        message: "Invalid room ID or username.",
      });
      return;
    }

    let room = rooms.get(roomId);

    if (room && room.size >= 2) {
      socket.emit("interview:error", {
        message: "Room is full. Maximum 2 participants allowed.",
      });
      return;
    }

    if (!room) {
      room = new Map();
      rooms.set(roomId, room);
    }

    const role = room.size === 0 ? "Interviewer" : "Candidate";

    const participant = {
      id: socket.id,
      username: username.trim(),
      role,
    };

    room.set(socket.id, participant);
    socket.data.roomId = roomId;
    socket.data.username = participant.username;

    socket.join(`interview:${roomId}`);

    socket.emit("interview:joined", {
      roomId,
      participant,
      participants: Array.from(room.values()),
    });

    socket.to(`interview:${roomId}`).emit("interview:participant-joined", {
      participant,
    });

    console.log(`${username} joined ${roomId} as ${role}`);
  });

  // Live chat: messages are relayed, never stored
  socket.on("interview:chat", ({ message } = {}) => {
    const roomId = socket.data.roomId;

    if (
      !roomId ||
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 1000
    ) {
      return;
    }

    socket.to(`interview:${roomId}`).emit("interview:chat", {
      username: socket.data.username,
      message: message.trim(),
      time: new Date().toISOString(),
    });
  });

  // WebRTC signaling: offer, answer and ICE candidates
  socket.on("interview:signal", ({ type, data } = {}) => {
    const roomId = socket.data.roomId;

    const allowedTypes = ["offer", "answer", "ice-candidate"];

    if (!roomId || !allowedTypes.includes(type) || !data) {
      return;
    }

    socket.to(`interview:${roomId}`).emit("interview:signal", {
      type,
      data,
    });
  });

  // Disconnect and clean up temporary room
  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (!roomId) return;

    const room = rooms.get(roomId);

    if (room) {
      room.delete(socket.id);

      socket.to(`interview:${roomId}`).emit(
        "interview:participant-left",
        { socketId: socket.id }
      );

      if (room.size === 0) {
        rooms.delete(roomId);
      }
    }

    console.log(`Participant disconnected from ${roomId}`);
  });
});

// Serve React frontend
const publicPath = path.resolve("public");
app.use(express.static(publicPath));

// AWS health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Collaborative interview server running",
  });
});

// React frontend fallback
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Yjs collaboration server initialized");
});

