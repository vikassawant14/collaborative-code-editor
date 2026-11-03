
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import Editor from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";
import { io } from "socket.io-client";
import VideoCall from "./VideoCall";

// Interview House Logo


function App() {
  // Backend URL
  const SERVER_URL = import.meta.env.DEV
    ? "http://localhost:3000"
    : window.location.origin;

  const ydoc = useMemo(() => new Y.Doc(), []);
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc]);

  const [editor, setEditor] = useState(null);
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);

  const [role, setRole] = useState("");
  const [participants, setParticipants] = useState([]);

  const [interviewSocket, setInterviewSocket] = useState(null);

  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  // Join form
  const handleJoin = (event) => {
    event.preventDefault();

    const name = event.target.username.value.trim();
    const room = event.target.room.value.trim();

    if (!name || !room) return;

    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(room)) {
      setError(
        "Room ID must contain 3-40 letters, numbers, _ or -."
      );
      return;
    }

    setError("");
    setUsername(name);
    setRoomId(room);
  };

  // Interview Socket.IO connection
  useEffect(() => {
    if (!username || !roomId) return;

    const socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("interview:join", {
        roomId,
        username,
      });
    });

    socket.on("interview:joined", (data) => {
      setRole(data.participant.role);
      setParticipants(data.participants);
      setInterviewSocket(socket);
      setJoined(true);
      setError("");

      const params = new URLSearchParams();
      params.set("room", roomId);

      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}?${params.toString()}`
      );
    });

    socket.on("interview:error", (data) => {
      setError(data.message || "Unable to join room.");
      setUsername("");
      setJoined(false);
      socket.disconnect();
    });

    socket.on(
      "interview:participant-joined",
      ({ participant }) => {
        setParticipants((previous) => {
          if (
            previous.some(
              (user) => user.id === participant.id
            )
          ) {
            return previous;
          }

          return [...previous, participant];
        });
      }
    );

    socket.on(
      "interview:participant-left",
      ({ socketId }) => {
        setParticipants((previous) =>
          previous.filter((user) => user.id !== socketId)
        );
      }
    );

    socket.on("interview:chat", (data) => {
      setMessages((previous) => [...previous, data]);
    });

    socket.on("connect_error", () => {
      setError("Cannot connect to the interview server.");
    });

    socket.connect();

    return () => {
      socket.disconnect();
      setInterviewSocket(null);
      setJoined(false);
    };
  }, [username, roomId, SERVER_URL]);

  // Yjs collaborative editor connection
  useEffect(() => {
    if (!joined || !interviewSocket || !editor) return;

    const provider = new SocketIOProvider(
      SERVER_URL,
      roomId,
      ydoc,
      {
        autoConnect: true,
      }
    );

    provider.awareness.setLocalStateField("user", {
      username,
      role,
    });

    const model = editor.getModel();

    let binding = null;

    if (model) {
      binding = new MonacoBinding(
        yText,
        model,
        new Set([editor]),
        provider.awareness
      );
    }

    return () => {
      binding?.destroy();
      provider.awareness.setLocalState(null);
      provider.disconnect();
    };
  }, [
    joined,
    interviewSocket,
    editor,
    SERVER_URL,
    roomId,
    username,
    role,
    ydoc,
    yText,
  ]);

  // Destroy Yjs document
  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
  }, [ydoc]);

  // Send chat message
  const sendMessage = (event) => {
    event.preventDefault();

    const message = chatInput.trim();

    if (!message || !interviewSocket) return;

    const data = {
      username,
      message,
      time: new Date().toISOString(),
    };

    setMessages((previous) => [...previous, data]);

    interviewSocket.emit("interview:chat", {
      message,
    });

    setChatInput("");
  };

  // Copy room link
  const copyRoomLink = async () => {
    const link =
      `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;

    try {
      await navigator.clipboard.writeText(link);
      alert("Room link copied!");
    } catch {
      setError("Unable to copy room link.");
    }
  };

  // Join screen
  if (!username || !joined) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <form
          onSubmit={handleJoin}
          className="flex flex-col gap-4 w-full max-w-sm bg-gray-900 p-6 rounded-xl"
        >
         <div className="text-center mb-2">
  <h1 className="text-3xl font-bold text-white">
    interview-house
  </h1>
