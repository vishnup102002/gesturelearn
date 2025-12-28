import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const SIGNALING_SERVER = "http://localhost:5001";

function Room() {
  const { roomId } = useParams();

  const socketRef = useRef(null);
  const peerRef = useRef(null);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const [stream, setStream] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);

  /* ---------- WebRTC ---------- */

  const createPeer = () =>
    new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

  /* ---------- Camera ---------- */

  const startCamera = async () => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideoRef.current.srcObject = mediaStream;
    setStream(mediaStream);
  };

  useEffect(() => {
    startCamera();
  }, []);

  /* ---------- Socket + Signaling ---------- */

  useEffect(() => {
    if (!stream) return;

    socketRef.current = io(SIGNALING_SERVER, {
      transports: ["websocket"]
    });

    socketRef.current.on("connect", () => {
      console.log("Connected:", socketRef.current.id);
    });

    // Backend tells who is initiator
    socketRef.current.on("room-info", ({ isInitiator }) => {
      setIsInitiator(isInitiator);
    });

    socketRef.current.on("user-joined", async () => {
      if (!isInitiator) return; // 🔥 FIX: only initiator creates offer

      peerRef.current = createPeer();
      stream.getTracks().forEach(track =>
        peerRef.current.addTrack(track, stream)
      );

      peerRef.current.ontrack = e => {
        remoteVideoRef.current.srcObject = e.streams[0];
      };

      peerRef.current.onicecandidate = e => {
        if (e.candidate) {
          socketRef.current.emit("signal", {
            roomId,
            data: { type: "ice", candidate: e.candidate }
          });
        }
      };

      const offer = await peerRef.current.createOffer();
      await peerRef.current.setLocalDescription(offer);

      socketRef.current.emit("signal", {
        roomId,
        data: { type: "offer", offer }
      });
    });

    socketRef.current.on("signal", async ({ data }) => {
      // ✅ FIX: correct destructuring

      if (data.type === "offer") {
        peerRef.current = createPeer();

        stream.getTracks().forEach(track =>
          peerRef.current.addTrack(track, stream)
        );

        peerRef.current.ontrack = e => {
          remoteVideoRef.current.srcObject = e.streams[0];
        };

        peerRef.current.onicecandidate = e => {
          if (e.candidate) {
            socketRef.current.emit("signal", {
              roomId,
              data: { type: "ice", candidate: e.candidate }
            });
          }
        };

        await peerRef.current.setRemoteDescription(data.offer);

        const answer = await peerRef.current.createAnswer();
        await peerRef.current.setLocalDescription(answer);

        socketRef.current.emit("signal", {
          roomId,
          data: { type: "answer", answer }
        });
      }

      if (data.type === "answer") {
        await peerRef.current.setRemoteDescription(data.answer);
      }

      if (data.type === "ice") {
        await peerRef.current.addIceCandidate(data.candidate);
      }
    });

    socketRef.current.emit("join-room", roomId);

    return () => socketRef.current.disconnect();
  }, [stream, roomId, isInitiator]);

  /* ---------- UI ---------- */

  return (
    <div>
      <h2>Room: {roomId}</h2>

      <h3>Local</h3>
      <video ref={localVideoRef} autoPlay muted width="300" />

      <h3>Remote</h3>
      <video ref={remoteVideoRef} autoPlay width="300" />
    </div>
  );
}

export default Room;