
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

// Temporary shared whiteboard data
const whiteboards = new Map();

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

    // Create whiteboard if it does not exist
    if (!whiteboards.has(roomId)) {
      whiteboards.set(roomId, []);
    }

    socket.emit("interview:joined", {
      roomId,
      participant,
      participants: Array.from(room.values()),
      whiteboardStrokes: whiteboards.get(roomId),
    });

    socket.to(`interview:${roomId}`).emit(
      "interview:participant-joined",
      { participant }
    );

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

  // =====================================
  // SHARED WHITEBOARD
  // =====================================

  // Start drawing a stroke
  socket.on("whiteboard:stroke-start", (stroke = {}) => {
    const roomId = socket.data.roomId;

    if (
      !roomId ||
      typeof stroke.id !== "string" ||
      stroke.id.length > 100 ||
      !Array.isArray(stroke.points) ||
      stroke.points.length !== 1 ||
      typeof stroke.color !== "string" ||
      !/^#[0-9a-fA-F]{6}$/.test(stroke.color) ||
      !["pen", "eraser"].includes(stroke.tool)
    ) {
      return;
    }

    const point = stroke.points[0];

    if (
      !point ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    ) {
      return;
    }

    const board = whiteboards.get(roomId);

    if (
      !board ||
      board.length >= 1000 ||
      board.some((item) => item.id === stroke.id)
    ) {
      return;
    }

    const safeStroke = {
      id: stroke.id,
      color: stroke.color,
      width: Math.min(
        12,
        Math.max(1, Number(stroke.width) || 3)
      ),
      tool: stroke.tool,
      points: [{ x: point.x, y: point.y }],
    };

    board.push(safeStroke);

    socket.to(`interview:${roomId}`).emit(
      "whiteboard:stroke-start",
      safeStroke
    );
  });

  // Continue drawing
  socket.on(
    "whiteboard:stroke-point",
    ({ strokeId, point } = {}) => {
      const roomId = socket.data.roomId;
      const board = roomId && whiteboards.get(roomId);

      if (
        !board ||
        typeof strokeId !== "string" ||
        !point ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.x > 1 ||
        point.y < 0 ||
        point.y > 1
      ) {
        return;
      }

      const stroke = board.find(
        (item) => item.id === strokeId
      );

      if (!stroke || stroke.points.length >= 5000) {
        return;
      }

      const safePoint = {
        x: point.x,
        y: point.y,
      };

      stroke.points.push(safePoint);

      socket.to(`interview:${roomId}`).emit(
        "whiteboard:stroke-point",
        {
          strokeId,
          point: safePoint,
        }
      );
    }
  );

  // Undo last stroke
  socket.on("whiteboard:undo", () => {
    const roomId = socket.data.roomId;
    const board = roomId && whiteboards.get(roomId);

    if (!board || board.length === 0) return;

    board.pop();

    socket.to(`interview:${roomId}`).emit(
      "whiteboard:undo"
    );
  });

  // Clear whiteboard
  socket.on("whiteboard:clear", () => {
    const roomId = socket.data.roomId;

    if (!roomId || !whiteboards.has(roomId)) return;

    whiteboards.set(roomId, []);

    socket.to(`interview:${roomId}`).emit(
      "whiteboard:clear"
    );
  });

  // =====================================
  // WEBRTC SIGNALING
  // =====================================

  socket.on("interview:signal", ({ type, data } = {}) => {
    const roomId = socket.data.roomId;

    const allowedTypes = [
      "offer",
      "answer",
      "ice-candidate",
    ];

    if (!roomId || !allowedTypes.includes(type) || !data) {
      return;
    }

    socket.to(`interview:${roomId}`).emit(
      "interview:signal",
      {
        type,
        data,
      }
    );
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
        whiteboards.delete(roomId);
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
  console.log("Shared whiteboard initialized");
});