</div>

          <p className="text-gray-400 text-center text-sm">
            Collaborative coding interview room
          </p>

          <input
            name="username"
            placeholder="Enter your name"
            maxLength={30}
            required
            className="p-3 rounded-lg bg-gray-800 text-white outline-none"
          />

          <input
            name="room"
            placeholder="Enter Room ID"
            defaultValue={
              new URLSearchParams(
                window.location.search
              ).get("room") || ""
            }
            minLength={3}
            maxLength={40}
            required
            className="p-3 rounded-lg bg-gray-800 text-white outline-none"
          />

          {error && (
            <p className="text-red-400 text-sm">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="p-3 rounded-lg bg-amber-50 text-gray-950 font-bold"
          >
            Join Interview
          </button>
        </form>
      </main>
    );
  }

  // Interview screen
  return (
    <main className="min-h-screen bg-gray-950 text-white p-3">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          
          <h1 className="text-2xl font-bold text-white">
  interview-house
          </h1>

          <p className="text-sm text-gray-400 mt-2">
            Room: {roomId} | Role: {role}
          </p>
        </div>

        <button
          onClick={copyRoomLink}
          className="bg-blue-600 px-4 py-2 rounded-lg"
        >
          Copy Room Link
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Monaco Editor */}
        <section className="lg:col-span-2 bg-neutral-900 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-700 font-semibold">
            Live Code Editor
          </div>

          <Editor
            height="70vh"
            defaultLanguage="javascript"
            defaultValue="// Start coding here..."
            theme="vs-dark"
            onMount={(instance) => setEditor(instance)}
          />
        </section>

        {/* Interview Sidebar */}
        <aside className="flex flex-col gap-3">

          {/* Participants */}
          <section className="bg-white text-gray-900 rounded-xl p-3">
            <h2 className="font-bold mb-2">
              Participants ({participants.length}/2)
            </h2>

            {participants.map((participant) => (
              <div
                key={participant.id}
                className="bg-gray-100 rounded-lg p-2 mb-2"
              >
                <p className="font-semibold">
                  {participant.username}
                </p>

                <p className="text-sm text-gray-600">
                  {participant.role}
                </p>
              </div>
            ))}
          </section>

          {/* Video and Audio */}
          <section className="bg-white text-gray-900 rounded-xl p-3">
            <VideoCall
              socket={interviewSocket}
              role={role}
              participantCount={participants.length}
            />
          </section>

          {/* Chat */}
          <section className="bg-white text-gray-900 rounded-xl p-3">
            <h2 className="font-bold mb-2">
              Interview Chat
            </h2>

            <div className="h-48 overflow-y-auto bg-gray-100 rounded-lg p-2 mb-3">
              {messages.map((message, index) => (
                <div
                  key={`${message.time}-${index}`}
                  className="mb-2"
                >
                  <p className="text-xs font-bold">
                    {message.username}
                  </p>

                  <p className="text-sm break-words">
                    {message.message}
                  </p>
                </div>
              ))}

              {messages.length === 0 && (
                <p className="text-sm text-gray-500">
                  No messages yet.
                </p>
              )}
            </div>

            <form
              onSubmit={sendMessage}
              className="flex gap-2"
            >
              <input
                value={chatInput}
                onChange={(event) =>
                  setChatInput(event.target.value)
                }
                placeholder="Type a message..."
                maxLength={1000}
                className="min-w-0 flex-1 border rounded-lg p-2"
              />

              <button
                type="submit"
                className="bg-blue-600 text-white px-3 rounded-lg"
              >
                Send
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}

export default App;
