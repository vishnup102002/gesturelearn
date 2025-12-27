import React from "react";
import { useNavigate } from "react-router-dom";

function App() {
  const navigate = useNavigate();

  const startMeeting = () => {
    const roomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${roomId}`);
  };

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <h1>GestureLearn</h1>

      <button onClick={startMeeting} style={{ margin: "10px" }}>
        Start Meeting
      </button>

      <br /><br />

      <input placeholder="Enter Meeting ID" />
      <button style={{ marginLeft: "10px" }}>
        Join
      </button>
    </div>
  );
}

export default App;