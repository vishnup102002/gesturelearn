import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const socket = io("http://localhost:5001");

function Room() {
  const { roomId } = useParams();
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  useEffect(() => {
    socket.emit("join-room", roomId);
    startCamera();
  }, [roomId]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
    } catch (err) {
      alert("Camera/Microphone permission denied");
    }
  };

  const toggleCamera = () => {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    setCameraOn(videoTrack.enabled);
  };

  const toggleMic = () => {
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    setMicOn(audioTrack.enabled);
  };

  return (
    <div style={{ padding: "30px" }}>
      <h2>Meeting Room</h2>
      <p>Room ID: {roomId}</p>

      <video
        ref={videoRef}
        autoPlay
        muted
        style={{ width: "400px", border: "1px solid black" }}
      />

      <div style={{ marginTop: "10px" }}>
        <button onClick={toggleCamera}>
          {cameraOn ? "Turn Camera OFF" : "Turn Camera ON"}
        </button>

        <button onClick={toggleMic} style={{ marginLeft: "10px" }}>
          {micOn ? "Mute Mic" : "Unmute Mic"}
        </button>
      </div>
    </div>
  );
}

export default Room;