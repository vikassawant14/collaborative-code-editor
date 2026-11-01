
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
        const stream =
          await navigator.mediaDevices.getUserMedia({
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
          setConnected(
            peer.connectionState === "connected"
          );
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

      localStreamRef.current?.getTracks().forEach(
        (track) => track.stop()
      );

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
    const track =
      localStreamRef.current?.getAudioTracks()[0];

    if (track) {
      track.enabled = !track.enabled;
      setMuted(!track.enabled);
    }
  };

  const toggleCamera = () => {
    const track =
      localStreamRef.current?.getVideoTracks()[0];

    if (track) {
      track.enabled = !track.enabled;
      setCameraOff(!track.enabled);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-bold text-gray-900">
        Video Interview
      </h3>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            className="w-full aspect-video object-cover"
          />

          <p className="text-white text-xs p-2">You</p>
        </div>

        <div className="bg-gray-900 rounded-lg overflow-hidden">
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            className="w-full aspect-video object-cover"
          />

          <p className="text-white text-xs p-2">
            Other participant
          </p>
        </div>
      </div>

      <p className="text-sm text-gray-600">
        {!ready
          ? "Starting camera and microphone..."
          : connected
            ? "Video call connected"
            : "Waiting for the other participant..."}
      </p>

      <div className="flex gap-2">
        <button
          onClick={toggleMute}
          disabled={!ready}
          className="flex-1 rounded-lg bg-gray-800 text-white p-2 disabled:opacity-50"
        >
          {muted ? "Unmute" : "Mute"}
        </button>

        <button
          onClick={toggleCamera}
          disabled={!ready}
          className="flex-1 rounded-lg bg-gray-800 text-white p-2 disabled:opacity-50"
        >
          {cameraOff ? "Camera On" : "Camera Off"}
        </button>
      </div>
    </div>
  );
}

export default VideoCall;
