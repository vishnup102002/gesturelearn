import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

// --- IMPORTANT: CHANGE THIS TO YOUR IP IF TESTING ON PHONES ---
// For Localhost testing (Same laptop, two tabs): use "http://localhost:5001"
// For WiFi testing (Laptop + Phone): use "http://192.168.1.X:5001" (Replace X with your Laptop's IP)
// REPLACE THIS with the Ngrok link you just copied
//const SIGNALING_SERVER = "http://localhost:5001"
//const SIGNALING_SERVER = "https://maisie-regardant-rachelle.ngrok-free.dev";
const SIGNALING_SERVER = "/";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const socketRef = useRef(null);
  const peersRef = useRef({}); 
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // --- State ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [pinnedId, setPinnedId] = useState("local");
  const [notify, setNotify] = useState("");
  const [isConnected, setIsConnected] = useState(false); // New connection status

  // --- Controls ---
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  // --- 1. Peer Connection Helper ---
  const createPeer = (targetId, initiator, stream) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    if (stream) {
      stream.getTracks().forEach(track => peer.addTrack(track, stream));
    }

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current.emit("signal", {
          target: targetId,
          sender: socketRef.current.id,
          data: { type: "ice", candidate: e.candidate }
        });
      }
    };

    peer.ontrack = (e) => {
      console.log(`Received track from ${targetId}`);
      setRemoteUsers(prev => ({
        ...prev,
        [targetId]: { 
            stream: e.streams[0], 
            isMicOn: true, 
            isCamOn: true 
        }
      }));
      setPinnedId(prev => prev === "local" ? targetId : prev);
    };

    if (initiator) {
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => {
          socketRef.current.emit("signal", {
            target: targetId,
            sender: socketRef.current.id,
            data: { type: "offer", offer: peer.localDescription }
          });
        });
    }

    return peer;
  };

  // --- 2. Initialization ---
  useEffect(() => {
    const startApp = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // --- SOCKET CONNECTION ---
        socketRef.current = io(SIGNALING_SERVER, { 
            transports: ["websocket", "polling"], // More robust connection options
            reconnectionAttempts: 5
        });

        socketRef.current.on("connect", () => {
            console.log("Connected to server:", socketRef.current.id);
            setIsConnected(true);
            socketRef.current.emit("join-room", roomId);
        });

        socketRef.current.on("disconnect", () => {
            setIsConnected(false);
        });

        // Socket Events
        socketRef.current.on("all-users", (users) => {
          users.forEach(userId => {
            const peer = createPeer(userId, true, stream);
            peersRef.current[userId] = peer;
          });
        });

        socketRef.current.on("user-joined", ({ sender }) => {
          setNotify(`User joined: ${sender.substring(0,5)}`);
          setTimeout(() => setNotify(""), 3000);
        });

        socketRef.current.on("signal", async ({ sender, data }) => {
          if (!peersRef.current[sender]) {
            const peer = createPeer(sender, false, stream);
            peersRef.current[sender] = peer;
          }
          const peer = peersRef.current[sender];

          if (data.type === "offer") {
            await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socketRef.current.emit("signal", {
              target: sender,
              sender: socketRef.current.id,
              data: { type: "answer", answer }
            });
          } else if (data.type === "answer") {
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
          } else if (data.type === "ice") {
             try { await peer.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e){}
          }
        });

        socketRef.current.on("user-disconnected", (id) => {
          if (peersRef.current[id]) {
            peersRef.current[id].close();
            delete peersRef.current[id];
          }
          setRemoteUsers(prev => {
             const newState = { ...prev };
             delete newState[id];
             return newState;
          });
          setNotify(`User left: ${id.substring(0,5)}`);
          if (pinnedId === id) setPinnedId("local");
        });

        socketRef.current.on("remote-media-update", ({ sender, type, status }) => {
            setRemoteUsers(prev => {
                if(!prev[sender]) return prev;
                return {
                    ...prev,
                    [sender]: {
                        ...prev[sender],
                        [type === "mic" ? "isMicOn" : "isCamOn"]: status
                    }
                }
            })
        });

      } catch (err) {
        console.error("Error starting app:", err);
      }
    };

    startApp();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line
  }, [roomId]); 

  // --- 3. Controls ---
  const toggleMic = () => {
    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      track.enabled = !track.enabled;
      setIsMicOn(track.enabled);
      socketRef.current.emit("media-toggle", { roomId, type: "mic", status: track.enabled });
    }
  };

  const toggleCam = () => {
    if (localStream) {
      const track = localStream.getVideoTracks()[0];
      track.enabled = !track.enabled;
      setIsCamOn(track.enabled);
      socketRef.current.emit("media-toggle", { roomId, type: "cam", status: track.enabled });
    }
  };

  const copyLink = () => {
    const link = window.location.href; 
    navigator.clipboard.writeText(link);
    setNotify("Link copied to clipboard!");
    setTimeout(() => setNotify(""), 3000);
  };

  // --- 4. Main Render ---
  let bigStream = null;
  let bigIsMic = true;
  let bigIsCam = true;
  let bigName = "";
  let bigMirror = false;

  if (pinnedId === "local") {
      bigStream = localStream;
      bigIsMic = isMicOn;
      bigIsCam = isCamOn;
      bigName = "You (Pinned)";
      bigMirror = true;
  } else if (remoteUsers[pinnedId]) {
      const u = remoteUsers[pinnedId];
      bigStream = u.stream;
      bigIsMic = u.isMicOn;
      bigIsCam = u.isCamOn;
      bigName = `User ${pinnedId.substring(0,4)}`;
      bigMirror = false;
  }

  return (
    <div style={containerStyle}>
        
        {/* Connection Status Indicator */}
        <div style={connectionStatusStyle(isConnected)}>
            {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
        </div>

        {notify && <div style={notifyStyle}>🔔 {notify}</div>}

        {/* Big Screen */}
        <div style={mainAreaStyle}>
            {bigStream ? (
                <VideoCard 
                    stream={bigStream} isMicOn={bigIsMic} isCamOn={bigIsCam} 
                    name={bigName} isMirror={bigMirror} isBig={true} 
                />
            ) : (
                <div style={{color: "white"}}>Waiting for users...</div>
            )}
        </div>

        {/* Bottom Strip */}
        <div style={stripStyle}>
            {pinnedId !== "local" && (
                <VideoCard 
                    stream={localStream} isMicOn={isMicOn} isCamOn={isCamOn} 
                    name="You" isMirror={true} isBig={false} 
                    onClick={() => setPinnedId("local")}
                />
            )}
            {Object.keys(remoteUsers).map(id => {
                if (id === pinnedId) return null;
                const user = remoteUsers[id];
                return (
                    <VideoCard 
                        key={id}
                        stream={user.stream} isMicOn={user.isMicOn} isCamOn={user.isCamOn} 
                        name={`User ${id.substring(0,4)}`} isMirror={false} isBig={false} 
                        onClick={() => setPinnedId(id)}
                    />
                )
            })}
        </div>

        {/* Controls Bar */}
        <div style={controlsStyle}>
            <button onClick={toggleMic} style={btnStyle(isMicOn)}>{isMicOn ? "🎤" : "🔇"}</button>
            <button onClick={toggleCam} style={btnStyle(isCamOn)}>{isCamOn ? "📷" : "🚫"}</button>
            <button onClick={copyLink} style={btnStyle(true)} title="Copy Meeting Link">🔗</button>
            <button onClick={() => navigate("/")} style={endBtnStyle}>End Call</button>
        </div>
    </div>
  );
}

