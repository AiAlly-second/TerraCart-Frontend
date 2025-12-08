// utils/useVoiceAssistant.js
import { useRef } from "react";

export default function useVoiceAssistant() {
  const recognitionRef = useRef(null);
  const isInitialized = useRef(false);

  // 🌍 Enhanced language config with better Gujarati support
  const languageConfig = {
    en: { 
      speechLang: 'en-US', 
      recognitionLang: 'en-IN',
      voiceSearch: 'en'
    },
    hi: { 
      speechLang: 'hi-IN', 
      recognitionLang: 'hi-IN',
      voiceSearch: 'hi'
    },
    mr: { 
      speechLang: 'hi-IN', 
      recognitionLang: 'hi-IN',
      voiceSearch: 'hi'
    },
    gu: { 
      speechLang: 'hi-IN', 
      recognitionLang: 'gu-IN',
      voiceSearch: 'hi'
    }
  };

  // 🔧 Initialize speech synthesis
  const initializeSpeech = () => {
    if (!isInitialized.current) {
      console.log("🚀 Initializing speech synthesis...");
      const silentUtterance = new SpeechSynthesisUtterance("");
      silentUtterance.volume = 0;
      window.speechSynthesis.speak(silentUtterance);
      isInitialized.current = true;
    }
  };

  // ✅ ENHANCED: Voice selection with preference for female voices
  const selectBestVoice = (language) => {
    const voices = window.speechSynthesis.getVoices();
    const config = languageConfig[language] || languageConfig.en;
    
    console.log(`🔍 Selecting voice for language: ${language}`);

    // ✅ FIX: Prefer female voices for English
    if (language === 'en') {
      // Strategy 1: Look for female English voices
      let femaleVoice = voices.find(voice => 
        voice.lang.startsWith('en') && 
        voice.localService && 
        (voice.name.toLowerCase().includes('female') || 
         voice.name.toLowerCase().includes('zira') ||
         voice.name.toLowerCase().includes('susan') ||
         voice.name.toLowerCase().includes('samantha') ||
         voice.name.toLowerCase().includes('karen') ||
         voice.name.toLowerCase().includes('moira'))
      );

      if (femaleVoice) {
        console.log(`✅ Found female English voice: ${femaleVoice.name} (${femaleVoice.lang})`);
        return femaleVoice;
      }

      // Strategy 2: Look for any local English voice (might be female by default)
      femaleVoice = voices.find(voice => 
        voice.lang.startsWith('en') && voice.localService
      );

      if (femaleVoice) {
        console.log(`✅ Found local English voice: ${femaleVoice.name} (${femaleVoice.lang})`);
        return femaleVoice;
      }

      // Strategy 3: Look for any English voice
      femaleVoice = voices.find(voice => voice.lang.startsWith('en'));

      if (femaleVoice) {
        console.log(`✅ Found English voice: ${femaleVoice.name} (${femaleVoice.lang})`);
        return femaleVoice;
      }
    }

    // For other languages, use existing logic
    let selectedVoice = voices.find(voice => 
      voice.lang === config.speechLang && voice.localService
    );
    
    if (selectedVoice) {
      console.log(`✅ Found exact local voice: ${selectedVoice.name} (${selectedVoice.lang})`);
      return selectedVoice;
    }

    selectedVoice = voices.find(voice => 
      voice.lang.startsWith(config.voiceSearch) && voice.localService
    );
    
    if (selectedVoice) {
      console.log(`✅ Found language family local voice: ${selectedVoice.name} (${selectedVoice.lang})`);
      return selectedVoice;
    }

    selectedVoice = voices.find(voice => 
      voice.lang.startsWith(config.voiceSearch)
    );
    
    if (selectedVoice) {
      console.log(`✅ Found online voice: ${selectedVoice.name} (${selectedVoice.lang})`);
      return selectedVoice;
    }

    selectedVoice = voices[0];
    console.log(`⚠️ Using fallback voice: ${selectedVoice?.name} (${selectedVoice?.lang})`);
    return selectedVoice;
  };

  // 🔤 Enhanced multilingual keyword matching
  const getKeywordMappings = () => {
    return {
      restaurant: [
        'dine', 'dining', 'restaurant', 'eat', 'inside',
        'रेस्टोरेंट', 'खाना', 'भोजन', 'अंदर', 'जेवण', 'खाणे',
        'रेस्टॉरंट', 'जेवण', 'खाणे', 'भोजन', 'आत',
        'રેસ્ટોરન્ટ', 'જમવું', 'ખાવું', 'ભોજન', 'રેસ્ટો', 'અંદર', 'ખાવા', 'જમવા'
      ],
      takeaway: [
        'takeaway', 'take away', 'parcel', 'pickup', 'home', 'pack', 'outside',
        'पैकेट', 'टेकअवे', 'पार्सल', 'घर', 'बाहर', 'पैक',
        'पॅकेट', 'पार्सल', 'घर', 'बाहेर', 'पॅक',
        'પેકેટ', 'પાર્સલ', 'ઘર', 'બહાર', 'પેક', 'લેવા', 'લેવાનું', 'લઈ'
      ]
    };
  };

  // 🔍 Smart command matching function
  const smartCommandMatching = (transcripts, commands, language) => {
    console.log(`🔍 Smart matching for language: ${language}`);
    console.log(`📝 Transcripts to match:`, transcripts);
    console.log(`🎯 Available commands:`, Object.keys(commands));

    const keywords = getKeywordMappings();

    for (const transcript of transcripts) {
      console.log(`🔍 Processing transcript: "${transcript}"`);

      // Check for restaurant keywords
      const hasRestaurantKeyword = keywords.restaurant.some(keyword => {
        const match = transcript.includes(keyword.toLowerCase()) || 
                     keyword.toLowerCase().includes(transcript) ||
                     transcript.includes(keyword) || 
                     keyword.includes(transcript);
        if (match) {
          console.log(`✅ Found restaurant keyword: "${keyword}" in "${transcript}"`);
        }
        return match;
      });

      // Check for takeaway keywords
      const hasTakeawayKeyword = keywords.takeaway.some(keyword => {
        const match = transcript.includes(keyword.toLowerCase()) || 
                     keyword.toLowerCase().includes(transcript) ||
                     transcript.includes(keyword) || 
                     keyword.includes(transcript);
        if (match) {
          console.log(`✅ Found takeaway keyword: "${keyword}" in "${transcript}"`);
        }
        return match;
      });

      if (hasRestaurantKeyword) {
        for (const [key, action] of Object.entries(commands)) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes('dine') || keyLower.includes('restaurant') || 
              keyLower.includes('રેસ્ટોરન્ટ') || keyLower.includes('रेस्टोरेंट') ||
              keyLower.includes('જમવું') || keyLower.includes('ખાવું')) {
            console.log(`🎉 RESTAURANT MATCH: Command "${key}" matched for transcript "${transcript}"`);
            return { matched: true, key, action, reason: 'restaurant keyword' };
          }
        }
      }

      if (hasTakeawayKeyword) {
        for (const [key, action] of Object.entries(commands)) {
          const keyLower = key.toLowerCase();
          if (keyLower.includes('take') || keyLower.includes('parcel') || 
              keyLower.includes('પેકેટ') || keyLower.includes('पैकेट') ||
              keyLower.includes('પાર્સલ') || keyLower.includes('લેવા')) {
            console.log(`🎉 TAKEAWAY MATCH: Command "${key}" matched for transcript "${transcript}"`);
            return { matched: true, key, action, reason: 'takeaway keyword' };
          }
        }
      }

      // Fallback: Original exact matching
      for (const [key, action] of Object.entries(commands)) {
        if (transcript.includes(key.toLowerCase()) || key.toLowerCase().includes(transcript)) {
          console.log(`🎉 EXACT MATCH: Command "${key}" matched for transcript "${transcript}"`);
          return { matched: true, key, action, reason: 'exact match' };
        }
      }
    }

    return { matched: false };
  };

  // ✅ FIXED: Separate functions for initial instructions and confirmations
  const readAloudWithPrompt = (texts, onComplete, language = 'en') => {
    console.log("🔊 readAloudWithPrompt called with texts:", texts, "language:", language);
    
    if (!window.speechSynthesis) {
      console.error("❌ Speech Synthesis not supported");
      if (onComplete) onComplete();
      return;
    }

    initializeSpeech();
    window.speechSynthesis.cancel();

    const choicePrompts = {
      en: "Now please say your choice",
      hi: "अब कृपया अपना विकल्प बोलें",
      mr: "आता कृपया तुमचा पर्याय म्हणा",
      gu: "હવે કૃપા કરીને તમારો વિકલ્પ કહો"
    };

    const allTexts = [...texts, choicePrompts[language] || choicePrompts.en];

    setTimeout(() => {
      const config = languageConfig[language] || languageConfig.en;
      let currentIndex = 0;

      const speakNext = () => {
        if (currentIndex >= allTexts.length) {
          console.log("✅ All texts completed including choice prompt");
          if (onComplete) {
            setTimeout(onComplete, 100);
          }
          return;
        }

        const text = allTexts[currentIndex];
        console.log(`🔊 Speaking text ${currentIndex + 1}/${allTexts.length}: "${text}"`);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = 1;
        utterance.rate = (language === 'mr' || language === 'gu') ? 0.8 : 0.9;
        utterance.pitch = 1;
        utterance.lang = config.speechLang;

        const selectedVoice = selectBestVoice(language);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        utterance.onstart = () => {
          console.log(`✅ Started speaking: "${text}" in ${language}`);
        };

        utterance.onend = () => {
          console.log(`✅ Finished speaking: "${text}"`);
          currentIndex++;
          setTimeout(speakNext, 200);
        };

        utterance.onerror = (error) => {
          console.error(`❌ Speech error for "${text}":`, error);
          currentIndex++;
          setTimeout(speakNext, 100);
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.error("❌ Failed to speak:", error);
          currentIndex++;
          setTimeout(speakNext, 100);
        }
      };

      speakNext();
    }, 100);
  };

  // ✅ FIXED: Simple readAloud function WITHOUT the choice prompt (for confirmations)
  const readAloud = (texts, onComplete, language = 'en') => {
    console.log("🔊 readAloud (simple) called with texts:", texts, "language:", language);
    
    if (!window.speechSynthesis) {
      console.error("❌ Speech Synthesis not supported");
      if (onComplete) onComplete();
      return;
    }

    initializeSpeech();
    window.speechSynthesis.cancel();

    setTimeout(() => {
      const config = languageConfig[language] || languageConfig.en;
      let currentIndex = 0;

      const speakNext = () => {
        if (currentIndex >= texts.length) {
          console.log("✅ Simple speech completed");
          if (onComplete) {
            setTimeout(onComplete, 100);
          }
          return;
        }

        const text = texts[currentIndex];
        console.log(`🔊 Speaking simple text ${currentIndex + 1}/${texts.length}: "${text}"`);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.volume = 1;
        utterance.rate = (language === 'mr' || language === 'gu') ? 0.8 : 0.9;
        utterance.pitch = 1;
        utterance.lang = config.speechLang;

        const selectedVoice = selectBestVoice(language);
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        utterance.onstart = () => {
          console.log(`✅ Started speaking simple: "${text}" in ${language}`);
        };

        utterance.onend = () => {
          console.log(`✅ Finished speaking simple: "${text}"`);
          currentIndex++;
          setTimeout(speakNext, 800); // Shorter delay for confirmations
        };

        utterance.onerror = (error) => {
          console.error(`❌ Speech error for "${text}":`, error);
          currentIndex++;
          setTimeout(speakNext, 500);
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch (error) {
          console.error("❌ Failed to speak:", error);
          currentIndex++;
          setTimeout(speakNext, 500);
        }
      };

      speakNext();
    }, 100);
  };

  // 🎤 Enhanced listening with better Gujarati support
  const startListening = (commands = {}, language = 'en') => {
    if (!("webkitSpeechRecognition" in window)) {
      console.error("Speech Recognition not supported");
      return;
    }

    const config = languageConfig[language] || languageConfig.en;
    console.log(`🎤 Starting recognition for language: ${language}`);

    if (!recognitionRef.current) {
      const recognition = new window.webkitSpeechRecognition();
      
      if (language === 'gu') {
        recognition.lang = 'gu-IN';
        console.log("🇬🇺 Using Gujarati recognition (gu-IN)");
      } else {
        recognition.lang = config.recognitionLang;
      }
      
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;

      recognition.onresult = (event) => {
        const results = [];
        for (let i = 0; i < event.results[0].length; i++) {
          results.push(event.results[0][i].transcript.toLowerCase().trim());
        }
        
        console.log("🎯 Voice recognition results:", results);

        const matchResult = smartCommandMatching(results, commands, language);
        
        if (matchResult.matched) {
          console.log(`🎉 SUCCESS: Matched "${matchResult.key}" via ${matchResult.reason}`);
          
          if (typeof matchResult.action === "function") {
            const confirmations = {
              en: `${matchResult.key} selected`,
              hi: `${matchResult.key} चुना गया`,
              mr: `${matchResult.key} निवडले`,
              gu: `${matchResult.key} પસંદ કર્યું`
            };

            const confirmationText = confirmations[language] || matchResult.key;
            
            // ✅ FIXED: Use simple readAloud for confirmations (no choice prompt)
            readAloud([confirmationText], () => {
              matchResult.action();
            }, language);
          }
        } else {
          console.log("❌ No match found for any transcript:", results);
          
          const retryMessages = {
            en: ["I didn't understand. Please try again."],
            hi: ["समझ नहीं आया। कृपया दोबारा कहें।"],
            mr: ["समजले नाही. कृपया पुन्हा म्हणा."],
            gu: ["સમજાયું નહીં. કૃપા કરીને ફરીથી કહો."]
          };

          const message = retryMessages[language] || retryMessages.en;
          
          // ✅ FIXED: Use simple readAloud for retry messages (no choice prompt)
          readAloud(message, () => {
            setTimeout(() => {
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.start();
                } catch (error) {
                  console.error("Failed to restart recognition:", error);
                }
              }
            }, 1000);
          }, language);
        }
      };

      recognition.onerror = (event) => {
        console.error("❌ Recognition error:", event.error);
        
        if (language === 'gu' && recognition.lang === 'gu-IN') {
          console.log("🔄 Gujarati recognition failed, falling back to Hindi");
          recognition.lang = 'hi-IN';
          setTimeout(() => {
            try {
              recognition.start();
            } catch (error) {
              console.error("Fallback recognition failed:", error);
            }
          }, 500);
          return;
        }

        const errorMessages = {
          en: "Voice recognition failed. Please try again.",
          hi: "आवाज़ की पहचान नहीं हुई। कृपया दोबारा कोशिश करें।",
          mr: "आवाज ओळखता आली नाही. कृपया पुन्हा प्रयत्न करा.",
          gu: "અવાજ ઓળખી શકાયો નથી. કૃપા કરીને ફરી પ્રયાસ કરો."
        };

        const errorMessage = errorMessages[language] || errorMessages.en;
        readAloud([errorMessage], null, language);
      };

      recognition.onend = () => {
        console.log("🔚 Voice recognition ended");
      };

      recognitionRef.current = recognition;
    } else {
      if (language === 'gu') {
        recognitionRef.current.lang = 'gu-IN';
      } else {
        recognitionRef.current.lang = config.recognitionLang;
      }
    }

    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error("❌ Failed to start recognition:", error);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // ✅ FIXED: Export both functions
  return { readAloud: readAloudWithPrompt, readAloudSimple: readAloud, startListening, stopListening };
}
