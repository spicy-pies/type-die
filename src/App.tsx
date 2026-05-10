import { useState, useEffect, useRef, useCallback } from "react";

const WORDS = [
  "death", "chaos", "void", "doom", "glitch", "panic", "feral", "cursed",
  "unhinged", "cooked", "slay", "rizz", "yikes", "bruh", "sheesh", "bussin",
  "delulu", "snatched", "periodt", "understood", "nocap", "lowkey", "highkey",
  "vibe", "ick", "rent", "broke", "deadline", "ghosted", "rejected", "yeet",
  "algorithm", "recursion", "segfault", "undefined", "null", "overflow",
  "deprecate", "kubernetes", "webpack", "typescript", "abstraction",
  "neural", "cipher", "matrix", "protocol", "daemon", "phantom", "rogue",
  "corrupt", "virus", "firewall", "breach", "malware", "exploit", "zero-day"
];

// Base speed, word count, and ramp rate per difficulty
const DIFF_CONFIG = {
  easy:   { baseSpeed: 1.4, wordCount: 1, rampPer30s: 0.12 },
  medium: { baseSpeed: 1.8, wordCount: 2, rampPer30s: 0.18 },
  hard:   { baseSpeed: 2.6, wordCount: 4, rampPer30s: 0.28 },
};

type Difficulty = "easy" | "medium" | "hard";

interface WordEntry {
  id: number;
  text: string;
  x: number;
  y: number;
}

let idCounter = 0;

function getRandomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

const LANES = [15, 28, 41, 54, 67, 80];

function getRandomY(occupiedLanes: number[]): number {
  // spread words across vertical lanes to avoid overlap
  const available = LANES.filter(l => !occupiedLanes.includes(l));
  const pool = available.length > 0 ? available : LANES;
  return pool[Math.floor(Math.random() * pool.length)];
}


