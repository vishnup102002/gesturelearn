import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { Mic, MicOff, Video, VideoOff, Hand, Users, MessageCircle, Link2, Trash2 } from "lucide-react";
import "./Room.css";

const SIGNALING_SERVER = import.meta.env.VITE_SIGNALING_SERVER;

function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const COLOR_OPTIONS = ["#ef4444", "#3b82f6", "#22c55e", "#ffffff", "#f59e0b", "#a855f7"];

  const MIN_ERASE_THICKNESS = 20;
  const MAX_ERASE_THICKNESS = 60;
  const SMOOTHING_ALPHA = 0.92;
  const MIN_MOVE_PX = 0.3;
  const MIN_DRAW_INTERVAL_MS = 10;
  const FINGER_MARGIN = 0.02;
  const DEPTH_MARGIN = 0.03;
  const GESTURE_STABILITY_FRAMES = 4;
  const PALM_TOGGLE_COOLDOWN_MS = 1000;

  // ── Refs ─────────────────────────────────────────────────────────────────
  const socketRef = useRef(null);
  const peersRef = useRef({});
  const localVideoRef = useRef(null);    // preview <video> — shows the flipped stream
  const rawLocalStreamRef = useRef(null);    // original getUserMedia stream
  const flippedStreamRef = useRef(null);    // canvas.captureStream() — sent over WebRTC
  const flipCanvasRef = useRef(null);    // off-screen canvas doing the H-flip
  const flipRafRef = useRef(null);
  const rawVideoElRef = useRef(null);    // hidden <video> for raw stream → MediaPipe

  const gestureCanvasRef = useRef(null);
  const lastDrawPosRef = useRef(null);
  const selectedColorRef = useRef("#ef4444");
  const smoothedTipRef = useRef(null);
  const lastDrawTimeRef = useRef(0);
  const lastStatusRef = useRef({ t: 0, text: "" });
  const remoteCanvasRefs = useRef({});
  const gestureOpsBySenderRef = useRef({});
  const lastHandsSendRef = useRef(0);

  const gestureBufferRef = useRef({ gesture: "idle", count: 0 });
  const confirmedGestureRef = useRef("idle");
  const lastFistTimeRef = useRef(0);
  const gestureEnabledRef = useRef(true);

  const drawThicknessRef = useRef(2);
  const eraseThicknessRef = useRef(30);

  // ── State ─────────────────────────────────────────────────────────────────
  const [localStream, setLocalStream] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState({});
  const [pinnedId, setPinnedId] = useState("local");
  const [notify, setNotify] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [gestureStatus, setGestureStatus] = useState("");
  const [gestureEnabled, setGestureEnabled] = useState(false);
  const [selectedColor, setSelectedColor] = useState("#ef4444");
  const [showParticipantsStrip, setShowParticipantsStrip] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  const iceServers = [
    { 
      urls: [
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
      ]
    },
    ...(import.meta.env.VITE_TURN_URL ? [{
      urls: import.meta.env.VITE_TURN_URL,
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }] : []),
  ];

  useEffect(() => { selectedColorRef.current = selectedColor; }, [selectedColor]);
  useEffect(() => { gestureEnabledRef.current = gestureEnabled; }, [gestureEnabled]);

  const getRemoteCanvasRef = (id) => {
    if (!remoteCanvasRefs.current[id]) remoteCanvasRefs.current[id] = React.createRef();
    return remoteCanvasRefs.current[id];
  };

  const setGestureStatusThrottled = (text, { force = false, minIntervalMs = 150 } = {}) => {
    const now = performance?.now?.() ?? Date.now();
    const prev = lastStatusRef.current;
    if (!force && (text === prev.text || now - prev.t < minIntervalMs)) return;
    lastStatusRef.current = { t: now, text };
    setGestureStatus(text);
  };

  // ────────────────────────────────────────────────────────────────────────
  // Coordinate mapping helpers
  //
  // KEY INSIGHT:
  //   • We send a horizontally-FLIPPED video stream over WebRTC (via the
  //     off-screen flip canvas).  Both local preview and remote users see
  //     the same already-flipped pixels — no CSS transform anywhere.
  //
  //   • MediaPipe reads the RAW (un-flipped) stream from rawVideoElRef.
  //     Its landmark coords are therefore in raw-frame space where
  //     normX=0 is the camera-left edge (= visual RIGHT of the flipped video).
  //
  //   • To draw on the FLIPPED canvas/overlay, we must mirror normX:
  //         flippedNormX = 1.0 - rawNormX
  //
  //   • We EMIT flipped coords so remote devices (which also show the
  //     flipped video) map correctly without any extra inversion.
  // ────────────────────────────────────────────────────────────────────────

  // Maps FLIPPED normalised coords [0,1] → canvas pixels (respects object-fit:contain).
  const normFlippedToCanvas = (canvas, flippedNormX, normY, videoEl) => {
    const cw = canvas.width;
    const ch = canvas.height;
    const vid = videoEl || canvas.parentElement?.querySelector("video");
    if (vid && vid.videoWidth > 0 && vid.videoHeight > 0) {
      const vA = vid.videoWidth / vid.videoHeight;
      const cA = cw / ch;
      let rw, rh, ox, oy;
      if (vA > cA) { rw = cw; rh = cw / vA; ox = 0; oy = (ch - rh) / 2; }
      else { rh = ch; rw = ch * vA; oy = 0; ox = (cw - rw) / 2; }
      return { x: ox + flippedNormX * rw, y: oy + normY * rh };
    }
    return { x: flippedNormX * cw, y: normY * ch };
  };

  // ── Draw a gesture op onto any canvas ────────────────────────────────────
  // Ops are always stored/transmitted in flipped-norm space, so we use
  // normFlippedToCanvas for both local and remote replay.
  const applyGestureOpToCanvas = (canvas, op) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cw = canvas.clientWidth || canvas.width;
    const ch = canvas.clientHeight || canvas.height;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }

    if (op.mode === "eraseAll") { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    if (!op.curr) return;

    const vid = canvas.parentElement?.querySelector("video");
    const curr = normFlippedToCanvas(canvas, op.curr.x, op.curr.y, vid);
    const prev = op.prev ? normFlippedToCanvas(canvas, op.prev.x, op.prev.y, vid) : null;

    if (op.mode === "draw" && prev) {
      ctx.strokeStyle = op.color || "#ef4444";
      ctx.lineWidth = op.thickness || 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(curr.x, curr.y);
      ctx.stroke();
    } else if (op.mode === "erase") {
      const s = op.thickness || 40;
      ctx.clearRect(curr.x - s / 2, curr.y - s / 2, s, s);
    }
  };

  const onOverlayReady = (senderId, canvasEl) => {
    (gestureOpsBySenderRef.current[senderId] || []).forEach(op => applyGestureOpToCanvas(canvasEl, op));
  };

  // Emit always uses flipped coords so every receiver maps to the flipped video
  const emitGestureEvent = (mode, prevNorm, currNorm, extra = {}) => {
    if (!socketRef.current || !roomId) return;
    socketRef.current.emit("gesture-draw", {
      roomId, mode,
      color: selectedColorRef.current,
      prev: prevNorm,
      curr: currNorm,
      thickness: (mode === "erase" || mode === "eraseAll")
        ? eraseThicknessRef.current : drawThicknessRef.current,
      ...extra,
    });
  };

  // ── Peer Connection ───────────────────────────────────────────────────────
  const createPeer = (targetId, initiator, stream) => {
    const peer = new RTCPeerConnection({ iceServers });
    if (stream) stream.getTracks().forEach(track => peer.addTrack(track, stream));

    peer.onicecandidate = e => {
      if (e.candidate) socketRef.current.emit("signal", {
        target: targetId, sender: socketRef.current.id,
        data: { type: "ice", candidate: e.candidate },
      });
    };

    peer.ontrack = e => {
      setRemoteUsers(prev => ({ ...prev, [targetId]: { stream: e.streams[0], isMicOn: true, isCamOn: true } }));
      setPinnedId(prev => prev === "local" ? targetId : prev);
    };

    if (initiator) {
      peer.createOffer()
        .then(offer => peer.setLocalDescription(offer))
        .then(() => socketRef.current.emit("signal", {
          target: targetId, sender: socketRef.current.id,
          data: { type: "offer", offer: peer.localDescription },
        }));
    }
    return peer;
  };

  // ── Main Init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const startApp = async () => {
      try {
        // 1. Raw camera stream
        const rawStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
        rawLocalStreamRef.current = rawStream;

        // 2. Hidden <video> plays raw stream for MediaPipe (never shown to user)
        const rawVideoEl = document.createElement("video");
        rawVideoEl.srcObject = rawStream;
        rawVideoEl.muted = true;
        rawVideoEl.playsInline = true;
        // Make sure it doesn't try to go fullscreen on iOS
        rawVideoEl.setAttribute("playsinline", "");
        rawVideoEl.play().catch(() => { });
        rawVideoElRef.current = rawVideoEl;

        // 3. Off-screen canvas: draws raw frame horizontally flipped at 30 fps
        const flipCanvas = document.createElement("canvas");
        flipCanvas.width = 640;
        flipCanvas.height = 480;
        flipCanvasRef.current = flipCanvas;
        const flipCtx = flipCanvas.getContext("2d");

        const runFlipLoop = () => {
          const v = rawVideoElRef.current;
          if (v && v.readyState >= 2 && v.videoWidth > 0) {
            if (flipCanvas.width !== v.videoWidth || flipCanvas.height !== v.videoHeight) {
              flipCanvas.width = v.videoWidth;
              flipCanvas.height = v.videoHeight;
            }
            flipCtx.save();
            flipCtx.translate(flipCanvas.width, 0);
            flipCtx.scale(-1, 1);           // ← horizontal flip
            flipCtx.drawImage(v, 0, 0);
            flipCtx.restore();
          }
          flipRafRef.current = requestAnimationFrame(runFlipLoop);
        };
        flipRafRef.current = requestAnimationFrame(runFlipLoop);

        // 4. Capture flipped canvas as MediaStream, combine with original audio
        const flipVideoTrack = flipCanvas.captureStream(30).getVideoTracks()[0];
        const audioTrack = rawStream.getAudioTracks()[0];
        const flippedStream = new MediaStream(
          audioTrack ? [flipVideoTrack, audioTrack] : [flipVideoTrack]
        );
        flippedStreamRef.current = flippedStream;

        // Local preview uses flipped stream — same pixels remote will see
        setLocalStream(flippedStream);
        if (localVideoRef.current) localVideoRef.current.srcObject = flippedStream;

        // 5. Signalling
        socketRef.current = io(SIGNALING_SERVER, {
          transports: ["websocket", "polling"],
          reconnectionAttempts: 5,
          timeout: 20000,
        });

        socketRef.current.on("connect", () => {
          setIsConnected(true);
          socketRef.current.emit("join-room", roomId);
        });
        socketRef.current.on("disconnect", () => setIsConnected(false));

        // All peers receive the FLIPPED stream
        socketRef.current.on("all-users", users => {
          users.forEach(userId => { peersRef.current[userId] = createPeer(userId, true, flippedStream); });
        });

        socketRef.current.on("user-joined", ({ sender }) => {
          setNotify(`User joined: ${sender.substring(0, 5)}`);
          setTimeout(() => setNotify(""), 3000);
        });

        socketRef.current.on("signal", async ({ sender, data }) => {
          if (!peersRef.current[sender]) peersRef.current[sender] = createPeer(sender, false, flippedStream);
          const peer = peersRef.current[sender];
          if (data.type === "offer") {
            await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            socketRef.current.emit("signal", {
              target: sender, sender: socketRef.current.id,
              data: { type: "answer", answer },
            });
          } else if (data.type === "answer") {
            await peer.setRemoteDescription(new RTCSessionDescription(data.answer));
          } else if (data.type === "ice") {
            try { await peer.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch { }
          }
        });

        socketRef.current.on("user-disconnected", id => {
          if (peersRef.current[id]) { peersRef.current[id].close(); delete peersRef.current[id]; }
          setRemoteUsers(prev => { const s = { ...prev }; delete s[id]; return s; });
          setNotify(`User left: ${id.substring(0, 5)}`);
          if (pinnedId === id) setPinnedId("local");
        });

        socketRef.current.on("remote-media-update", ({ sender, type, status }) => {
          setRemoteUsers(prev => {
            if (!prev[sender]) return prev;
            return { ...prev, [sender]: { ...prev[sender], [type === "mic" ? "isMicOn" : "isCamOn"]: status } };
          });
        });

        socketRef.current.on("gesture-draw", ({ sender, mode, color, prev, curr, thickness }) => {
          const op = { mode, color, prev, curr, thickness };
          const buf = (gestureOpsBySenderRef.current[sender] ||= []);
          buf.push(op);
          if (buf.length > 5000) buf.splice(0, buf.length - 5000);
          const ref = remoteCanvasRefs.current[sender];
          if (ref?.current) applyGestureOpToCanvas(ref.current, op);
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
      cancelAnimationFrame(flipRafRef.current);
      socketRef.current?.disconnect();
      rawLocalStreamRef.current?.getTracks().forEach(t => t.stop());
      if (rawVideoElRef.current) { rawVideoElRef.current.srcObject = null; rawVideoElRef.current = null; }
    };
    // eslint-disable-next-line
  }, [roomId]);

  // ── MediaPipe Gesture Detection ───────────────────────────────────────────
  useEffect(() => {
    if (!localStream) return;

    const HandsCtor = window.Hands || window.google?.mediapipe?.Hands;
    if (!HandsCtor) { console.error("Mediapipe Hands not available"); return; }

    const hands = new HandsCtor({
      locateFile: file => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });
    hands.setOptions({
      selfieMode: false,  // reads raw un-flipped frame
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    hands.onResults(results => {
      const { multiHandLandmarks } = results;
      const canvasEl = gestureCanvasRef.current;
      const ctx = canvasEl?.getContext("2d") ?? null;

      // Sync gesture canvas size
      if (canvasEl) {
        const cw = canvasEl.clientWidth || 640;
        const ch = canvasEl.clientHeight || 480;
        if (canvasEl.width !== cw || canvasEl.height !== ch) { canvasEl.width = cw; canvasEl.height = ch; }
      }

      if (!multiHandLandmarks?.length) {
        setGestureStatusThrottled("No hand", { minIntervalMs: 350 });
        lastDrawPosRef.current = null;
        smoothedTipRef.current = null;
        return;
      }

      const landmarks = multiHandLandmarks[0];

      // Helper: Strict finger up check
      const isFingerUp = (tipIdx, pipIdx, mcpIdx) => {
        return landmarks[tipIdx].y < landmarks[pipIdx].y && landmarks[pipIdx].y < landmarks[mcpIdx].y;
      };

      const indexUp = isFingerUp(8, 6, 5);
      const middleUp = isFingerUp(12, 10, 9);
      const ringUp = isFingerUp(16, 14, 13);
      const pinkyUp = isFingerUp(20, 18, 17);
      
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];

      // 1. Precise 3D Distance for Pinch
      const dx = indexTip.x - thumbTip.x;
      const dy = indexTip.y - thumbTip.y;
      const dz = indexTip.z - thumbTip.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // 2. State Hysteresis (Prevents flickering)
      const PINCH_START = 0.035; // Closer to start
      const PINCH_STOP = 0.065;  // Further to stop
      const currentlyDrawing = confirmedGestureRef.current === "draw";
      const isPinching = currentlyDrawing ? dist < PINCH_STOP : dist < PINCH_START;

      // ── STRICT MODE SELECTION (Mutually Exclusive) ────────────────────────
      let rawGesture = "idle";
      
      const allFingersDown = !indexUp && !middleUp && !ringUp && !pinkyUp;

      if (allFingersDown) {
        rawGesture = "fist";
      } 
      // 1. ERASE: All 4 main fingers must be up
      else if (indexUp && middleUp && ringUp && pinkyUp) {
        rawGesture = "erase";
      } 
      // 2. SELECT: Index and Middle ONLY
      else if (indexUp && middleUp && !ringUp) {
        rawGesture = "select";
      } 
      // 3. DRAW: Priority Pinch check
      else if (isPinching) {
        rawGesture = "draw";
      } 
      // 4. HOVER: Index ONLY (Middle MUST be down)
      else if (indexUp && !middleUp && dist > 0.08) {
        rawGesture = "hover";
      }

      // Update stability buffer
      const buf = gestureBufferRef.current;
      if (rawGesture === buf.gesture) buf.count = Math.min(buf.count + 1, GESTURE_STABILITY_FRAMES + 1);
      else { buf.gesture = rawGesture; buf.count = 1; }
      
      if (buf.count >= GESTURE_STABILITY_FRAMES) confirmedGestureRef.current = rawGesture;
      const gesture = confirmedGestureRef.current;

      // ── CRITICAL FIX: Reset drawing state if not in draw mode ──────────────
      if (gesture !== "draw") {
        lastDrawPosRef.current = null;
        smoothedTipRef.current = null;
      }

      if (!gestureEnabledRef.current) {
        lastDrawPosRef.current = null;
        smoothedTipRef.current = null;
        lastFistTimeRef.current = 0;
        document.getElementById("hover-cursor")?.style.setProperty("display", "none");
        return;
      }

      // Buffer loop for a sustained FIST (Clear Screen)
      if (gesture === "fist") {
        document.getElementById("hover-cursor")?.style.setProperty("display", "none");
        const now = performance?.now?.() ?? Date.now();
        if (!lastFistTimeRef.current) lastFistTimeRef.current = now;
        if (now - lastFistTimeRef.current > 2000) {
          if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
          emitGestureEvent("eraseAll", null, null);
          setGestureStatusThrottled("🗑️ Canvas cleared", { force: true });
          lastFistTimeRef.current = now; // reset after clear
        } else {
          setGestureStatusThrottled("✊ Hold to clear...", { force: true, minIntervalMs: 50 });
        }
        lastDrawPosRef.current = null;
        smoothedTipRef.current = null;
        return;
      } else {
        lastFistTimeRef.current = 0;
      }

      if (gesture === "idle") {
        document.getElementById("hover-cursor")?.style.setProperty("display", "none");
        setGestureStatusThrottled("Idle", { minIntervalMs: 250 });
        lastDrawPosRef.current = null;
        smoothedTipRef.current = null;
        return;
      }

      // Pinch -> erase size logic applies differently now. (Erase is just Flat Palm).
      // We lock the erase size proportionally to hand scaling, but static works for palm:
      if (gesture === "erase") {
         eraseThicknessRef.current = 60; // Huge flat palm footprint
      }

      // Ensure cursor aligns smoothly with user's tracking midpoint 
      const targetX = (gesture === "draw") ? (indexTip.x + thumbTip.x) / 2 : indexTip.x;
      const targetY = (gesture === "draw") ? (indexTip.y + thumbTip.y) / 2 : indexTip.y;

      if (!smoothedTipRef.current) smoothedTipRef.current = { x: targetX, y: targetY };
      else {
        const p = smoothedTipRef.current;
        smoothedTipRef.current = {
          x: SMOOTHING_ALPHA * targetX + (1 - SMOOTHING_ALPHA) * p.x,
          y: SMOOTHING_ALPHA * targetY + (1 - SMOOTHING_ALPHA) * p.y,
        };
      }

      const rawNormX = smoothedTipRef.current.x;  // in raw-frame space
      const rawNormY = smoothedTipRef.current.y;
      const emitNormX = 1.0 - rawNormX;
      const emitNormY = rawNormY;

      // Handle custom DOM Hover Cursor presentation seamlessly overlaying video feed
      const cursorEl = document.getElementById("hover-cursor");
      if (cursorEl && canvasEl) {
        if (gesture === "hover" || gesture === "select") {
          const hc = normFlippedToCanvas(canvasEl, emitNormX, emitNormY, rawVideoElRef.current);
          cursorEl.style.display = "block";
          cursorEl.style.left = `${hc.x}px`;
          cursorEl.style.top = `${hc.y}px`;
          setGestureStatusThrottled(gesture === "select" ? "✌️ Select Mode" : "👉 Hover Mode", { minIntervalMs: 200 });
        } else {
          cursorEl.style.display = "none";
        }
      }

      if (gesture === "select" || gesture === "hover" || gesture === "draw") {
        // ── Palette hit detection ──────────────────────────────────────
        // Use emitNormX (flipped) to map onto the flipped canvas overlay
        const paletteEl = canvasEl?.parentElement?.querySelector(".gesture-palette");
        if (paletteEl && canvasEl) {
          const { x: pixX, y: pixY } = normFlippedToCanvas(
            canvasEl, emitNormX, emitNormY, rawVideoElRef.current
          );
          const containerRect = canvasEl.parentElement.getBoundingClientRect();
          const paletteRect = paletteEl.getBoundingClientRect();
          const pLeft = paletteRect.left - containerRect.left;
          const pTop = paletteRect.top - containerRect.top;
          const pRight = pLeft + paletteRect.width;
          const pBot = pTop + paletteRect.height;

          if (pixX >= pLeft && pixX <= pRight && pixY >= pTop && pixY <= pBot) {
            const relX = pixX - pLeft;
            const buttons = paletteEl.querySelectorAll("button");
            for (let i = 0; i < buttons.length; i++) {
              const btnRect = buttons[i].getBoundingClientRect();
              const btnLeft = btnRect.left - paletteRect.left;
              const btnRight = btnLeft + btnRect.width;
              if (relX >= btnLeft && relX <= btnRight) {
                if (buttons[i].classList.contains("gesture-palette-erase")) {
                  if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
                  emitGestureEvent("eraseAll", null, null);
                  setGestureStatusThrottled("🗑️ Canvas cleared", { force: true });
                } else {
                  const newColor = COLOR_OPTIONS[i];
                  if (newColor && selectedColorRef.current !== newColor) {
                    selectedColorRef.current = newColor;
                    setSelectedColor(newColor);
                    setGestureStatusThrottled(`🎨 Color: ${newColor}`, { force: true });
                  }
                }
                break;
              }
            }
            lastDrawPosRef.current = null;
            return;
          }
        }

        // ── Draw stroke ────────────────────────────────────────────────
        setGestureStatusThrottled("✏️ Drawing", { minIntervalMs: 200 });
        if (!ctx) { lastDrawPosRef.current = null; return; }

        const prevEmit = lastDrawPosRef.current; // already in flipped-norm space
        if (prevEmit) {
          const curr = normFlippedToCanvas(canvasEl, emitNormX, emitNormY, rawVideoElRef.current);
          const prev = normFlippedToCanvas(canvasEl, prevEmit.x, prevEmit.y, rawVideoElRef.current);
          const dx = curr.x - prev.x, dy = curr.y - prev.y;
          if (dx * dx + dy * dy >= MIN_MOVE_PX * MIN_MOVE_PX) {
            const now = performance.now();
            if (now - lastDrawTimeRef.current >= MIN_DRAW_INTERVAL_MS) {
              lastDrawTimeRef.current = now;
              ctx.strokeStyle = selectedColorRef.current;
              ctx.lineWidth = drawThicknessRef.current;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              ctx.beginPath();
              ctx.moveTo(prev.x, prev.y);
              ctx.lineTo(curr.x, curr.y);
              ctx.stroke();
              emitGestureEvent("draw", prevEmit, { x: emitNormX, y: emitNormY });
            }
          }
        }
        lastDrawPosRef.current = { x: emitNormX, y: emitNormY };

      } else if (gesture === "erase") {
        setGestureStatusThrottled("🧹 Erasing", { minIntervalMs: 200 });
        if (!ctx) { lastDrawPosRef.current = null; return; }
        const { x, y } = normFlippedToCanvas(canvasEl, emitNormX, emitNormY, rawVideoElRef.current);
        const s = eraseThicknessRef.current;
        ctx.clearRect(x - s / 2, y - s / 2, s, s);
        emitGestureEvent("erase", null, { x: emitNormX, y: emitNormY });
        lastDrawPosRef.current = null;
      }
    });

    let rafId, cancelled = false;
    const processFrame = async () => {
      if (cancelled) return;
      const v = rawVideoElRef.current;
      const now = performance?.now?.() ?? Date.now();
      if (v && v.readyState >= 2 && v.videoWidth > 0 && now - lastHandsSendRef.current >= 16) {
        try { lastHandsSendRef.current = now; await hands.send({ image: v }); } catch { }
      }
      rafId = requestAnimationFrame(processFrame);
    };
    rafId = requestAnimationFrame(processFrame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      hands.close();
      setGestureStatus("");
      const c = gestureCanvasRef.current;
      if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    };
  }, [localStream]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const toggleMic = () => {
    const track = rawLocalStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMicOn(track.enabled);
    socketRef.current?.emit("media-toggle", { roomId, type: "mic", status: track.enabled });
  };

  const toggleCam = () => {
    const rawTrack = rawLocalStreamRef.current?.getVideoTracks()[0];
    const flipTrack = flippedStreamRef.current?.getVideoTracks()[0];
    if (!rawTrack || !flipTrack) return;
    const next = !rawTrack.enabled;
    rawTrack.enabled = next;
    flipTrack.enabled = next;
    setIsCamOn(next);
    socketRef.current?.emit("media-toggle", { roomId, type: "cam", status: next });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setNotify("Link copied!");
    setTimeout(() => setNotify(""), 3000);
  };

  const sendChat = e => {
    e.preventDefault();
    if (chatInput.trim()) {
      socketRef.current.emit("send-message", { roomId, message: chatInput });
      setChatInput("");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  let bigStream = null, bigIsMic = true, bigIsCam = true, bigName = "";
  if (pinnedId === "local") {
    bigStream = localStream; bigIsMic = isMicOn; bigIsCam = isCamOn; bigName = "You (Pinned)";
  } else if (remoteUsers[pinnedId]) {
    const u = remoteUsers[pinnedId];
    bigStream = u.stream; bigIsMic = u.isMicOn; bigIsCam = u.isCamOn;
    bigName = `User ${pinnedId.substring(0, 4)}`;
  }

  return (
    <div className="room-container" style={containerStyle}>
      <div style={connectionStatusStyle(isConnected)}>
        {isConnected ? "🟢 Connected" : "🔴 Disconnected"}
      </div>
      {notify && <div style={notifyStyle}>🔔 {notify}</div>}

      <div className="room-main" style={mainAreaStyle}>
        {bigStream ? (
          <div style={{ width: "100%", height: "100%", position: "relative" }}>
            <VideoCard
              stream={bigStream} isMicOn={bigIsMic} isCamOn={bigIsCam}
              name={bigName} isBig={true}
              videoRef={pinnedId === "local" ? localVideoRef : null}
              overlayRef={pinnedId !== "local" ? getRemoteCanvasRef(pinnedId) : null}
              overlayOwnerId={pinnedId !== "local" ? pinnedId : null}
              onOverlayReady={onOverlayReady}
              isLocal={pinnedId === "local"}
            />
            {pinnedId === "local" && gestureEnabled && (
              <>
                <canvas ref={gestureCanvasRef} style={overlayCanvasStyle} />
                <div id="hover-cursor" style={{
                  position: "absolute", width: "16px", height: "16px",
                  borderRadius: "50%", backgroundColor: "rgba(255, 255, 255, 0.4)", border: "2px solid #fff",
                  pointerEvents: "none", zIndex: 100, display: "none",
                  transform: "translate(-50%, -50%)", 
                  boxShadow: "0 0 10px rgba(0,0,0,0.5)"
                }} />
                <div className="gesture-palette">
                  {COLOR_OPTIONS.map(color => (
                    <button
                      key={color}
                      className={`gesture-palette-color${selectedColor === color ? " active" : ""}`}
                      style={{ "--swatch-color": color }}
                      onClick={() => { selectedColorRef.current = color; setSelectedColor(color); }}
                      title={`Select ${color}`}
                    />
                  ))}
                  <button
                    className="gesture-palette-erase"
                    onClick={() => {
                      gestureCanvasRef.current?.getContext("2d")?.clearRect(
                        0, 0, gestureCanvasRef.current.width, gestureCanvasRef.current.height
                      );
                      emitGestureEvent("eraseAll", null, null);
                    }}
                    title="Clear canvas"
                  ><Trash2 size={14} /></button>
                </div>
                {gestureStatus && <div style={gestureBadgeStyle}>{gestureStatus}</div>}
              </>
            )}
          </div>
        ) : (
          <div style={{ color: "white" }}>Waiting for users…</div>
        )}
      </div>

      {isChatOpen && (
        <div className="room-chat" style={chatSidebarStyle}>
          <div style={chatHeaderStyle}>
            <h3>Chat</h3>
            <button onClick={() => setIsChatOpen(false)} style={closeChatBtnStyle}>×</button>
          </div>
          <div style={chatMessagesStyle}>
            {messages.map((msg, idx) => {
              const isMe = msg.sender === socketRef.current?.id;
              return (
                <div key={idx} style={{ marginBottom: 10, textAlign: isMe ? "right" : "left" }}>
                  <div style={{ fontWeight: "bold", fontSize: 12, color: "#9aa0a6" }}>
                    {isMe ? "You" : `User ${msg.sender.substring(0, 4)}`}
                  </div>
                  <div style={{ backgroundColor: isMe ? "#00796b" : "#fff", padding: 8, borderRadius: 8, display: "inline-block", maxWidth: "80%", wordWrap: "break-word" }}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={sendChat} style={chatInputAreaStyle}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message…" style={chatInputStyle} />
            <button type="submit" style={chatSendBtnStyle}>➤</button>
          </form>
        </div>
      )}

      {showParticipantsStrip && (
        <div className="room-strip" style={stripStyle}>
          {pinnedId !== "local" && (
            <VideoCard stream={localStream} isMicOn={isMicOn} isCamOn={isCamOn}
              name="You" isBig={false} onClick={() => setPinnedId("local")} isLocal={true} />
          )}
          {Object.keys(remoteUsers).map(id => {
            if (id === pinnedId) return null;
            const u = remoteUsers[id];
            return (
              <VideoCard key={id} stream={u.stream} isMicOn={u.isMicOn} isCamOn={u.isCamOn}
                name={`User ${id.substring(0, 4)}`} isBig={false}
                onClick={() => setPinnedId(id)}
                overlayRef={getRemoteCanvasRef(id)} overlayOwnerId={id}
                onOverlayReady={onOverlayReady} isLocal={false} />
            );
          })}
        </div>
      )}

      <div className="room-controls" style={controlsStyle}>
        <button onClick={toggleMic} style={btnStyle(isMicOn)} title={isMicOn ? "Mute" : "Unmute"}>
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </button>
        <button onClick={toggleCam} style={btnStyle(isCamOn)} title={isCamOn ? "Cam off" : "Cam on"}>
          {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
        </button>
        <button onClick={() => setGestureEnabled(p => !p)} style={btnStyle(gestureEnabled)} title="Toggle gesture drawing">
          <Hand size={20} />
        </button>
        <button onClick={() => setShowParticipantsStrip(p => !p)} style={btnStyle(showParticipantsStrip)} title="Participants">
          <Users size={20} />
        </button>
        <button onClick={() => setIsChatOpen(!isChatOpen)} style={btnStyle(true)} title="Chat">
          <MessageCircle size={20} />
        </button>
        <button onClick={copyLink} style={btnStyle(true)} title="Copy link">
          <Link2 size={20} />
        </button>
        <button onClick={() => navigate("/")} style={endBtnStyle}>End Call</button>
      </div>
    </div>
  );
}

// ── VideoCard ─────────────────────────────────────────────────────────────────
const VideoCard = ({ stream, isMicOn, isCamOn, name, onClick, isBig, videoRef, overlayRef, overlayOwnerId, onOverlayReady, isLocal }) => {
  const internalRef = useRef(null);
  const vidRef = videoRef || internalRef;
  const [forceMute, setForceMute] = useState(false);

  useEffect(() => {
    const el = vidRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    const tryPlay = async () => {
      try { await el.play(); }
      catch { if (!isLocal) { setForceMute(true); try { await el.play(); } catch { } } }
    };
    tryPlay();
  }, [stream, isLocal]);

  useEffect(() => {
    if (overlayRef?.current && overlayOwnerId && onOverlayReady)
      onOverlayReady(overlayOwnerId, overlayRef.current);
  }, [overlayRef, overlayOwnerId, onOverlayReady]);

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
            ref={vidRef} autoPlay muted={!!isLocal || forceMute} playsInline
            style={{
              width: "100%", height: "100%",
              objectFit: "contain", backgroundColor: "black",
              transform: "none", // ✅ no CSS mirroring anywhere — stream is already correctly flipped
            }}
          />
          {!isLocal && forceMute && (
            <button type="button" onClick={() => setForceMute(false)}
              style={{ position: "absolute", right: 12, bottom: 12, padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(0,0,0,0.45)", color: "white", cursor: "pointer", fontSize: 12 }}>
              Unmute
            </button>
          )}
          {overlayRef && <canvas ref={overlayRef} style={overlayCanvasStyle} />}
        </>
      )}
      <div style={nameTagStyle}>{name} {!isMicOn && "🔇"}</div>
    </div>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const containerStyle = { display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", position: "relative" };
const mainAreaStyle = { flex: 1, display: "flex", justifyContent: "center", alignItems: "center", overflow: "hidden", position: "relative" };
const stripStyle = { height: "180px", display: "flex", alignItems: "center", gap: "10px", padding: "10px", backgroundColor: "#171717", overflowX: "auto", borderTop: "1px solid #333", zIndex: 10 };
const cardStyle = { backgroundColor: "#020617", borderRadius: "16px", overflow: "hidden", position: "relative", flexShrink: 0, boxShadow: "0 0 40px rgba(56,189,248,0.20),0 0 80px rgba(147,51,234,0.20)", border: "1px solid rgba(30,64,175,0.55)" };
const avatarContainerStyle = { width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: "#202124" };
const avatarStyle = { width: "60px", height: "60px", borderRadius: "50%", backgroundColor: "#5f6368", color: "white", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px", fontWeight: "bold" };
const muteBadgeStyle = { position: "absolute", bottom: "35px", right: "10px", fontSize: "20px" };
const nameTagStyle = { position: "absolute", bottom: "5px", left: "10px", color: "white", backgroundColor: "rgba(0,0,0,0.6)", padding: "2px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "bold" };
const notifyStyle = { position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", backgroundColor: "#00796b", color: "white", padding: "10px 20px", borderRadius: "20px", zIndex: 99 };
const controlsStyle = { height: "70px", backgroundColor: "#1e1e1e", display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", zIndex: 20 };
const btnStyle = isOn => ({ width: "50px", height: "50px", borderRadius: "50%", border: "none", backgroundColor: isOn ? "#3c4043" : "#ea4335", color: "white", fontSize: "20px", cursor: "pointer", display: "flex", justifyContent: "center", alignItems: "center", transition: "0.2s" });
const endBtnStyle = { padding: "0 20px", height: "50px", borderRadius: "30px", border: "none", backgroundColor: "#ea4335", color: "white", fontWeight: "bold", cursor: "pointer" };
const chatSidebarStyle = { position: "absolute", right: 0, top: 0, bottom: "70px", width: "300px", backgroundColor: "#202124", borderLeft: "1px solid #3c4043", display: "flex", flexDirection: "column", zIndex: 50 };
const chatHeaderStyle = { padding: "15px", borderBottom: "1px solid #3c4043", display: "flex", justifyContent: "space-between", alignItems: "center" };
const closeChatBtnStyle = { background: "none", border: "none", color: "white", fontSize: "24px", cursor: "pointer" };
const chatMessagesStyle = { flex: 1, padding: "15px", overflowY: "auto", display: "flex", flexDirection: "column" };
const chatInputAreaStyle = { padding: "15px", borderTop: "1px solid #3c4043", display: "flex", gap: "10px" };
const chatInputStyle = { flex: 1, padding: "10px", borderRadius: "20px", border: "none", backgroundColor: "#3c4043", color: "white", outline: "none" };
const chatSendBtnStyle = { background: "none", border: "none", color: "#8ab4f8", fontSize: "20px", cursor: "pointer" };
const connectionStatusStyle = ok => ({ position: "absolute", top: "10px", left: "10px", padding: "5px 10px", borderRadius: "10px", backgroundColor: ok ? "rgba(0,128,0,0.5)" : "rgba(255,0,0,0.5)", color: "white", fontSize: "12px", fontWeight: "bold", zIndex: 100 });
const overlayCanvasStyle = { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" };
const gestureBadgeStyle = { position: "absolute", top: "16px", right: "16px", padding: "6px 12px", borderRadius: "16px", backgroundColor: "rgba(0,0,0,0.6)", color: "white", fontSize: "12px", fontWeight: "bold" };

export default Room;