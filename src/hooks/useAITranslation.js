import { useState, useEffect } from "react";
import { translateText } from "../utils/aiTranslate";

export const useAITranslation = (text) => {
  const [translated, setTranslated] = useState(text);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const lang = localStorage.getItem("language") || "en";

    if (lang === "en") {
      setTranslated(text);
      setLoading(false);
    } else {
      setLoading(true);
      translateText(text, lang)
        .then((translatedText) => {
          setTranslated(translatedText);
          setLoading(false);
        })
        .catch((err) => {
          // Gracefully handle errors - fallback to original text
          // Completely silent - no logging to avoid console noise
          // Feature is kept for future AI development but won't interfere
          setTranslated(text);
          setLoading(false);
        });
    }
  }, [text]);

  return [translated, loading];
};
