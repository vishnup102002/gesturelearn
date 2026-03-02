import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Hands } from "@mediapipe/hands";
import "./Room.css";

// --- IMPORTANT: CHANGE THIS TO YOUR IP IF TESTING ON PHONES ---
// For Localhost testing (Same laptop, two tabs): use "http://localhost:5001"
// For WiFi testing (Laptop + Phone): use "http://192.168.1.X:5001" (Replace X with your Laptop's IP)
// REPLACE THIS with the Ngrok link you just copied
//const SIGNALING_SERVER = "http://localhost:5001"
const SIGNALING_SERVER = "https://maisie-regardant-rachelle.ngrok-free.dev";
//const SIGNALING_SERVER = "/";

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const PALETTE_HEIGHT = 40;
  const COLOR_OPTIONS = ["red", "blue", "green", "white"];
  const SMOOTHING_ALPHA = 0.3;       // 0–1, higher = less smoothing
  const MIN_MOVE_PX = 2;             // minimum movement in pixels to draw (lower = smoother line)
  const MIN_DRAW_INTERVAL_MS = 8;    // cap draw/emit rate (~120 FPS)
  const INDEX_MARGIN = 0.005;        // tolerance for finger "up" detection (vertical)
  const DEPTH_MARGIN = 0.02;         // tolerance for finger "forward" detection (depth/z)

  const socketRef = useRef(null);
  const peersRef = useRef({}); 
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const gestureCanvasRef = useRef(null);
  const lastDrawPosRef = useRef(null);
  const selectedColorRef = useRef("red");
  const smoothedTipRef = useRef(null);
  const lastDrawTimeRef = useRef(0);
  const remoteCanvasRefs = useRef({});

  // --- State ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [pinnedId, setPinnedId] = useState("local");
  const [notify, setNotify] = useState("");
  const [isConnected, setIsConnected] = useState(false); // New connection status
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [gestureStatus, setGestureStatus] = useState("");
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [selectedColor, setSelectedColor] = useState("red");

  useEffect(() => {
    selectedColorRef.current = selectedColor;
  }, [selectedColor]);

  const getRemoteCanvasRef = (id) => {
    if (!remoteCanvasRefs.current[id]) {
      remoteCanvasRefs.current[id] = React.createRef();
    }
    return remoteCanvasRefs.current[id];
  };

  const emitGestureEvent = (mode, prevNorm, currNorm) => {
    if (!socketRef.current || !roomId) return;
    socketRef.current.emit("gesture-draw", {
      roomId,
      mode,
      color: selectedColorRef.current,
      prev: prevNorm,
      curr: currNorm,
    });
  };

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
        //const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); for normal camera resolution to 640x480 (VGA) 
        const stream = await navigator.mediaDevices.getUserMedia({ //for 720p
          video: { 
            width: { ideal: 1280 }, 
            height: { ideal: 720 } 
          }, 
          audio: true 
        });
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
        socketRef.current.on("gesture-draw", ({ sender, mode, color, prev, curr }) => {
          const ref = remoteCanvasRefs.current[sender];
          if (!ref || !ref.current || !curr) return;
          const canvas = ref.current;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          const width = canvas.clientWidth || canvas.width;
          const height = canvas.clientHeight || canvas.height;
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const x1 = prev ? prev.x * canvas.width : null;
          const y1 = prev ? prev.y * canvas.height : null;
          const x2 = curr.x * canvas.width;
          const y2 = curr.y * canvas.height;

          if (mode === "draw" && prev) {
            ctx.strokeStyle = color || "red";
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          } else if (mode === "erase") {
            const size = 40;
            ctx.clearRect(x2 - size / 2, y2 - size / 2, size, size);
          }
        });

        socketRef.current.on("chat-message", ({ sender, text }) => {
          setMessages(prev => [...prev, { sender, text }]);
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

  // --- 2b. MediaPipe Hands / Gesture Detection on Local Video ---
  useEffect(() => {
    if (!localStream || !gestureEnabled) {
      setGestureStatus("");
      lastDrawPosRef.current = null;
      smoothedTipRef.current = null;
      lastDrawTimeRef.current = 0;
      const canvasEl = gestureCanvasRef.current;
      if (canvasEl) {
        const ctx = canvasEl.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }
      return;
    }

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults((results) => {
      const { image, multiHandLandmarks } = results;
      const canvasEl = gestureCanvasRef.current;
      if (!image || !canvasEl) return;

      const ctx = canvasEl.getContext("2d");
      if (!ctx) return;

      // Resize canvas to fully match the visible video/container size
      const parent = canvasEl.parentElement;
      const targetWidth =
        (parent && parent.clientWidth) ||
        canvasEl.clientWidth ||
        canvasEl.width ||
        image.width;
      const targetHeight =
        (parent && parent.clientHeight) ||
        canvasEl.clientHeight ||
        canvasEl.height ||
        image.height;

      if (canvasEl.width !== targetWidth || canvasEl.height !== targetHeight) {
        canvasEl.width = targetWidth;
        canvasEl.height = targetHeight;
      }

      // Clear palette area and redraw color options
      ctx.clearRect(0, 0, canvasEl.width, PALETTE_HEIGHT);

      const segmentWidth = canvasEl.width / COLOR_OPTIONS.length;

      COLOR_OPTIONS.forEach((color, idx) => {
        const x0 = idx * segmentWidth;
        const padding = 6;
        const rectX = x0 + padding;
        const rectY = 8;
        const rectW = segmentWidth - padding * 2;
        const rectH = PALETTE_HEIGHT - padding * 2;

        ctx.fillStyle = color;
        ctx.fillRect(rectX, rectY, rectW, rectH);

        if (selectedColorRef.current === color) {
          ctx.strokeStyle = "yellow";
          ctx.lineWidth = 3;
          ctx.strokeRect(rectX - 2, rectY - 2, rectW + 4, rectH + 4);
        }
      });

      if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
        setGestureStatus("No hand");
        lastDrawPosRef.current = null;
        return;
      }

      const landmarks = multiHandLandmarks[0];

      const indexTip = landmarks[8];
      const indexPip = landmarks[6];
      const middleTip = landmarks[12];
      const middlePip = landmarks[10];

      // Finger considered "up" if either clearly above its PIP joint (y)
      // OR clearly closer to camera (z). We keep this only for erase,
      // and default to drawing whenever a hand is present.
      const middleUpY = middleTip.y < middlePip.y - INDEX_MARGIN;
      const middleUpZ = middleTip.z < middlePip.z - DEPTH_MARGIN;
      const middleUp = middleUpY || middleUpZ;

      let mode = "draw";
      if (middleUp) {
        mode = "erase";
      }

      // --- Smoothing fingertip position ---
      const rawX = indexTip.x;
      const rawY = indexTip.y;

      if (!smoothedTipRef.current) {
        smoothedTipRef.current = { x: rawX, y: rawY };
      } else {
        const prev = smoothedTipRef.current;
        smoothedTipRef.current = {
          x: SMOOTHING_ALPHA * rawX + (1 - SMOOTHING_ALPHA) * prev.x,
          y: SMOOTHING_ALPHA * rawY + (1 - SMOOTHING_ALPHA) * prev.y,
        };
      }

      const smooth = smoothedTipRef.current;
      // Normalized coordinates in camera space (0–1, not mirrored)
      const normX = smooth.x;
      const normY = smooth.y;

      // Local display coordinates (mirrored horizontally for self‑view)
      const xLocal = (1 - normX) * canvasEl.width;
      const yLocal = normY * canvasEl.height;

      if (mode === "draw" && yLocal < PALETTE_HEIGHT) {
        // Color selection area
        const colorIndex = Math.min(
          COLOR_OPTIONS.length - 1,
          Math.max(0, Math.floor(xLocal / segmentWidth))
        );
        const newColor = COLOR_OPTIONS[colorIndex];
        if (selectedColorRef.current !== newColor) {
          selectedColorRef.current = newColor;
          setSelectedColor(newColor);
          setGestureStatus(`Color: ${newColor}`);
        }
        lastDrawPosRef.current = null;
        return;
      }

      if (mode === "draw") {
        setGestureStatus(`Drawing: ${selectedColorRef.current}`);
        const prev = lastDrawPosRef.current;
        if (prev) {
          // Distance threshold in pixels (to avoid jittery tiny segments)
          const dxPx = (normX - prev.x) * canvasEl.width;
          const dyPx = (normY - prev.y) * canvasEl.height;
          const distSq = dxPx * dxPx + dyPx * dyPx;
          if (distSq >= MIN_MOVE_PX * MIN_MOVE_PX) {
            const now = performance.now ? performance.now() : Date.now();
            if (now - (lastDrawTimeRef.current || 0) >= MIN_DRAW_INTERVAL_MS) {
              lastDrawTimeRef.current = now;

              const prevXLocal = (1 - prev.x) * canvasEl.width;
              const prevYLocal = prev.y * canvasEl.height;
              ctx.strokeStyle = selectedColorRef.current;
              ctx.lineWidth = 4;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.moveTo(prevXLocal, prevYLocal);
              ctx.lineTo(xLocal, yLocal);
              ctx.stroke();

              // Broadcast un-mirrored normalized coords
              emitGestureEvent("draw", prev, { x: normX, y: normY });
            }
          }
        }
        // Store last position in un-mirrored normalized space
        lastDrawPosRef.current = { x: normX, y: normY };
      } else if (mode === "erase") {
        setGestureStatus("Erasing");
        const size = 40;
        ctx.clearRect(xLocal - size / 2, yLocal - size / 2, size, size);
        // Broadcast erase in un-mirrored normalized space
        emitGestureEvent("erase", null, { x: normX, y: normY });
        lastDrawPosRef.current = null;
      } else {
        setGestureStatus("Gesture mode on");
        lastDrawPosRef.current = null;
      }
    });

    let animationFrameId;
    let isCancelled = false;

    const processFrame = async () => {
      if (isCancelled) return;

      const videoEl = localVideoRef.current;
      const canvasEl = gestureCanvasRef.current;

      if (
        videoEl &&
        canvasEl &&
        videoEl.readyState >= 2 && // HAVE_CURRENT_DATA
        videoEl.videoWidth > 0 &&
        videoEl.videoHeight > 0
      ) {
        try {
          await hands.send({ image: videoEl });
        } catch (e) {
          // Swallow occasional processing errors to avoid breaking loop
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    animationFrameId = requestAnimationFrame(processFrame);

    return () => {
      isCancelled = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      hands.close();
      setGestureStatus("");
      const canvasEl = gestureCanvasRef.current;
      if (canvasEl) {
        const ctx = canvasEl.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        }
      }
    };
  }, [localStream, gestureEnabled]);

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
  const sendChat = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      socketRef.current.emit("send-message", { roomId, message: chatInput });
      setChatInput("");
    }
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
    <div className="room-container" style={containerStyle}>
        
        {/* Connection Status Indicator */}
        <div style={connectionStatusStyle(isConnected)}>
            {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
        </div>

        {notify && <div style={notifyStyle}>🔔 {notify}</div>}

        {/* Big Screen */}
        <div className="room-main" style={mainAreaStyle}>
            {bigStream ? (
                <div className="room-main-inner">
                    <VideoCard 
                        stream={bigStream}
                        isMicOn={bigIsMic}
                        isCamOn={bigIsCam}
                        name={bigName}
                        isMirror={bigMirror}
                        isBig={true}
                        videoRef={pinnedId === "local" ? localVideoRef : null}
                        overlayRef={pinnedId !== "local" ? getRemoteCanvasRef(pinnedId) : null}
                    />
                    {/* Only show gesture overlay for local pinned video */}
                    {pinnedId === "local" && gestureEnabled && (
                        <>
                            <canvas
                                ref={gestureCanvasRef}
                                style={gestureCanvasStyle}
                            />
                            {gestureStatus && (
                                <div style={gestureBadgeStyle}>
                                    ✋ {gestureStatus}
                                </div>
                            )}
                        </>
                    )}
                </div>
            ) : (
                <div style={{color: "white"}}>Waiting for users...</div>
            )}
        </div>
            {/* Chat Sidebar */}
        {isChatOpen && (
            <div className="room-chat" style={chatSidebarStyle}>
                <div style={chatHeaderStyle}>
                    <h3>Chat</h3>
                    <button onClick={() => setIsChatOpen(false)} style={closeChatBtnStyle}>×</button>
                </div>
                <div style={chatMessagesStyle}>
                    {messages.map((msg, idx) => {
                        const isMe = msg.sender === socketRef.current?.id;
                        const name = isMe ? "You" : `User ${msg.sender.substring(0,4)}`;
                        return (
                            <div key={idx} style={{ marginBottom: "10px", textAlign: isMe ? "right" : "left" }}>
                                <div style={{ fontWeight: "bold", fontSize: "12px", color: "#9aa0a6" }}>{name}</div>
                                <div style={{ backgroundColor: isMe ? "#00796b" : "#ffffff", padding: "8px", borderRadius: "8px", display: "inline-block", maxWidth: "80%", wordWrap: "break-word" }}>
                                    {msg.text}
                                </div>
                            </div>
                        );
                    })}
                </div>
                <form onSubmit={sendChat} style={chatInputAreaStyle}>
                    <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." style={chatInputStyle} />
                    <button type="submit" style={chatSendBtnStyle}>➤</button>
                </form>
            </div>
        )}

  
        {/* Bottom Strip */}
        <div className="room-strip" style={stripStyle}>
            {pinnedId !== "local" && (
                <VideoCard 
                    stream={localStream}
                    isMicOn={isMicOn}
                    isCamOn={isCamOn}
                    name="You"
                    isMirror={true}
                    isBig={false}
                    onClick={() => setPinnedId("local")}
                />
            )}
            {Object.keys(remoteUsers).map(id => {
                if (id === pinnedId) return null;
                const user = remoteUsers[id];
                return (
                    <VideoCard 
                        key={id}
                        stream={user.stream}
                        isMicOn={user.isMicOn}
                        isCamOn={user.isCamOn}
                        name={`User ${id.substring(0,4)}`}
                        isMirror={false}
                        isBig={false}
                        onClick={() => setPinnedId(id)}
                        overlayRef={getRemoteCanvasRef(id)}
                    />
                )
            })}
        </div>

        {/* Controls Bar */}
        <div className="room-controls" style={controlsStyle}>
            <button onClick={toggleMic} style={btnStyle(isMicOn)}>{isMicOn ? "🎤" : "🔇"}</button>
            <button onClick={toggleCam} style={btnStyle(isCamOn)}>{isCamOn ? "📷" : "🚫"}</button>
            <button
              onClick={() => setGestureEnabled(prev => !prev)}
              style={btnStyle(gestureEnabled)}
              title="Toggle gesture drawing"
            >
              ✋
            </button>
            <button onClick={() => setIsChatOpen(!isChatOpen)} style={btnStyle(true)} title="Chat">💬</button>
            <button onClick={copyLink} style={btnStyle(true)} title="Copy Meeting Link">🔗</button>
            <button onClick={() => navigate("/")} style={endBtnStyle}>End Call</button>
        </div>
    </div>
  );
}

// --- Video Card ---
const VideoCard = ({ stream, isMicOn, isCamOn, name, isMirror, onClick, isBig, videoRef, overlayRef }) => {
  const internalRef = useRef(null);
  const vidRef = videoRef || internalRef;
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
              <>
                <video
                  ref={vidRef}
                  autoPlay
                  muted={isMirror}
                  playsInline
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain", // avoid cropping so coords stay in sync
                    transform: isMirror ? "scaleX(-1)" : "none",
                    backgroundColor: "black",
                  }}
                />
                {overlayRef && (
                  <canvas
                    ref={overlayRef}
                    style={gestureCanvasStyle}
                  />
                )}
              </>
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
// Chat Styles
const chatSidebarStyle = { position: "absolute", right: 0, top: 0, bottom: "70px", width: "300px", backgroundColor: "#202124", borderLeft: "1px solid #3c4043", display: "flex", flexDirection: "column", zIndex: 50 };
const chatHeaderStyle = { padding: "15px", borderBottom: "1px solid #3c4043", display: "flex", justifyContent: "space-between", alignItems: "center" };
const closeChatBtnStyle = { background: "none", border: "none", color: "white", fontSize: "24px", cursor: "pointer" };
const chatMessagesStyle = { flex: 1, padding: "15px", overflowY: "auto", display: "flex", flexDirection: "column" };
const chatInputAreaStyle = { padding: "15px", borderTop: "1px solid #3c4043", display: "flex", gap: "10px" };
const chatInputStyle = { flex: 1, padding: "10px", borderRadius: "20px", border: "none", backgroundColor: "#3c4043", color: "white", outline: "none" };
const chatSendBtnStyle = { background: "none", border: "none", color: "#8ab4f8", fontSize: "20px", cursor: "pointer" };

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

const gestureCanvasStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  pointerEvents: "none",
};

const gestureBadgeStyle = {
  position: "absolute",
  top: "16px",
  right: "16px",
  padding: "6px 12px",
  borderRadius: "16px",
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  color: "white",
  fontSize: "12px",
  fontWeight: "bold",
};

export default Room;