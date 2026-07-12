import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, Mic, MicOff, Volume2, VolumeX, Paperclip, FileText, FileSpreadsheet } from 'lucide-react';
import { askMistral, getMistralTTSAudio } from '../services/mistralService';
import { useAuth } from '../context/AuthContext';
import { AppLogo } from './AppLogo';
import { isNativeApp, speakNative, stopSpeechNative } from '../utils/capacitorUtils';
import { showToast } from './ui/Toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  imageUrl?: string;
  jsonFileName?: string;
  downloadInfo?: {
    fileName: string;
    action: string;
    args: any;
  };
}

export const AICopilotChat: React.FC = () => {
  const { isLoggedIn, isOnline } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Bonjour ! Je suis votre assistant IA Echo. Comment puis-je vous aider aujourd\'hui dans la gestion de votre entreprise ? Vous pouvez me parler, m\'envoyer un reçu/facture en photo, ou même glisser-déposer un fichier de sauvegarde JSON pour que je fusionne les données manquantes.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Voice states
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // Vision states
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);

  // Backup states
  const [selectedJsonFile, setSelectedJsonFile] = useState<string | null>(null);
  const [selectedJsonData, setSelectedJsonData] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Clean speech on unmount or close
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (isNativeApp()) {
        stopSpeechNative();
      } else if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'fr-FR';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInput(prev => (prev ? prev + ' ' + transcript : transcript));
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[IA Copilot] Erreur de reconnaissance vocale :', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  if (!isLoggedIn || !isOnline) return null;

  // Clean markdown formatting from AI response text before display
  const cleanMarkdown = (text: string): string =>
    text
      .replace(/\*\*(.+?)\*\*/g, '$1')   // gras → texte nu
      .replace(/\*(.+?)\*/g, '$1')        // italique → texte nu
      .replace(/^#{1,6}\s*/gm, '')        // titres ## → rien
      .replace(/^\s*[-–—]{2,}\s*$/gm, '') // séparateurs --- → rien
      .replace(/\|/g, ' ')                // colonnes de tableaux
      .replace(/`([^`]+)`/g, '$1')        // code inline
      .replace(/^\s*>\s*/gm, '')          // citations blockquote
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // liens markdown [texte](url)
      .replace(/^\s*[\*\-]\s/gm, '• ')   // listes → puces simples
      .replace(/[ \t]+/g, ' ')            // espaces multiples
      .replace(/\n{3,}/g, '\n\n')         // trop de lignes vides → max 2
      .trim();


  // Speak function
  const speak = async (text: string, force: boolean = false) => {
    if (isMuted && !force) return;
    
    const cleanText = text
      .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "") // Emojis
      .replace(/\*\*/g, "") // Gras
      .replace(/\*/g, "")  // Italique
      .replace(/\|/g, " ") // Barres de tableau
      .replace(/#/g, "")   // Titres markdown
      .replace(/^\s*-\s*/gm, "") // Puces de liste
      .replace(/[\n\r]+/g, " ") // Retours à la ligne pour diction fluide
      .replace(/\s+/g, " ") // Espaces multiples
      .trim();

    if (!cleanText) return;

    // Pause and clean any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (isNativeApp()) {
      stopSpeechNative();
    }

    try {
      // 1. Try Mistral Voxtral TTS
      const audioUrl = await getMistralTTSAudio(cleanText);
      const audio = new Audio(audioUrl);
      currentAudioRef.current = audio;
      await audio.play();
    } catch (error: any) {
      console.warn("[IA Copilot] Mistral TTS Marie Voice failed. Falling back to local synthesizer.", error);
      showToast(`Erreur TTS : ${error.message || error}`, 'error');
      
      // 2. Local Fallback (Capacitor / native or Web Speech API)
      if (isNativeApp()) {
        speakNative(cleanText);
        return;
      }

      if (!window.speechSynthesis) return;
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'fr-FR';
      
      const voices = window.speechSynthesis.getVoices();
      const premiumFrenchVoice = 
        voices.find(v => v.lang.startsWith('fr') && v.name.toLowerCase().includes('google')) ||
        voices.find(v => v.lang.startsWith('fr') && v.name.toLowerCase().includes('natural')) ||
        voices.find(v => v.lang.startsWith('fr') && !v.name.toLowerCase().includes('hortense')) ||
        voices.find(v => v.lang.startsWith('fr'));

      if (premiumFrenchVoice) {
        utterance.voice = premiumFrenchVoice;
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleVoiceToggle = () => {
    if (!recognitionRef.current) {
      alert("La reconnaissance vocale n'est pas supportée ou initialisée sur cet appareil.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (isNativeApp()) {
        stopSpeechNative();
      } else if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      // Clear image state
      setSelectedImage(null);
      setImageFileName(null);

      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          (window as any).tempUploadedBackupData = parsed;
          
          // Summarize table counts for LLM prompt context
          const counts: Record<string, number> = {};
          Object.keys(parsed).forEach(key => {
            if (Array.isArray(parsed[key])) {
              counts[key] = parsed[key].length;
            }
          });
          
          setSelectedJsonFile(file.name);
          setSelectedJsonData(counts);
        } catch (err) {
          alert("Fichier JSON de sauvegarde invalide.");
        }
      };
      reader.readAsText(file);
    } else {
      // Clear JSON state
      setSelectedJsonFile(null);
      setSelectedJsonData(null);
      (window as any).tempUploadedBackupData = null;

      setImageFileName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage && !selectedJsonFile) || loading) return;

    let userText = input.trim();
    const currentImg = selectedImage;
    const currentJsonFile = selectedJsonFile;

    // Reset states immediately
    setInput('');
    setSelectedImage(null);
    setImageFileName(null);
    setSelectedJsonFile(null);
    setSelectedJsonData(null);
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // Embed JSON metadata if file was attached
    const historyText = userText;
    if (currentJsonFile && selectedJsonData) {
      userText = (userText || "Importe cette sauvegarde.") + 
        `\n\n[Fichier de sauvegarde JSON "${currentJsonFile}" importé localement en mémoire. Contenu détecté (nombre d'éléments par table) : ${JSON.stringify(selectedJsonData)}]`;
    }

    // Add user message to state
    const newMessages: Message[] = [
      ...messages,
      { 
        role: 'user', 
        content: historyText || (currentJsonFile ? `Sauvegarde ${currentJsonFile}` : "Image envoyée"), 
        timestamp: new Date(),
        imageUrl: currentImg || undefined,
        jsonFileName: currentJsonFile || undefined
      }
    ];
    setMessages(newMessages);
    setLoading(true);

    try {
      const history = newMessages.slice(0, -1).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Send Base64 image payload as 3rd parameter
      const reply = await askMistral(userText, history, currentImg);
      
      let downloadInfo = undefined;
      if (reply.actionTriggered && reply.actionTriggered.name === 'triggerExport') {
        const { reportType, format = 'pdf', year, month } = reply.actionTriggered.args;
        
        let reportLabel = 'Rapport';
        if (reportType === 'attendance') reportLabel = 'Fiche_Presence';
        else if (reportType === 'personnel') reportLabel = 'Liste_Personnel';
        else if (reportType === 'inventory') reportLabel = 'Inventaire_Stock';
        else if (reportType === 'expenses') reportLabel = 'Rapport_Depenses';
        else if (reportType === 'salesHistory') reportLabel = 'Historique_Ventes';
        else if (reportType === 'production') reportLabel = 'Rapport_Production';
        else if (reportType === 'rawMaterials') reportLabel = 'Matieres_Premieres';

        const monthNames = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
        const monthLabel = month !== undefined ? `_${monthNames[month - 1] || month}` : '';
        const yearLabel = year ? `_${year}` : '';

        downloadInfo = {
          fileName: `${reportLabel}${monthLabel}${yearLabel}.${format === 'excel' ? 'xlsx' : 'pdf'}`,
          action: reply.actionTriggered.name,
          args: reply.actionTriggered.args
        };
      } else if (reply.actionTriggered && reply.actionTriggered.name === 'generateCustomReportPDF') {
        const { title } = reply.actionTriggered.args;
        downloadInfo = {
          fileName: `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
          action: reply.actionTriggered.name,
          args: reply.actionTriggered.args
        };
      }

      setMessages(prev => [
        ...prev,
        { 
          role: 'assistant', 
          content: reply.content, 
          timestamp: new Date(),
          downloadInfo: downloadInfo
        }
      ]);
      
      speak(reply.content);
    } catch (err: any) {
      const errorMsg = `⚠️ Une erreur est survenue : ${err.message || 'Impossible de contacter l\'assistant.'}`;
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: errorMsg, timestamp: new Date() }
      ]);
      speak(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
      if (lastAssistantMessage) {
        speak(lastAssistantMessage.content);
      }
    } else {
      setIsMuted(true);
      if (isNativeApp()) {
        stopSpeechNative();
      } else if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (isNativeApp()) {
      stopSpeechNative();
    } else if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  };

  return (
    <div className="fixed bottom-20 right-6 lg:bottom-6 z-50 font-sans">
      {/* Floating Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="w-14 h-14 bg-brand hover:scale-105 active:scale-95 text-white rounded-full flex items-center justify-center shadow-lg shadow-brand/25 transition-all duration-200 group relative border border-white/10 overflow-hidden"
        >
          <AppLogo size={56} className="bg-transparent shadow-none border-none p-2" fallback={
            <Bot className="w-7 h-7 group-hover:rotate-12 transition-transform duration-300" />
          } />
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-brand"></span>
          </span>
        </button>
      )}

      {/* Chat Window Panel */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[550px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fade-scale">
          {/* Header */}
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
          <AppLogo size={40} fallback={
            <div className="w-10 h-10 bg-brand rounded-full flex items-center justify-center text-white shadow-sm">
              <Sparkles className="w-5 h-5" />
            </div>
          } />
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">Copilote IA</h3>
                <span className="text-3xs text-emerald-500 dark:text-emerald-400 flex items-center gap-1 font-semibold">
                  <span className="w-1.5 h-1.5 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-ping"></span>
                  {isListening ? 'Écoute vocale active' : 'Copilote connecté'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={toggleMute}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title={isMuted ? "Réactiver le son" : "Couper le son"}
              >
                {isMuted ? <VolumeX className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5 text-brand" />}
              </button>
              
              <button
                onClick={handleClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-slate-900/35 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
            {messages.map((msg, index) => {
              const isAssistant = msg.role === 'assistant';
              return (
                <div
                  key={index}
                  className={`flex gap-3 max-w-[85%] ${
                    isAssistant ? 'mr-auto' : 'ml-auto flex-row-reverse'
                  }`}
                >
                  {isAssistant && (
                    <AppLogo size={32} fallback={
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center border border-slate-200 dark:border-slate-700 flex-shrink-0">
                        <Bot className="w-4 h-4 text-slate-500" />
                      </div>
                    } />
                  )}
                  <div
                    className={`p-3 rounded-2xl text-sm ${
                      isAssistant
                        ? 'bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800/80 shadow-sm'
                        : 'bg-brand text-white shadow-md shadow-brand/10'
                    }`}
                  >
                    {/* User-sent image preview inside chat history */}
                    {msg.imageUrl && (
                      <div className="mb-2 max-w-[200px] overflow-hidden rounded-lg border dark:border-slate-800 shadow-sm">
                        <img src={msg.imageUrl} alt="Attachement" className="w-full h-auto object-contain max-h-[140px]" />
                      </div>
                    )}

                    {/* User-sent JSON file card preview */}
                    {msg.jsonFileName && (
                      <div className="mb-2 flex items-center gap-2.5 p-2 rounded-xl bg-white/10 border border-white/20 text-white">
                        <FileText className="w-4.5 h-4.5 flex-shrink-0" />
                        <span className="text-xs font-semibold truncate max-w-[180px]">
                          {msg.jsonFileName}
                        </span>
                      </div>
                    )}
                    
                    <p className="leading-relaxed whitespace-pre-wrap">{isAssistant ? cleanMarkdown(msg.content) : msg.content}</p>

                    {/* Interactive download card for generated PDFs or Excel sheets */}
                    {msg.downloadInfo && (
                      <button
                        type="button"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('ai-action', {
                            detail: {
                              action: msg.downloadInfo!.action,
                              args: msg.downloadInfo!.args
                            }
                          }));
                        }}
                        className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all text-left w-full shadow-sm group"
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          msg.downloadInfo.fileName.endsWith('xlsx') 
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}>
                          {msg.downloadInfo.fileName.endsWith('xlsx') ? (
                            <FileSpreadsheet className="w-5 h-5" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate font-semibold text-xs text-slate-700 dark:text-slate-200 group-hover:text-brand dark:group-hover:text-brand transition-colors">
                            {msg.downloadInfo.fileName}
                          </p>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                            Télécharger le fichier
                          </span>
                        </div>
                      </button>
                    )}
                    
                    <div className="flex items-center justify-between mt-1.5 gap-4">
                      {isAssistant ? (
                        <button
                          type="button"
                          onClick={() => speak(msg.content, true)}
                          className="text-slate-400 hover:text-brand dark:hover:text-brand transition-colors p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                          title="Réécouter ce message"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <div />
                      )}
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Thinking Indicator */}
            {loading && (
              <div className="flex gap-3 max-w-[85%] mr-auto items-center">
                <AppLogo size={32} fallback={
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-850 flex items-center justify-center border border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <Bot className="w-4 h-4 text-slate-500" />
                  </div>
                } />
                <div className="bg-white dark:bg-slate-950 p-3 rounded-2xl text-sm text-slate-400 border border-slate-200 dark:border-slate-800/80 shadow-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                  <span className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Selected Image Preview Bar */}
          {selectedImage && (
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 animate-fade-scale">
              <div className="flex items-center gap-2.5 min-w-0">
                <img src={selectedImage} alt="Preview" className="w-9 h-9 object-cover rounded-lg border dark:border-slate-800 flex-shrink-0" />
                <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px] font-semibold">
                  {imageFileName || 'Image en attente...'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedImage(null); setImageFileName(null); }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                title="Supprimer la sélection"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          )}

          {/* Selected JSON file preview bar */}
          {selectedJsonFile && (
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 animate-fade-scale">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-250 truncate">
                    {selectedJsonFile}
                  </p>
                  <span className="text-[9px] text-slate-450 dark:text-slate-500 font-bold uppercase tracking-wider block">
                    Sauvegarde JSON en attente...
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedJsonFile(null);
                  setSelectedJsonData(null);
                  (window as any).tempUploadedBackupData = null;
                }}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                title="Supprimer le fichier"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          )}

          {/* Form Input */}
          <form onSubmit={handleSend} className="p-3 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex gap-2 items-center">
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,.json"
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-xl transition-all"
              title="Ajouter une image ou sauvegarde JSON"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>

            <button
              type="button"
              onClick={handleVoiceToggle}
              className={`p-2.5 rounded-xl border transition-all ${
                isListening 
                  ? 'bg-red-500/10 border-red-500 text-red-500 animate-pulse scale-105' 
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
              }`}
              title={isListening ? "Arrêter d'écouter" : "Parler"}
            >
              {isListening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={isListening ? "Écoute en cours..." : "Posez une question..."}
              className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand placeholder-slate-400 dark:placeholder-slate-500"
            />
            
            <button
              type="submit"
              disabled={(!input.trim() && !selectedImage && !selectedJsonFile) || loading}
              className="p-2.5 bg-brand text-white rounded-xl hover:scale-105 active:scale-95 disabled:scale-100 disabled:opacity-50 transition-all shadow-sm"
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
