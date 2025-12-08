import { useState, useEffect } from "react";
import { translateText } from "../utils/aiTranslate";

export const useAITranslation = (text) => {
  const [translated, setTranslated] = useState(text);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const lang = localStorage.getItem("language") || "en";

    if (lang === "en") {
      setTranslated(text);
    } else {
      setLoading(true);
      translateText(text, lang).then((translatedText) => {
        setTranslated(translatedText);
        setLoading(false);
      });
    }
  }, [text]);

  return [translated, loading];
};
