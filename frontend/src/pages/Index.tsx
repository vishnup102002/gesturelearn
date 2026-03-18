import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import GlowCanvas from "@/components/GlowCanvas";

const Index = () => {
  const [roomCode, setRoomCode] = useState("");
  const navigate = useNavigate();

  const handleStartMeeting = () => {
    const newCode = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${newCode}`);
  };

  const handleJoin = () => {
    const code = roomCode.trim();
    if (!code) return;
    navigate(`/room/${code}`);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <GlowCanvas />

      {/* Ambient orbs */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-1/4 top-1/4 h-[400px] w-[400px] rounded-full bg-glow-purple/10 blur-[120px] animate-pulse-glow" />
        <div className="absolute right-1/4 bottom-1/4 h-[350px] w-[350px] rounded-full bg-glow-cyan/8 blur-[100px] animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
      </div>

      {/* Glass Card */}
      <div className="glass-card relative z-10 mx-4 w-full max-w-md rounded-2xl p-8 sm:p-10">
        {/* Logo / Title */}
        <div className="mb-8 text-center">




          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground glow-text-cyan sm:text-5xl">
            Gesture<span className="text-glow-purple glow-text-purple">Learn</span>
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Gesture-Based Collaborative Learning Platform
          </p>
        </div>

        {/* Start Meeting */}
        <Button
          variant="neonPrimary"
          size="lg"
          className="mb-6 w-full"
          onClick={handleStartMeeting}
        >
          <Video className="h-5 w-5" />
          Start Meeting
        </Button>

        {/* Divider */}
        <div className="mb-6 flex items-center gap-3">
          <div className="neon-underline h-px flex-1" />
          <span className="text-xs text-muted-foreground">or join existing</span>
          <div className="neon-underline h-px flex-1" />
        </div>

        {/* Join Section */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Enter room code..."
              className="w-full bg-transparent border-0 border-b-2 border-glow-cyan/30 px-1 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-glow-cyan focus:outline-none transition-colors duration-300 font-body"
            />
          </div>
          <Button variant="neonOutline" size="default" onClick={handleJoin}>
            <LogIn className="h-4 w-4" />
            Join
          </Button>
        </div>
      </div>
    </div >
  );
};

export default Index;
