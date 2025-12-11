import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import blindEyeIcon from "../assets/images/disabled-sign.png";

const langSpeechMap = {
  hi: { recognition: "hi-IN", speech: "hi-IN" },
  mr: { recognition: "hi-IN", speech: "hi-IN" },
  gu: { recognition: "gu-IN", speech: "hi-IN" },
  en: { recognition: "en-IN", speech: "en-IN" },
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.70)",
  backdropFilter: "blur(6px)",
  zIndex: 11000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "16px",
};

const panelStyle = {
  width: "min(720px, 100%)",
  maxHeight: "90vh",
  background: "#ffffff",
  borderRadius: "18px",
  boxShadow: "0 24px 48px rgba(15, 23, 42, 0.2)",
  display: "flex",
  flexDirection: "column",
  padding: "24px",
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "16px",
};

const transcriptBoxStyle = {
  flex: 1,
  overflowY: "auto",
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  padding: "16px",
  background: "#f8fafc",
};

const controlsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "12px",
  marginTop: "16px",
};

const chipStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 16px",
  borderRadius: "9999px",
  background: "#e0f2fe",
  color: "#0c4a6e",
  fontWeight: 600,
  marginBottom: "12px",
};

const buttonClass = (variant = "secondary") => {
  const common =
    "px-4 py-2 rounded-lg font-semibold focus:outline-none focus:ring transition text-sm";
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

const BlindVoiceAssistant = ({ open, onClose }) => {
  const [entries, setEntries] = useState([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const transcriptEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const restartRef = useRef(false);

  const language = useMemo(() => localStorage.getItem("language") || "en", []);
  const { recognition: recognitionLang, speech: speechLang } =
    langSpeechMap[language] || langSpeechMap.en;

  // Get table info from localStorage to show in the assistance panel
  const tableInfo = useMemo(() => {
    try {
      const stored =
        localStorage.getItem("terra_selectedTable") ||
        localStorage.getItem("tableSelection");
      const parsed = stored ? JSON.parse(stored) : null;
      if (parsed) return parsed;
      // Fallback: use scan token only for display
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
    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        stopRecognition();
        setError("Listening stopped because no speech was detected.");
        speakMessage("Stopping listening because I did not hear anything.", speechLang);
      }, 5000);
    };

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

  useEffect(() => {
    if (open) {
      speakMessage(
        "Voice assistant activated. Press the start listening button and speak slowly. Your words will appear on the screen for staff to read.",
        speechLang
      );
      setEntries([]);
      setError("");
      setListening(false);
      stopRecognition();
    } else {
      stopRecognition();
      setEntries([]);
      setError("");
    }
    return () => {
      stopRecognition();
    };
  }, [open, speechLang, stopRecognition]);

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries]);

  const handleClose = () => {
    stopRecognition();
    setEntries([]);
    setError("");
    onClose?.();
  };

  const handleCopy = async () => {
    try {
      const text = entries.map((entry) => entry.text).join("\n");
      if (!text) return;
      await navigator.clipboard.writeText(text);
      speakMessage("Copied to clipboard.", speechLang);
      alert("Copied to clipboard so staff can read your notes.");
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

  if (!open) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={panelStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <img 
              src={blindEyeIcon} 
              alt="Blind Support" 
              style={{ width: "24px", height: "24px", objectFit: "contain" }}
            />
            <div>
              <h2 className="text-xl font-bold text-slate-900">
                Voice Assistant (Blind Support)
              </h2>
              <p className="text-sm text-slate-500">
                Speak clearly. We convert your voice to text, so staff can see
                your request.
              </p>
            </div>
          </div>
          <button
            className={buttonClass("danger")}
            onClick={handleClose}
            aria-label="Close voice assistant"
          >
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
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
          {!tableInfo?.number && tableInfo?.qrSlug && (
            <div style={{ ...chipStyle, background: "#ecfeff", color: "#0e7490" }}>
              Table QR: {tableInfo.qrSlug}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-md bg-red-50 text-red-600 text-sm">
            {error}
          </div>
        )}

        <div
          style={transcriptBoxStyle}
          aria-live="polite"
          aria-label="Voice to text transcripts"
        >
          {entries.length === 0 && (
            <p className="text-sm text-slate-500">
              Tap “Start listening” below, then speak. We will convert your
              voice into text and show it here.
            </p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="mb-3 rounded-lg bg-white shadow-sm border border-slate-200 p-3 text-slate-800"
            >
              <div className="text-xs text-slate-400 mb-1">
                {entry.timestamp}
              </div>
              <div className="text-sm leading-relaxed">{entry.text}</div>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        <div style={controlsStyle}>
          <button
            className={buttonClass("primary")}
            onClick={handlePauseResume}
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
    </div>
  );
};

export default BlindVoiceAssistant;


