import axios from "axios";

const flaskApi = (import.meta.env.VITE_FLASK_API_URL || "http://localhost:5050").replace(/\/$/, "");

export const translateText = async (text, targetLang) => {
  try {
    const res = await axios.post(`${flaskApi}/api/translate`, {
      text,
      targetLang,
    });

    const raw = res.data.translatedText;

    // ✅ Extract just the translated word using regex
    const match = raw.match(/as\s+"(.*?)"/);
    const cleanTranslation = match?.[1] || raw || text;

    return cleanTranslation;
  } catch (err) {
    console.error("Translation error:", err);
    return text;
  }
};