export default function TypeDie() {
  const [gameState, setGameState] = useState<"idle" | "playing" | "dead">("idle");
  const [words, setWords] = useState<WordEntry[]>([]);
  const [typed, setTyped] = useState("");
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [shake, setShake] = useState(false);
  const [killFlash, setKillFlash] = useState(false);
  const [lives, setLives] = useState(3);
  const [glitchTitle, setGlitchTitle] = useState(false);
  const [combo, setCombo] = useState(0);
  const [apiWords, setApiWords] = useState<string[]>([]);
  const [wordPoolReady, setWordPoolReady] = useState(false);

  const animRef = useRef<number | null>(null);
  const gameStartTime = useRef<number>(0);

  const getWordRef = useRef<() => string>(getRandomWord);

  useEffect(() => {
    const pool = [...WORDS, ...apiWords];
    getWordRef.current = () => pool[Math.floor(Math.random() * pool.length)];
  }, [apiWords]);

  const wordsRef = useRef<WordEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const livesRef = useRef(3);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const screenWidth = typeof window !== "undefined" ? window.innerWidth : 800;

  // keep refs in sync
  useEffect(() => { wordsRef.current = words; }, [words]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { comboRef.current = combo; }, [combo]);

  useEffect(() => {
  const fetchWords = async () => {
    try {
      const [longRes, medRes] = await Promise.all([
        fetch("https://random-word-api.herokuapp.com/word?number=40&length=10"),
        fetch("https://random-word-api.herokuapp.com/word?number=40&length=8"),
      ]);
      const long: string[] = longRes.ok ? await longRes.json() : [];
      const med: string[] = medRes.ok ? await medRes.json() : [];
      const combined = [...long, ...med].filter(w => w.length >= 7);
      if (combined.length > 0) setApiWords(combined);
    } catch {
      // fall back to local words
    } finally {
      setWordPoolReady(true);
    }
  };
  fetchWords();
  }, []);

  useEffect(() => {
    if (gameState !== "idle") return;
    const interval = setInterval(() => {
      setGlitchTitle(true);
      setTimeout(() => setGlitchTitle(false), 150);
    }, 3000);
    return () => clearInterval(interval);
  }, [gameState]);

  const spawnWord = useCallback(() => {
    const newWord: WordEntry = {
      id: idCounter++,
      text: getWordRef.current(),
      x: 0,
      y: getRandomY(wordsRef.current.map(w => w.y)),
    };
    wordsRef.current = [...wordsRef.current, newWord];
    setWords([...wordsRef.current]);
  }, []);

  useEffect(() => {
    if (gameState !== "playing") return;
    const cfg = DIFF_CONFIG[difficulty];
    let last: number | null = null;

    const tick = (timestamp: number) => {
      if (!last) last = timestamp;
      const delta = (timestamp - last) / 16;
      last = timestamp;

      // Gradual speed ramp: increases every 30s
      const elapsed = (timestamp - gameStartTime.current) / 1000;
      const ramp = (elapsed / 30) * cfg.rampPer30s;
      const currentSpeed = cfg.baseSpeed + ramp;

      const updated = wordsRef.current.map(w => ({ ...w, x: w.x + currentSpeed * delta }));
      const escaped = updated.filter(w => w.x > screenWidth - 80);
      const surviving = updated.filter(w => w.x <= screenWidth - 80);

      if (escaped.length > 0) {
        const newLives = livesRef.current - escaped.length;
        livesRef.current = Math.max(0, newLives);
        setLives(livesRef.current);
        comboRef.current = 0;
        setCombo(0);
        setShake(true);
        setTimeout(() => setShake(false), 600);

        if (livesRef.current <= 0) {
          wordsRef.current = [];
          setWords([]);
          setGameState("dead");
          if (animRef.current) cancelAnimationFrame(animRef.current);
          setHighScore(h => Math.max(h, scoreRef.current));
          return;
        }

        const respawned = escaped.map(() => ({
          id: idCounter++,
          text: getWordRef.current(),
          x: 0,
          y: getRandomY(surviving.map(w => w.y))
        }));
        wordsRef.current = [...surviving, ...respawned];
      } else {
        wordsRef.current = surviving;
      }

      // top up to target word count
      while (wordsRef.current.length < cfg.wordCount) {
       const occupiedLanes = wordsRef.current.map(w => w.y);
        wordsRef.current = [...wordsRef.current, {
          id: idCounter++,
          text: getWordRef.current(),
          x: 0,
          y: getRandomY(occupiedLanes),
        }];
      }

      setWords([...wordsRef.current]);
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [gameState, difficulty, screenWidth]);

  const startGame = () => {
    idCounter = 0;
    wordsRef.current = [];
    setWords([]);
    setScore(0);
    scoreRef.current = 0;
    setLives(3);
    livesRef.current = 3;
    setCombo(0);
    comboRef.current = 0;
    setTyped("");
    gameStartTime.current = performance.now();
    const cfg = DIFF_CONFIG[difficulty];
    const initial: WordEntry[] = [];
    for (let i = 0; i < cfg.wordCount; i++) {
      const occupiedLanes = initial.map(w => w.y);
      initial.push({ id: idCounter++, text: getWordRef.current(), x: i * 80, y: getRandomY(occupiedLanes) });
    }
    wordsRef.current = initial;
    setWords(initial);
    setGameState("playing");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTyped(val);

    const match = wordsRef.current.find(w => w.text === val);
    if (match) {
      setKillFlash(true);
      setTimeout(() => setKillFlash(false), 250);
      const newCombo = comboRef.current + 1;
      comboRef.current = newCombo;
      setCombo(newCombo);
      const gained = match.text.length * newCombo;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      wordsRef.current = wordsRef.current.filter(w => w.id !== match.id);
      setWords([...wordsRef.current]);
      spawnWord();
      e.target.value = "";
      setTyped("");
    }
  };

  const danger = (x: number) => x > screenWidth * 0.6;

  // highlight matching prefix across all words
  const getMatchingWord = () => {
    if (!typed) return null;
    return wordsRef.current.find(w => w.text.startsWith(typed)) ?? null;
  };
  const matchingWord = getMatchingWord();

  return (
    <div style={{
      background: "radial-gradient(ellipse at 30% 40%, #1a002e 0%, #050515 50%, #000a1a 100%)",
      minHeight: "100vh",
      width: "100vw",
      fontFamily: "'Courier New', monospace",
      color: "#fff",
      overflow: "hidden",
      position: "relative",
      userSelect: "none",
    }}>
      {/* Grid */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `linear-gradient(rgba(100,0,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(100,0,255,0.05) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Scanlines */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 50,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
      }} />

      {killFlash && (
        <div style={{
          position: "fixed", inset: 0,
          background: "radial-gradient(ellipse at center, rgba(0,255,255,0.12), transparent 70%)",
          zIndex: 99, pointerEvents: "none"
        }} />
      )}

      {/* IDLE */}
      {gameState === "idle" && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", gap: 32,
          position: "relative", zIndex: 10
        }}>

          {/* Tie-dye galaxy background blobs */}
          <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "hidden" }}>
            <div style={{
              position: "absolute", width: 600, height: 600,
              borderRadius: "50%", top: "-10%", left: "-10%",
              background: "radial-gradient(circle, #ff006688 0%, #ff44cc44 35%, transparent 70%)",
              filter: "blur(60px)", animation: "blob1 8s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 500, height: 500,
              borderRadius: "50%", top: "10%", right: "-5%",
              background: "radial-gradient(circle, #7700ff88 0%, #aa00ff44 35%, transparent 70%)",
              filter: "blur(50px)", animation: "blob2 10s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 450, height: 450,
              borderRadius: "50%", bottom: "5%", left: "20%",
              background: "radial-gradient(circle, #00eeff66 0%, #00aaff44 35%, transparent 70%)",
              filter: "blur(55px)", animation: "blob3 9s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 350, height: 350,
              borderRadius: "50%", bottom: "20%", right: "15%",
              background: "radial-gradient(circle, #ff770066 0%, #ffaa0033 35%, transparent 70%)",
              filter: "blur(45px)", animation: "blob4 7s ease-in-out infinite",
            }} />
            <div style={{
              position: "absolute", width: 300, height: 300,
              borderRadius: "50%", top: "40%", left: "35%",
              background: "radial-gradient(circle, #00ff8844 0%, #00ffaa22 35%, transparent 70%)",
              filter: "blur(40px)", animation: "blob5 11s ease-in-out infinite",
            }} />

          </div>

          <div style={{ textAlign: "center", position: "relative", zIndex: 2 }}>
            {/* TYPE/DIE as one glitchy title */}
            <div style={{ position: "relative", display: "inline-block" }}>
              {/* Toonami-style layered outline effect */}
              {/* Outer glow layer */}
              <h1 aria-hidden style={{
                position: "absolute", inset: 0,
                fontSize: "clamp(70px, 18vw, 180px)", fontWeight: 900,
                letterSpacing: "0.06em", margin: 0, lineHeight: 1,
                color: "transparent",
                WebkitTextStroke: "12px #7700ff22",
                pointerEvents: "none",
                transform: glitchTitle ? "skewX(-3deg)" : "none",
                transition: "transform 0.08s",
              }}>TYPE/DIE</h1>
              {/* Mid outline layer */}
              <h1 aria-hidden style={{
                position: "absolute", inset: 0,
                fontSize: "clamp(70px, 18vw, 180px)", fontWeight: 900,
                letterSpacing: "0.06em", margin: 0, lineHeight: 1,
                color: "transparent",
                WebkitTextStroke: glitchTitle ? "5px #00ffff99" : "5px #0088ff66",
                pointerEvents: "none",
                transform: glitchTitle ? "skewX(-3deg) translateX(-3px)" : "none",
                transition: "all 0.08s",
              }}>TYPE/DIE</h1>
              {/* Inner outline layer */}
              <h1 aria-hidden style={{
                position: "absolute", inset: 0,
                fontSize: "clamp(70px, 18vw, 180px)", fontWeight: 900,
                letterSpacing: "0.06em", margin: 0, lineHeight: 1,
                color: "transparent",
                WebkitTextStroke: glitchTitle ? "2px #ff00cccc" : "2px #cc44ffcc",
                pointerEvents: "none",
                transform: glitchTitle ? "skewX(-3deg) translateX(3px)" : "none",
                transition: "all 0.08s",
              }}>TYPE/DIE</h1>
              {/* Main filled layer — tie-dye gradient */}
              <h1 style={{
                fontSize: "clamp(70px, 18vw, 180px)", fontWeight: 900,
                letterSpacing: "0.06em", margin: 0, lineHeight: 1,
                color: "transparent",
                backgroundImage: "linear-gradient(135deg, #ff66cc 0%, #ff2200 18%, #ffaa00 34%, #00ffcc 50%, #0066ff 68%, #cc00ff 84%, #ff66cc 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                backgroundSize: "200% 200%",
                animation: "tiedye 5s ease infinite",
                WebkitTextStroke: "1px transparent",
                filter: glitchTitle
                  ? "drop-shadow(0 0 20px #ff00cc99) drop-shadow(6px 0 #00ffff66)"
                  : "drop-shadow(0 0 30px #aa44ff66) drop-shadow(0 0 60px #7700ff33)",
                transform: glitchTitle ? "skewX(-3deg) skewY(1deg)" : "none",
                transition: "filter 0.08s, transform 0.08s",
              }}>TYPE/DIE</h1>
            </div>

            <p style={{
              fontSize: "clamp(11px, 1.5vw, 15px)", letterSpacing: "0.45em",
              margin: "16px 0 0",
              color: "#cc99ff",
              textShadow: "0 0 20px #aa66ff, 0 0 40px #7700ff88",
              textTransform: "uppercase", fontWeight: 600,
            }}>type the word before it escapes the grid</p>
          </div>

          {/* Difficulty */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <p style={{ color: "#aa77ff", fontSize: 10, letterSpacing: "0.4em", margin: 0, textTransform: "uppercase", textShadow: "0 0 12px #7700ff" }}>difficulty</p>
            <div style={{ display: "flex" }}>
              {(["easy", "medium", "hard"] as Difficulty[]).map((d, i) => (
                <button key={d} onClick={() => setDifficulty(d)} style={{
                  background: difficulty === d ? "#8800ff44" : "#ffffff08",
                  color: difficulty === d ? "#ffffff" : "#bb99ff",
                  border: difficulty === d ? "1px solid #aa55ff" : "1px solid #6633aa",
                  borderLeft: i > 0 ? "none" : undefined,
                  padding: "10px 28px", fontFamily: "inherit", fontSize: 11,
                  letterSpacing: "0.35em", cursor: "pointer", textTransform: "uppercase",
                  boxShadow: difficulty === d ? "inset 0 0 24px #7700ff44, 0 0 24px #7700ff55" : "none",
                  textShadow: difficulty === d ? "0 0 18px #cc88ff, 0 0 8px #fff" : "0 0 8px #9966cc",
                  fontWeight: difficulty === d ? 900 : 400,
                  transition: "all 0.2s",
                }}>{d}</button>
              ))}
            </div>
          </div>



          <button onClick={startGame} style={{
            background: "transparent", color: "#00ffff", border: "2px solid #00ffff",
            padding: "16px 60px", fontSize: 14, fontFamily: "inherit", fontWeight: 900,
            letterSpacing: "0.45em", cursor: "pointer", textTransform: "uppercase",
            boxShadow: "0 0 30px #00ffff33, inset 0 0 30px #00ffff0a",
            textShadow: "0 0 20px #00ffff", transition: "all 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.background = "#00ffff11"; e.currentTarget.style.boxShadow = "0 0 60px #00ffff66, inset 0 0 40px #00ffff22"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.boxShadow = "0 0 30px #00ffff33, inset 0 0 30px #00ffff0a"; }}
          >START GAME</button>

          {highScore > 0 && (
            <p style={{ color: "#aa88dd", fontSize: 11, letterSpacing: "0.35em", margin: 0, textShadow: "0 0 10px #7700ff66" }}>
              BEST RUN: <span style={{ color: "#ee99ff", textShadow: "0 0 14px #cc44ff" }}>{highScore}</span>
            </p>
          )}
        </div>
      )}

      {/* PLAYING */}
      {gameState === "playing" && (
        <>
          {/* Original dark bg */}
          <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
            background: "#050510" }} />

          {/* HUD top bar */}
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "14px 28px",
            borderBottom: "1px solid #7700ff44",
            background: "rgba(0,0,8,0.92)",
            backdropFilter: "blur(8px)",
          }}>
            {/* Left accent line */}
            <div style={{ position: "absolute", bottom: -1, left: 0, width: "30%", height: 1, background: "linear-gradient(90deg, #7700ff, transparent)" }} />
            <div style={{ position: "absolute", bottom: -1, right: 0, width: "30%", height: 1, background: "linear-gradient(270deg, #00ccff, transparent)" }} />

            <div style={{ fontSize: 11, letterSpacing: "0.35em", color: "#6644aa", fontFamily: "'Exo 2', monospace" }}>
              SCORE <span style={{ color: "#cc88ff", fontSize: 22, fontWeight: 900, textShadow: "0 0 20px #9900ff88" }}>{score}</span>
            </div>
            {combo > 1 && (
              <div style={{
                fontSize: 10, letterSpacing: "0.35em", fontFamily: "'Exo 2', monospace",
                background: "linear-gradient(90deg, #ff88cc, #ffcc44, #44ffcc)",
                WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
                filter: "drop-shadow(0 0 8px #ffaa0066)",
              }}>⚡ {combo}× COMBO</div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              {[...Array(3)].map((_, i) => (
                <span key={i} style={{
                  fontSize: 15,
                  color: i < lives ? "#ff3366" : "#ffffff08",
                  textShadow: i < lives ? "0 0 12px #ff3366, 0 0 24px #ff006644" : "none",
                  transition: "all 0.4s"
                }}>♥</span>
              ))}
            </div>
          </div>

          {/* Words layer */}
          <div style={{
            position: "fixed", inset: 0, zIndex: 5,
            animation: shake ? "shake 0.6s ease" : "none",
          }}>
            {words.map(w => {
              const isDanger = danger(w.x);
              const isTarget = matchingWord?.id === w.id;
              return (
                <div key={w.id} style={{
                  position: "absolute",
                  left: `${w.x}px`,
                  top: `${w.y}%`,
                  transform: "translateY(-50%)",
                  whiteSpace: "nowrap",
                }}>
                  {/* danger edge flash */}
                  {isDanger && (
                    <div style={{
                      position: "absolute", right: -20, top: -40, bottom: -40, width: 100,
                      background: "linear-gradient(to left, #ff002244, transparent)",
                      pointerEvents: "none",
                    }} />
                  )}

                  {/* target indicator */}
                  {isTarget && (
                    <div style={{
                      position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)",
                      fontSize: 9, letterSpacing: "0.3em", color: "#00ccff",
                      textShadow: "0 0 8px #00ccff",
                    }}>▼</div>
                  )}

                  {/* The word itself — Toonami outline style with tie-dye colour hints */}
                  <div style={{ position: "relative", display: "inline-block" }}>
                    {w.text.split("").map((char, i) => {
                      const isTyped = isTarget && i < typed.length;
                      const isCorrect = isTyped && typed[i] === char;
                      const isWrong = isTyped && typed[i] !== char;

                      // tie-dye colour per char for idle
                      const tieDyeColors = ["#ff88dd", "#bb88ff", "#88ddff", "#88ffcc", "#ffdd88"];
                      const idleColor = tieDyeColors[i % tieDyeColors.length];

                      return (
                        <span key={i} style={{
                          fontSize: "clamp(28px, 4.5vw, 58px)",
                          fontWeight: 900,
                          fontFamily: "'Exo 2', 'Orbitron', 'Courier New', monospace",
                          letterSpacing: "0.1em",
                          display: "inline-block",
                          color: isCorrect
                            ? "#00ffee"
                            : isWrong
                            ? "#ff2244"
                            : isDanger
                            ? "#ffbb44"
                            : isTarget
                            ? "#ffffff"
                            : idleColor,
                          textShadow: isCorrect
                            ? "0 0 25px #00ffee, 0 0 50px #00ffcc99, 0 2px 6px #000"
                            : isWrong
                            ? "0 0 22px #ff2244cc, 0 2px 6px #000"
                            : isDanger
                            ? "0 0 20px #ffbb44cc, 0 2px 6px #000"
                            : isTarget
                            ? "0 0 18px #ffffffaa, 0 0 35px #8899ffaa, 0 2px 6px #000"
                            : `0 0 16px ${idleColor}cc, 0 2px 6px #000`,
                          WebkitTextStroke: isCorrect
                            ? "1px #00eeddaa"
                            : isWrong
                            ? "1px #ff224488"
                            : isDanger
                            ? "1px #ffbb4499"
                            : isTarget
                            ? "1px #aabbffaa"
                            : `1px ${idleColor}99`,
                          transition: "color 0.06s, text-shadow 0.06s",
                        }}>{char}</span>
                      );
                    })}
                  </div>

                  {/* progress bar */}
                  <div style={{ position: "absolute", bottom: -8, left: 0, width: "100%", height: 2, background: "#ffffff0a" }}>
                    <div style={{
                      height: "100%",
                      width: isTarget ? `${(typed.length / w.text.length) * 100}%` : "0%",
                      background: "linear-gradient(90deg, #7700ff, #00ccff, #00ffee)",
                      boxShadow: "0 0 6px #00ccff",
                      transition: "width 0.08s",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input bar */}
          <div style={{
            position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 20,
            padding: "16px 24px 24px",
            borderTop: "1px solid #7700ff33",
            background: "rgba(0,0,8,0.95)",
            backdropFilter: "blur(12px)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          }}>
            <div style={{ position: "absolute", top: -1, left: 0, width: "25%", height: 1, background: "linear-gradient(90deg, #7700ff, transparent)" }} />
            <div style={{ position: "absolute", top: -1, right: 0, width: "25%", height: 1, background: "linear-gradient(270deg, #00ccff, transparent)" }} />
            <div style={{ fontSize: 9, letterSpacing: "0.4em", color: "#5533aa", textTransform: "uppercase", fontFamily: "'Exo 2', monospace" }}>
              {difficulty} · type to survive
            </div>
            <input
              ref={inputRef}
              onChange={handleInput}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              style={{
                background: "transparent", border: "none",
                borderBottom: `2px solid ${words.some(w => danger(w.x)) ? "#ff336688" : "#7700ff55"}`,
                color: "#00eeff", fontSize: 28,
                fontFamily: "'Exo 2', 'Orbitron', monospace",
                fontWeight: 900,
                letterSpacing: "0.3em", textAlign: "center", outline: "none",
                width: "100%", maxWidth: 500, padding: "8px 0",
                textShadow: "0 0 15px #00ccff88, 0 0 1px #000",
                caretColor: "#00eeff", transition: "border-color 0.4s",
              }}
              placeholder="▮"
            />
          </div>
        </>
      )}

      {/* DEAD */}
      {gameState === "dead" && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", minHeight: "100vh", gap: 28,
          position: "relative", zIndex: 10,
        }}>
          <h2 style={{
            fontSize: "clamp(40px, 10vw, 90px)", fontWeight: 900, margin: 0,
            color: "transparent", WebkitTextStroke: "2px #ff2266",
            textShadow: "0 0 40px #ff2266, 5px 0 #ff00ff, -5px 0 #ff2266",
            letterSpacing: "0.2em", animation: "glitch 2s infinite",
          }}>YOU HAVE DIED</h2>
          <p style={{ color: "#9050cc", fontSize: 10, letterSpacing: "0.45em", margin: 0 }}>CONNECTION TERMINATED</p>
          <div style={{
            border: "1px solid #7000ff55", padding: "28px 56px",
            textAlign: "center", background: "#7000ff0a", boxShadow: "0 0 40px #7000ff11",
          }}>
            <p style={{ color: "#9060cc", fontSize: 10, letterSpacing: "0.4em", margin: "0 0 10px" }}>FINAL SCORE</p>
            <p style={{ color: "#fff", fontSize: 52, fontWeight: 900, margin: 0, textShadow: "0 0 30px #9000ff" }}>{score}</p>
            {score > 0 && score >= highScore && (
              <p style={{ color: "#00ffff", fontSize: 10, letterSpacing: "0.4em", margin: "10px 0 0", textShadow: "0 0 15px #00ffff" }}>★ NEW HIGH SCORE ★</p>
            )}
            <p style={{ color: "#8050aa", fontSize: 10, letterSpacing: "0.3em", margin: "8px 0 0" }}>BEST: {highScore}</p>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <button onClick={startGame} style={{
              background: "transparent", color: "#00ffff", border: "2px solid #00ffff",
              padding: "14px 44px", fontSize: 12, fontFamily: "inherit", fontWeight: 900,
              letterSpacing: "0.4em", cursor: "pointer", textTransform: "uppercase",
              boxShadow: "0 0 30px #00ffff33", textShadow: "0 0 15px #00ffff",
            }}>RECONNECT</button>
            <button onClick={() => setGameState("idle")} style={{
              background: "transparent", color: "#7000ff66", border: "1px solid #7000ff33",
              padding: "14px 44px", fontSize: 12, fontFamily: "inherit", fontWeight: 900,
              letterSpacing: "0.4em", cursor: "pointer", textTransform: "uppercase",
            }}>JACK OUT</button>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700;900&display=swap');
        @keyframes shoot {
          0% { transform: translateX(-200px) translateY(0) rotate(-15deg); opacity: 0; }
          5% { opacity: 0.6; }
          20% { opacity: 0; }
          100% { transform: translateX(400px) translateY(60px) rotate(-15deg); opacity: 0; }
        }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-12px); }
          40% { transform: translateX(12px); }
          60% { transform: translateX(-8px); }
          80% { transform: translateX(8px); }
        }
        @keyframes glitch {
          0%,88%,100% { text-shadow: 0 0 40px #ff2266, 5px 0 #ff00ff, -5px 0 #ff2266; }
          90% { text-shadow: -8px 0 #00ffff, 8px 0 #ff2266, 0 0 40px #ff2266; }
          93% { text-shadow: 8px 0 #ff00ff, -8px 0 #00ffff, 0 0 40px #ff2266; }
        }
        @keyframes tiedye {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes blob1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(40px,30px) scale(1.1); }
          66% { transform: translate(-20px,50px) scale(0.95); }
        }
        @keyframes blob2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(-50px,20px) scale(1.05); }
          66% { transform: translate(30px,-40px) scale(1.1); }
        }
        @keyframes blob3 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(30px,-30px) scale(0.9); }
          66% { transform: translate(-40px,20px) scale(1.05); }
        }
        @keyframes blob4 {
          0%,100% { transform: translate(0,0) scale(1); }
          50% { transform: translate(-30px,-20px) scale(1.1); }
        }
        @keyframes blob5 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(20px,30px) scale(1.15); }
          66% { transform: translate(-30px,-10px) scale(0.9); }
        }
        @keyframes twinkle {
          0%,100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        input::placeholder { color: #7000ff22; letter-spacing: 0; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
