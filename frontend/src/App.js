import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

function App() {
  console.log("App rendered");

  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");

  const startMeeting = () => {
    console.log("Start clicked");
    const id = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${id}`);
  };

  const joinMeeting = () => {
    console.log("Join clicked:", roomId);
    if (roomId.trim() !== "") {
      navigate(`/room/${roomId}`);
    } else {
      alert("Room ID empty");
    }
  };

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1>GestureLearn</h1>

      <button type="button" onClick={startMeeting}>
        Start Meeting
      </button>

      <br /><br />

      <input
        placeholder="Enter Meeting ID"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
      />

      <button type="button" onClick={joinMeeting}>
        Join
      </button>
    </div>
  );
}

export default App;