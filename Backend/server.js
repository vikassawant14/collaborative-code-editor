
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { YSocketIO } from "y-socket.io/dist/server";
import path from "path";

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 3000;

// Socket.IO server
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// Initialize Yjs collaboration server
const ysocketio = new YSocketIO(io);

ysocketio.initialize();

// Serve React frontend
const publicPath = path.resolve("public");

app.use(express.static(publicPath));

// Health check for AWS Load Balancer
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Collaborative server running",
  });
});

// React frontend fallback
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log("Yjs collaboration server initialized");
});
