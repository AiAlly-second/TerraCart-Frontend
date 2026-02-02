import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import blindEyeIcon from "../assets/images/disabled-sign.png";

const langSpeechMap = {
  hi: { recognition: "hi-IN", speech: "hi-IN" },
  mr: { recognition: "hi-IN", speech: "hi-IN" },
  gu: { recognition: "gu-IN", speech: "hi-IN" },
  en: { recognition: "en-IN", speech: "en-IN" },
};

const pageStyle = {
  minHeight: "100vh",
  background: "#f1f5f9", // Slate-100
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "20px",
  paddingTop: "80px", // clearance for header if any, or just spacing
};

const panelStyle = {
  width: "min(720px, 100%)",
  background: "#ffffff",
  borderRadius: "18px",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  display: "flex",
  flexDirection: "column",
  padding: "24px",
  border: "1px solid #e2e8f0",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
};

const transcriptBoxStyle = {
  height: "300px",
  overflowY: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "16px",
  background: "#f8fafc",
  marginBottom: "16px",
};

const controlsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginTop: "16px",
  justifyContent: "center",
};

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "8px 12px",
  borderRadius: "9999px",
  background: "#e0f2fe",
  color: "#0c4a6e",
  fontWeight: 600,
  fontSize: "0.875rem",
  marginBottom: "12px",
};

const buttonClass = (variant = "secondary") => {
  const common =
    "px-6 py-3 rounded-xl font-bold focus:outline-none focus:ring transition transform active:scale-95 shadow-sm";
  switch (variant) {
    case "primary":
      return `${common} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-200`;
    case "danger":
      return `${common} bg-red-500 text-white hover:bg-red-600 focus:ring-red-200`;
    default:
      return `${common} bg-slate-200 text-slate-700 hover:bg-slate-300 focus:ring-slate-200`;
  }
};

const speakMessage = (text, speechLang = "en-IN") => {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = speechLang;
  utter.rate = 0.95;
  utter.pitch = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
};

export default function BlindAssistantPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartRef = useRef(false);

  // Read language and table info
  const language = useMemo(() => localStorage.getItem("language") || "en", []);
  const { recognition: recognitionLang, speech: speechLang } =
    langSpeechMap[language] || langSpeechMap.en;

  const tableInfo = useMemo(() => {
    try {
      const stored =
        localStorage.getItem("terra_selectedTable") ||
        localStorage.getItem("tableSelection");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) return parsed;
      const slug = localStorage.getItem("terra_scanToken");
      return slug ? { qrSlug: slug } : null;
    } catch (e) {
      return null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    restartRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch (err) {
        console.warn("Voice assistant stop error", err);
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  const startRecognition = useCallback(() => {
    if (typeof window === "undefined") return;
    const RecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) {
      setError("Voice recognition is not supported on this device.");
      speakMessage(
        "Voice recognition is not available on this device.",
        speechLang
      );
      return;
    }
    setError("");
    const recognizer = new RecognitionCtor();
    recognizer.lang = recognitionLang;
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 3;
    restartRef.current = true;

    recognizer.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          transcript = result[0].transcript.trim();
        }
      }
      if (transcript) {
        const timestamp = new Date().toLocaleTimeString();
        setEntries((prev) => [
          ...prev,
          { id: Date.now(), text: transcript, timestamp },
        ]);
        speakMessage("Noted.", speechLang);
      }
    };

    recognizer.onerror = (event) => {
      console.error("Voice assistant error", event.error);
      setError(
        event.error === "not-allowed"
          ? "Microphone permission denied. Please allow microphone access."
          : "We couldn't capture your voice. Please try again."
      );
      setListening(false);
    };

    let silenceTimer;
    recognizer.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      setListening(false);
    };

    try {
      recognizer.start();
      setListening(true);
      setError("");
      recognitionRef.current = recognizer;
    } catch (err) {
      console.error("Voice assistant start error", err);
      setError("Unable to start listening. Please try again.");
      setListening(false);
    }
  }, [recognitionLang, speechLang]);

  // Initial greeting and setup on mount
  useEffect(() => {
    speakMessage(
      "Voice assistant activated. Press the start listening button and speak slowly. Your words will appear on the screen for staff to read.",
      speechLang
    );
    // Cleanup on unmount
    return () => {
      stopRecognition();
    };
  }, [speechLang, stopRecognition]);

  // Scroll to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries]);

  const handleClose = () => {
    stopRecognition();
    navigate(-1); // Go back
  };

  const handleCopy = async () => {
    try {
      const text = entries.map((entry) => entry.text).join("\n");
      if (!text) return;
      await navigator.clipboard.writeText(text);
      speakMessage("Copied to clipboard.", speechLang);
      alert("Copied to clipboard.");
    } catch (err) {
      alert("Unable to copy. Please copy manually.");
    }
  };

  const handleClear = () => {
    setEntries([]);
    speakMessage("Cleared notes.", speechLang);
  };

  const handlePauseResume = () => {
    if (listening) {
      stopRecognition();
      speakMessage("Listening paused.", speechLang);
    } else {
      startRecognition();
      speakMessage("Listening resumed.", speechLang);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img 
              src={blindEyeIcon} 
              alt="Blind Support" 
              style={{ width: "32px", height: "32px", objectFit: "contain" }}
            />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Voice Assistant
              </h1>
              <p className="text-sm text-slate-500">
                Blind Support Mode
              </p>
            </div>
          </div>
          <button
            className={buttonClass("danger")}
            onClick={handleClose}
            aria-label="Close voice assistant"
            style={{ padding: "8px 16px", fontSize: "0.9rem" }}
          >
            Close / Exit
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
          <div style={chipStyle}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: listening ? "#22c55e" : "#f97316",
                display: "inline-block",
              }}
            />
            {listening ? "Listening..." : "Paused"}
          </div>
          {tableInfo?.number && (
            <div style={{ ...chipStyle, background: "#ecfeff", color: "#0e7490" }}>
              Table {tableInfo.number}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-100">
            {error}
          </div>
        )}

        <div
          style={transcriptBoxStyle}
          aria-live="polite"
          aria-label="Voice to text transcripts"
        >
          {entries.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-4">
               <p className="mb-2 text-3xl">🎙️</p>
               <p>Tap "Start Listening" and speak.</p>
               <p className="text-sm mt-2">Your voice will be converted to text.</p>
            </div>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="mb-3 rounded-lg bg-white shadow-sm border border-slate-200 p-3 text-slate-800"
            >
              <div className="text-xs text-slate-400 mb-1">
                {entry.timestamp}
              </div>
              <div className="text-lg leading-relaxed">{entry.text}</div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        <div style={controlsStyle}>
          <button
            className={buttonClass("primary")}
            onClick={handlePauseResume}
            style={{ minWidth: "160px" }}
          >
            {listening ? "Pause Listening" : "Start Listening"}
          </button>
          <button
            className={buttonClass()}
            onClick={handleCopy}
            disabled={!entries.length}
          >
            Copy Notes
          </button>
          <button
            className={buttonClass()}
            onClick={handleClear}
            disabled={!entries.length}
          >
            Clear Notes
          </button>
        </div>
      </div>
      
      <p className="text-slate-500 text-sm mt-8 text-center max-w-md">
        This tool converts speech to text to assist with communication.
      </p>
    </div>
  );
}
