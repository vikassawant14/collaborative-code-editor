
import React, { useEffect, useMemo, useState } from "react";
import "./App.css";

import Editor from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";
import { io } from "socket.io-client";

import VideoCall from "./VideoCall";
import Whiteboard from "./Whiteboard";

function App() {
  const SERVER_URL = import.meta.env.DEV
    ? "http://localhost:3000"
    : window.location.origin;

  const ydoc = useMemo(() => new Y.Doc(), []);
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc]);

  // Workspace
  const [activePage, setActivePage] = useState("code");
  const [whiteboardStrokes, setWhiteboardStrokes] = useState([]);
  const [editor, setEditor] = useState(null);

  // Editor settings
  const [editorTheme, setEditorTheme] = useState(
    () => localStorage.getItem("editorTheme") || "vs-dark"
  );
  const [fontSize, setFontSize] = useState(
    () => Number(localStorage.getItem("editorFontSize")) || 14
  );
  const [wordWrap, setWordWrap] = useState(
    () => localStorage.getItem("editorWordWrap") || "on"
  );
  const [minimap, setMinimap] = useState(
    () => localStorage.getItem("editorMinimap") !== "false"
  );
  const [showEditorSettings, setShowEditorSettings] = useState(false);

  // Interview
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joined, setJoined] = useState(false);
  const [role, setRole] = useState("");
  const [participants, setParticipants] = useState([]);
  const [interviewSocket, setInterviewSocket] = useState(null);

  // Chat and UI
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showParticipants, setShowParticipants] = useState(true);
  const [activeNav, setActiveNav] = useState("Rooms");
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [notice, setNotice] = useState("");

  // Save editor preferences
  useEffect(() => {
    localStorage.setItem("editorTheme", editorTheme);
    localStorage.setItem("editorFontSize", String(fontSize));
    localStorage.setItem("editorWordWrap", wordWrap);
    localStorage.setItem("editorMinimap", String(minimap));
  }, [editorTheme, fontSize, wordWrap, minimap]);

  // Resize editor when returning to Code
  useEffect(() => {
    if (activePage === "code" && editor) {
      requestAnimationFrame(() => editor.layout());
    }
  }, [activePage, editor, showEditorSettings]);

  // Join room
  const handleJoin = (event) => {
    event.preventDefault();

    const name = event.target.username.value.trim();
    const room = event.target.room.value.trim();

    if (!name || !room) return;

    if (!/^[a-zA-Z0-9_-]{3,40}$/.test(room)) {
      setError("Room ID must contain 3-40 letters, numbers, _ or -.");
      return;
    }

    setError("");
    setUsername(name);
    setRoomId(room);
  };

  // Socket.IO room connection
  useEffect(() => {
    if (!username || !roomId) return;

    const socket = io(SERVER_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket.emit("interview:join", { roomId, username });
    });

    socket.on("interview:joined", (data) => {
      setRole(data.participant.role);
      setParticipants(data.participants);
      setWhiteboardStrokes(data.whiteboardStrokes || []);
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

    socket.on("interview:participant-joined", ({ participant }) => {
      setParticipants((previous) => {
        if (previous.some((user) => user.id === participant.id)) {
          return previous;
        }
        return [...previous, participant];
      });
    });

    socket.on("interview:participant-left", ({ socketId }) => {
      setParticipants((previous) =>
        previous.filter((user) => user.id !== socketId)
      );
    });

    socket.on("interview:chat", (data) => {
      setMessages((previous) => [...previous, data]);
    });

    // Whiteboard events
    socket.on("whiteboard:stroke-start", (stroke) => {
      setWhiteboardStrokes((previous) => {
        if (previous.some((item) => item.id === stroke.id)) {
          return previous;
        }
        return [...previous, stroke];
      });
    });

    socket.on("whiteboard:stroke-point", ({ strokeId, point }) => {
      setWhiteboardStrokes((previous) =>
        previous.map((stroke) =>
          stroke.id === strokeId
            ? { ...stroke, points: [...stroke.points, point] }
            : stroke
        )
      );
    });

    socket.on("whiteboard:undo", () => {
      setWhiteboardStrokes((previous) => previous.slice(0, -1));
    });

    socket.on("whiteboard:clear", () => {
      setWhiteboardStrokes([]);
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

  // Yjs collaborative editor
  useEffect(() => {
    if (!joined || !interviewSocket || !editor) return;

    const provider = new SocketIOProvider(
      SERVER_URL,
      roomId,
      ydoc,
      { autoConnect: true }
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
    return () => ydoc.destroy();
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
    interviewSocket.emit("interview:chat", { message });
    setChatInput("");
  };

  // Copy room link
  const copyRoomLink = async () => {
    const link =
      `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;

    try {
      await navigator.clipboard.writeText(link);
      setNotice("Room link copied successfully.");
    } catch {
      setError("Unable to copy room link. Check browser permissions.");
    }
  };

  // End room / leave session
  const handleEndRoom = () => {
    const confirmed = window.confirm(
      "Are you sure you want to leave this interview room?"
    );

    if (!confirmed) return;

    interviewSocket?.disconnect();

    setInterviewSocket(null);
    setJoined(false);
    setUsername("");
    setRoomId("");
    setRole("");
    setParticipants([]);
    setMessages([]);
    setWhiteboardStrokes([]);
    setEditor(null);

    window.history.replaceState(
      {},
      "",
      window.location.pathname
    );
  };

  // Reset editor settings
  const resetEditorSettings = () => {
    setEditorTheme("vs-dark");
    setFontSize(14);
    setWordWrap("on");
    setMinimap(true);
  };

  // Monaco clipboard restriction
  const handleEditorMount = (instance) => {
    setEditor(instance);

    const node = instance.getDomNode();
    if (!node) return;

    const blockClipboardKeys = (event) => {
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;

      const blocked =
        (modifier && ["c", "v", "x"].includes(key)) ||
        (event.shiftKey && key === "insert") ||
        (modifier && event.shiftKey && key === "v");

      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    };

    const blockClipboardEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    node.addEventListener("keydown", blockClipboardKeys, true);
    node.addEventListener("copy", blockClipboardEvent, true);
    node.addEventListener("cut", blockClipboardEvent, true);
    node.addEventListener("paste", blockClipboardEvent, true);
    node.addEventListener("contextmenu", blockClipboardEvent, true);
  };

  // Join screen
  if (!username || !joined) {
    return (
      <main className="join-screen">
        <form className="join-card" onSubmit={handleJoin}>
          <h1 className="brand-logo">
            <span>i</span>nterview-house
          </h1>

          <p className="join-subtitle">
            Collaborative coding interview room
          </p>

          <input
            name="username"
            placeholder="Enter your name"
            maxLength={30}
            required
          />

          <input
            name="room"
            placeholder="Enter Room ID"
            defaultValue={
              new URLSearchParams(window.location.search).get("room") || ""
            }
            minLength={3}
            maxLength={40}
            required
          />

          {error && <p className="error-message">{error}</p>}

          <button type="submit" className="primary-button">
            Join Interview
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="interview-app">

      {/* Top navigation */}
      <nav className="top-navigation">
        <h1 className="brand-logo">
          <span>i</span>nterview-house
        </h1>

        <div className="nav-links">
          <button
            className={activeNav === "Rooms" ? "nav-link active" : "nav-link"}
            onClick={() => setActiveNav("Rooms")}
          >
            <span>⌂</span> Rooms
          </button>

          <button
            className={activeNav === "History" ? "nav-link active" : "nav-link"}
            onClick={() => {
              setActiveNav("History");
              setNotice("Session history is not available in this version.");
            }}
          >
            <span>◷</span> History
          </button>

          <button
            className="nav-link"
            onClick={() => setShowHowItWorks(true)}
          >
            <span>ⓘ</span> How it Works
          </button>
        </div>

        <div className="nav-right">
          <div className="user-avatar">
            {username.charAt(0).toUpperCase()}
          </div>
        </div>
      </nav>

      {/* Room controls */}
      <section className="room-toolbar">
        <div className="room-information">
          <span className="online-indicator"></span>
          <strong>Room: {roomId}</strong>
          <span className="room-separator">|</span>
          <span>Role: {role}</span>
        </div>

        <div className="room-actions">
          <button
            className="room-action-button copy-button"
            onClick={copyRoomLink}
          >
            ↗ Copy Room Link
          </button>

          <button
            className="room-action-button end-button"
            onClick={handleEndRoom}
          >
            ☎ End Room
          </button>
        </div>
      </section>

      {/* Main 65 / 35 layout */}
      <div className="interview-layout">

        {/* LEFT: Editor and whiteboard */}
        <section className="workspace-panel redesigned-workspace">

          {/* Code / Draw tabs */}
          <div className="workspace-tabs redesigned-tabs">
            <button
              type="button"
              className={`workspace-tab ${activePage === "code" ? "active" : ""}`}
              onClick={() => setActivePage("code")}
            >
              {"</>"} Code
            </button>

            <button
              type="button"
              className={`workspace-tab ${activePage === "draw" ? "active" : ""}`}
              onClick={() => setActivePage("draw")}
            >
              ✎ Draw
            </button>
          </div>

          {/* Code editor */}
          <div
            className="workspace-content code-workspace"
            style={{
              display: activePage === "code" ? "flex" : "none",
            }}
          >
            <div className="editor-toolbar">
              <div className="file-tab">
                <span>main.js</span>
                <span className="file-close">×</span>
              </div>

              <button
                className="add-file-button"
                type="button"
                title="New file (not enabled)"
                onClick={() =>
                  setNotice("Multiple file management is not enabled yet.")
                }
              >
                +
              </button>

              <div className="editor-toolbar-actions">
                <button
                  className="run-button"
                  type="button"
                  onClick={() =>
                    setNotice("Code execution is not enabled yet.")
                  }
                >
                  Run <span>▷</span>
                </button>

                <button
                  className="settings-toolbar-button"
                  type="button"
                  onClick={() =>
                    setShowEditorSettings(!showEditorSettings)
                  }
                >
                  ⚙ Editor Settings
                </button>
              </div>
            </div>

            {/* Settings */}
            {showEditorSettings && (
              <div className="editor-settings-panel redesigned-settings">

                <div className="editor-setting">
                  <label>Theme</label>
                  <select
                    value={editorTheme}
                    onChange={(event) =>
                      setEditorTheme(event.target.value)
                    }
                  >
                    <option value="vs-dark">Dark</option>
                    <option value="vs">Light</option>
                  </select>
                </div>

                <div className="editor-setting">
                  <label>Font Size: {fontSize}px</label>
                  <input
                    type="range"
                    min="10"
                    max="28"
                    value={fontSize}
                    onChange={(event) =>
                      setFontSize(Number(event.target.value))
                    }
                  />
                </div>

                <div className="editor-setting">
                  <label>Word Wrap</label>
                  <select
                    value={wordWrap}
                    onChange={(event) =>
                      setWordWrap(event.target.value)
                    }
                  >
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </div>

                <div className="editor-setting">
                  <label>Minimap</label>
                  <label className="editor-toggle">
                    <input
                      type="checkbox"
                      checked={minimap}
                      onChange={(event) =>
                        setMinimap(event.target.checked)
                      }
                    />
                    <span>{minimap ? "Enabled" : "Disabled"}</span>
                  </label>
                </div>

                <button
                  type="button"
                  className="editor-reset-button"
                  onClick={resetEditorSettings}
                >
                  Reset
                </button>
              </div>
            )}

            <div className="monaco-container">
              <Editor
                height="100%"
                defaultLanguage="javascript"
                defaultValue="// Start coding here..."
                theme={editorTheme}
                options={{
                  readOnly: false,
                  contextmenu: false,
                  selectOnLineNumbers: true,
                  automaticLayout: true,
                  fontSize,
                  wordWrap,
                  minimap: { enabled: minimap },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  tabSize: 2,
                }}
                onMount={handleEditorMount}
              />
            </div>
          </div>

          {/* Whiteboard */}
          <div
            className="workspace-content drawing-workspace"
            style={{
              display: activePage === "draw" ? "block" : "none",
            }}
          >
            <Whiteboard
              socket={interviewSocket}
              strokes={whiteboardStrokes}
              setStrokes={setWhiteboardStrokes}
            />
          </div>
        </section>

        {/* RIGHT: Video, participants, chat */}
        <aside className="interview-sidebar">

          {/* Video */}
          <section className="sidebar-card video-card">
            <div className="sidebar-card-heading">
              <span>▣</span> Video Interview
            </div>

            <VideoCall
              socket={interviewSocket}
              role={role}
              participantCount={participants.length}
            />
          </section>

          {/* Participants */}
          <section className="sidebar-card participants-card">
            <button
              className="sidebar-card-heading collapsible-heading"
              onClick={() => setShowParticipants(!showParticipants)}
            >
              <span>♧</span>
              Participants ({participants.length})
              <span className="collapse-arrow">
                {showParticipants ? "⌄" : "›"}
              </span>
            </button>

            {showParticipants && (
              <div className="participant-list">
                {participants.map((participant) => (
                  <div className="participant-row" key={participant.id}>
                    <div className="participant-avatar">
                      {participant.username.charAt(0).toUpperCase()}
                    </div>

                    <div className="participant-details">
                      <strong>
                        {participant.username}
                        {participant.id === interviewSocket?.id ? " (You)" : ""}
                      </strong>
                      <span>{participant.role}</span>
                    </div>

                    <span className="participant-mic">🎙</span>
                  </div>
                ))}

                {participants.length === 0 && (
                  <p className="empty-state">No participants yet.</p>
                )}
              </div>
            )}
          </section>

          {/* Chat */}
          <section className="sidebar-card chat-card">
            <div className="sidebar-card-heading">
              <span>▤</span> Interview Chat
            </div>

            <div className="chat-messages">
              {messages.map((message, index) => (
                <div className="chat-message" key={`${message.time}-${index}`}>
                  <div className="chat-avatar">
                    {message.username.charAt(0).toUpperCase()}
                  </div>

                  <div className="chat-message-content">
                    <div className="chat-message-heading">
                      <strong>{message.username}</strong>
                      <span>
                        {message.time
                          ? new Date(message.time).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                    <p>{message.message}</p>
                  </div>
                </div>
              ))}

              {messages.length === 0 && (
                <p className="empty-state">No messages yet. Start a conversation.</p>
              )}
            </div>

            <form className="chat-form" onSubmit={sendMessage}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Type a message..."
                maxLength={1000}
              />

              <button type="submit" disabled={!chatInput.trim()}>
                ➤
              </button>
            </form>
          </section>
        </aside>
      </div>

      {/* How it works dialog */}
      {showHowItWorks && (
        <div
          className="dialog-overlay"
          onClick={() => setShowHowItWorks(false)}
        >
          <div
            className="how-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="dialog-close"
              onClick={() => setShowHowItWorks(false)}
            >
              ×
            </button>

            <h2>How interview-house works</h2>
            <p>1. Share the room link with the candidate.</p>
            <p>2. Collaborate using the shared code editor.</p>
            <p>3. Use the Draw tab for diagrams and problem solving.</p>
            <p>4. Communicate through video and interview chat.</p>
            <p>5. End the room when the interview is complete.</p>
          </div>
        </div>
      )}

      {/* Notifications */}
      {(notice || error) && (
        <div className={`app-notice ${error ? "notice-error" : ""}`}>
          <span>{error || notice}</span>
          <button
            onClick={() => {
              setNotice("");
              setError("");
            }}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}

export default App;
