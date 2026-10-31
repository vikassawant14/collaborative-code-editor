
import React, { useMemo, useState, useEffect } from "react";

import "./App.css";
import Editor from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";

function App() {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc]);

  const [editor, setEditor] = useState(null);
  const [users, setUsers] = useState([]);

  const [username, setUsername] = useState(() => {
    return (
      new URLSearchParams(window.location.search).get("username") || ""
    );
  });

  // Join form
  const handleJoin = (e) => {
    e.preventDefault();

    const name = e.target.username.value.trim();

    if (!name) return;

    const params = new URLSearchParams(window.location.search);
    params.set("username", name);

    window.history.pushState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`
    );

    setUsername(name);
  };

  // Monaco Editor mount
  const handleMount = (editorInstance) => {
    setEditor(editorInstance);
  };

  // Connect Yjs and Socket.IO
  useEffect(() => {
    if (!username || !editor) return;

  const provider = new SocketIOProvider(
  window.location.origin,
  "monaco",
  ydoc,
  {
    autoConnect: true,
  }
);

    // Share username with other connected users
    provider.awareness.setLocalStateField("user", {
      username: username,
    });

    // Get Monaco model
    const model = editor.getModel();

    let binding = null;

    // Bind Monaco Editor with Yjs
    if (model) {
      binding = new MonacoBinding(
        yText,
        model,
        new Set([editor]),
        provider.awareness
      );
    }

    // Update connected users
    const updateUsers = () => {
      const states = Array.from(
        provider.awareness.getStates().values()
      );

      const connectedUsers = states
        .map((state) => state.user)
        .filter((user) => user && user.username);

      setUsers(connectedUsers);
    };

    provider.awareness.on("change", updateUsers);

    updateUsers();

    // Cleanup connection
    return () => {
      provider.awareness.off("change", updateUsers);

      binding?.destroy();

      provider.awareness.setLocalState(null);

      provider.disconnect();

      setUsers([]);
    };
  }, [username, editor, ydoc, yText]);

  // Destroy Yjs document
  useEffect(() => {
    return () => {
      ydoc.destroy();
    };
  }, [ydoc]);

  // Join screen
  if (!username) {
    return (
      <main className="h-screen w-full bg-gray-950 flex items-center justify-center p-4">

        <form
          onSubmit={handleJoin}
          className="flex flex-col gap-4 w-full max-w-sm"
        >
          <h1 className="text-2xl text-white font-bold text-center">
            Join Collaboration
          </h1>

          <input
            type="text"
            placeholder="Enter your name"
            className="p-3 rounded-lg bg-gray-800 text-white outline-none"
            name="username"
            required
          />

          <button
            type="submit"
            className="p-3 rounded-lg bg-amber-50 text-gray-950 font-bold"
          >
            Join
          </button>

        </form>

      </main>
    );
  }

  // Collaborative editor screen
  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4 p-4">

      {/* Sidebar */}
      <aside className="h-full w-2/5 bg-amber-50 rounded-lg p-4 overflow-y-auto">

        <h2 className="text-2xl font-bold text-gray-950">
          Welcome, {username}
        </h2>

        <h3 className="mt-6 mb-3 font-bold text-gray-800">
          Connected Users ({users.length})
        </h3>

        <ul className="flex flex-col gap-2">
          {users.map((user, index) => (
            <li
              key={`${user.username}-${index}`}
              className="p-3 bg-gray-800 text-white rounded-lg"
            >
              {user.username}
            </li>
          ))}
        </ul>

      </aside>

      {/* Monaco Editor */}
      <section className="flex-1 min-w-0 bg-neutral-800 rounded-lg overflow-hidden">

        <Editor
          height="100%"
          defaultLanguage="javascript"
          defaultValue="// Start coding here..."
          theme="vs-dark"
          onMount={handleMount}
        />

      </section>

    </main>
  );
}

export default App;

