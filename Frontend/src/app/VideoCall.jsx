
import React, { useEffect, useRef, useState } from "react";

function VideoCall({ socket, role, participantCount }) {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidates = useRef([]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;

    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;

        if (localVideo.current) {
          localVideo.current.srcObject = stream;
        }

        const peer = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
          ],
        });

        peerRef.current = peer;

        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });

        peer.ontrack = (event) => {
          if (remoteVideo.current) {
            remoteVideo.current.srcObject = event.streams[0];
          }
        };

        peer.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("interview:signal", {
              type: "ice-candidate",
              data: event.candidate,
            });
          }
        };

        peer.onconnectionstatechange = () => {
          setConnected(peer.connectionState === "connected");
        };

        setReady(true);
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "Camera or microphone permission denied."
            : "Unable to access camera or microphone."
        );
      }
    };

    const handleSignal = async ({ type, data }) => {
      const peer = peerRef.current;
      if (!peer) return;

      try {
        if (type === "offer") {
          await peer.setRemoteDescription(
            new RTCSessionDescription(data)
          );

          for (const candidate of pendingCandidates.current) {
            await peer.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }

          pendingCandidates.current = [];

          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);

          socket.emit("interview:signal", {
            type: "answer",
            data: peer.localDescription,
          });
        }

        if (type === "answer") {
          await peer.setRemoteDescription(
            new RTCSessionDescription(data)
          );

          for (const candidate of pendingCandidates.current) {
            await peer.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          }

          pendingCandidates.current = [];
        }

        if (type === "ice-candidate") {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(
              new RTCIceCandidate(data)
            );
          } else {
            pendingCandidates.current.push(data);
          }
        }
      } catch (err) {
        console.error("WebRTC signaling error:", err);
      }
    };

    socket.on("interview:signal", handleSignal);
    startMedia();

    return () => {
      active = false;
      socket.off("interview:signal", handleSignal);

      peerRef.current?.close();
      peerRef.current = null;

      localStreamRef.current?.getTracks().forEach((track) => {
        track.stop();
      });

      localStreamRef.current = null;
    };
  }, [socket]);

  // Interviewer creates the offer when both participants are present.
  useEffect(() => {
    const createOffer = async () => {
      const peer = peerRef.current;

      if (
        role !== "Interviewer" ||
        participantCount < 2 ||
        !ready ||
        !peer ||
        peer.signalingState !== "stable"
      ) {
        return;
      }

      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);

        socket.emit("interview:signal", {
          type: "offer",
          data: peer.localDescription,
        });
      } catch (err) {
        console.error("Unable to create call:", err);
      }
    };

    createOffer();
  }, [participantCount, ready, role, socket]);

  const toggleMute = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];

    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];

    if (track) {
      track.enabled = !track.enabled;
      setCameraOff(!track.enabled);
    }
  };

  return (
    <div className="video-call-content">
      {error && <p className="video-error">{error}</p>}

      <div className="video-grid">
        <div className="video-tile">
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
          />
          {cameraOff && (
            <div className="video-placeholder">Camera Off</div>
          )}
          <span className="video-label">You</span>
        </div>

        <div className="video-tile">
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
          />
          <span className="video-label">Other Participant</span>
        </div>
      </div>

      <p className="video-status">
        {!ready
          ? "Starting camera and microphone..."
          : connected
            ? "● Connected"
            : "Waiting for the other participant..."}
      </p>

      <div className="video-controls">
        <button
          type="button"
          onClick={toggleMute}
          disabled={!ready}
          title={muted ? "Unmute microphone" : "Mute microphone"}
          className={muted ? "video-control active" : "video-control"}
        >
          {muted ? "🔇" : "🎙"}
        </button>

        <button
          type="button"
          onClick={toggleCamera}
          disabled={!ready}
          title={cameraOff ? "Turn camera on" : "Turn camera off"}
          className={cameraOff ? "video-control active" : "video-control"}
        >
          {cameraOff ? "▧" : "▣"}
        </button>

        <div
          className="video-control video-more"
          title="More controls coming later"
        >
          •••
        </div>
      </div>
    </div>
  );
}

export default VideoCall;