// --- Video Card ---
const VideoCard = ({ stream, isMicOn, isCamOn, name, isMirror, onClick, isBig }) => {
  const vidRef = useRef(null);
  useEffect(() => {
      if (vidRef.current && stream) vidRef.current.srcObject = stream;
  }, [stream]);

  return (
      <div onClick={onClick} style={{ 
          ...cardStyle, 
          cursor: onClick ? "pointer" : "default",
          width: isBig ? "100%" : "200px", 
          height: isBig ? "100%" : "150px",
          border: isBig ? "none" : "2px solid #3c4043",
      }}>
          {!isCamOn ? (
               <div style={avatarContainerStyle}>
                  <div style={avatarStyle}>{name.charAt(0).toUpperCase()}</div>
                  {!isMicOn && <div style={muteBadgeStyle}>🔇</div>}
               </div>
          ) : (
              <video ref={vidRef} autoPlay muted={isMirror} playsInline style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  transform: isMirror ? "scaleX(-1)" : "none"
              }} />
          )}
          <div style={nameTagStyle}>
              {name} {!isMicOn && "🔇"}
          </div>
      </div>
  );
};

// --- Styles ---
const containerStyle = { display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#202124", overflow: "hidden", position: "relative" };
const mainAreaStyle = { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" };
const stripStyle = { height: "180px", display: "flex", alignItems: "center", gap: "10px", padding: "10px", backgroundColor: "#171717", overflowX: "auto", borderTop: "1px solid #333", zIndex: 10 };
const cardStyle = { backgroundColor: "#000", borderRadius: "8px", overflow: "hidden", position: "relative", flexShrink: 0 };
const avatarContainerStyle = { width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "#202124" };
const avatarStyle = { width: "60px", height: "60px", borderRadius: "50%", backgroundColor: "#5f6368", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px", fontWeight: "bold" };
const muteBadgeStyle = { position: "absolute", bottom: "35px", right: "10px", fontSize: "20px" };
const nameTagStyle = { position: "absolute", bottom: "5px", left: "10px", color: "white", backgroundColor: "rgba(0,0,0,0.6)", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" };
const notifyStyle = { position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#00796b", color: "white", padding: "10px 20px", borderRadius: "20px", zIndex: 99 };
const controlsStyle = { height: "70px", backgroundColor: "#1e1e1e", display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", zIndex: 20 };
const btnStyle = (isOn) => ({ width: "50px", height: "50px", borderRadius: "50%", border: "none", backgroundColor: isOn === true || typeof isOn === "object" ? "#3c4043" : "#ea4335", color: "white", fontSize: "20px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", transition: "0.2s" });
const endBtnStyle = { padding: "0 20px", height: "50px", borderRadius: "30px", border: "none", backgroundColor: "#ea4335", color: "white", fontWeight: "bold", cursor: "pointer" };

// New Status Indicator Style
const connectionStatusStyle = (isConnected) => ({
    position: "absolute",
    top: "10px",
    left: "10px",
    padding: "5px 10px",
    borderRadius: "10px",
    backgroundColor: isConnected ? "rgba(0, 128, 0, 0.5)" : "rgba(255, 0, 0, 0.5)",
    color: "white",
    fontSize: "12px",
    fontWeight: "bold",
    zIndex: 100
});

export default Room;