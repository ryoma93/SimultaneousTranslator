import { useState, useRef, useCallback, useEffect } from 'react';
// FIX: The 'LiveSession' type is not exported from '@google/genai'.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from "@google/genai";
import { encode, decode, decodeAudioData } from '../utils/audioUtils';
import { Status, TranscriptionLog, Language } from '../types';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

// FIX: Instantiate GoogleGenAI client once at the module level for performance and to infer session type.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

// FIX: Infer LiveSession type from the connect method's return type as it is not exported.
type LiveSession = Awaited<ReturnType<typeof ai.live.connect>>;

const detectLanguageCode = (text: string): 'ja' | 'zh' | 'en' => {
    // Hiragana and Katakana for Japanese
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
        return 'ja';
    }
    // CJK Unified Ideographs for Chinese
    if (/[\u4E00-\u9FAF]/.test(text)) {
        return 'zh';
    }
    return 'en';
};


export function useSimultaneousTranslator(lang1: Language, lang2: Language) {
    const [status, setStatus] = useState<Status>(Status.IDLE);
    const [transcriptionLog, setTranscriptionLog] = useState<TranscriptionLog[]>([]);
    const [currentText1, setCurrentText1] = useState('');
    const [currentText2, setCurrentText2] = useState('');

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    
    const nextAudioStartTimeRef = useRef(0);
    const audioPlaybackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    
    const currentInputTextRef = useRef('');
    const currentOutputTextRef = useRef('');
    
    const onMessage = useCallback(async (message: LiveServerMessage) => {
        if (message.serverContent?.inputTranscription) {
            currentInputTextRef.current += message.serverContent.inputTranscription.text;
        }
        if (message.serverContent?.outputTranscription) {
            currentOutputTextRef.current += message.serverContent.outputTranscription.text;
        }

        const inputLangCode = detectLanguageCode(currentInputTextRef.current);
        if (lang1.code.startsWith(inputLangCode)) {
            setCurrentText1(currentInputTextRef.current);
            setCurrentText2(currentOutputTextRef.current);
        } else {
            setCurrentText1(currentOutputTextRef.current);
            setCurrentText2(currentInputTextRef.current);
        }

        if (message.serverContent?.turnComplete) {
            const finalInput = currentInputTextRef.current.trim();
            const finalOutput = currentOutputTextRef.current.trim();

            if (finalInput && finalOutput) {
                 const finalInputLangCode = detectLanguageCode(finalInput);
                 
                 let finalLang1Text = '';
                 let finalLang2Text = '';

                 if (lang1.code.startsWith(finalInputLangCode)) {
                    finalLang1Text = finalInput;
                    finalLang2Text = finalOutput;
                 } else {
                    finalLang1Text = finalOutput;
                    finalLang2Text = finalInput;
                 }
                
                setTranscriptionLog(prev => [
                    ...prev,
                    {
                        id: Date.now(),
                        lang1Text: finalLang1Text,
                        lang2Text: finalLang2Text,
                    }
                ]);
            }
            
            currentInputTextRef.current = '';
            currentOutputTextRef.current = '';
            setCurrentText1('');
            setCurrentText2('');
        }

        const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
        if (audioData && outputAudioContextRef.current) {
            const outputContext = outputAudioContextRef.current;
            nextAudioStartTimeRef.current = Math.max(nextAudioStartTimeRef.current, outputContext.currentTime);

            const decodedBytes = decode(audioData);
            const audioBuffer = await decodeAudioData(decodedBytes, outputContext, OUTPUT_SAMPLE_RATE, 1);

            const source = outputContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputContext.destination);
            
            source.addEventListener('ended', () => {
                audioPlaybackSourcesRef.current.delete(source);
            });

            source.start(nextAudioStartTimeRef.current);
            nextAudioStartTimeRef.current += audioBuffer.duration;
            audioPlaybackSourcesRef.current.add(source);
        }
        
        if (message.serverContent?.interrupted) {
            for (const source of audioPlaybackSourcesRef.current.values()) {
                source.stop();
                audioPlaybackSourcesRef.current.delete(source);
            }
            nextAudioStartTimeRef.current = 0;
        }

    }, [lang1, lang2]);
    
    const stopSession = useCallback(() => {
        console.log("Stopping session...");
        setStatus(Status.STOPPED);
        sessionPromiseRef.current?.then(session => session.close());
        sessionPromiseRef.current = null;
        
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        
        scriptProcessorRef.current?.disconnect();
        mediaStreamSourceRef.current?.disconnect();
        
        inputAudioContextRef.current?.close().catch(console.error);
        outputAudioContextRef.current?.close().catch(console.error);

        inputAudioContextRef.current = null;
        outputAudioContextRef.current = null;
        scriptProcessorRef.current = null;
        mediaStreamSourceRef.current = null;
        
        currentInputTextRef.current = '';
        currentOutputTextRef.current = '';
        setCurrentText1('');
        setCurrentText2('');

    }, []);

    const startSession = useCallback(async () => {
        setStatus(Status.CONNECTING);
        setTranscriptionLog([]);
        
        const systemInstruction = `You are a world-class, real-time simultaneous interpreter. You will receive audio in either ${lang1.name} or ${lang2.name}. Your task is to immediately translate the input into the other language and speak the translation. If you hear ${lang1.name}, translate it to ${lang2.name}. If you hear ${lang2.name}, translate it to ${lang1.name}. Do not add any extra commentary, greetings, or explanations. Do not wait for the user to finish speaking. Translate as they speak. Provide only the direct, spoken translation. For Chinese, use the appropriate dialect for the provided language code (zh-CN for Simplified/Mandarin, zh-TW for Traditional/Mandarin).`;

        try {
            // FIX: Cast window to `any` to support `webkitAudioContext` for older browsers.
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
            // FIX: Cast window to `any` to support `webkitAudioContext` for older browsers.
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });

            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        console.log("Session opened.");
                        if (!inputAudioContextRef.current || !streamRef.current) return;
                        
                        mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
                        scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
                        
                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromiseRef.current?.then(session => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        
                        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                        setStatus(Status.LISTENING);
                    },
                    onmessage: onMessage,
                    onerror: (e: ErrorEvent) => {
                        console.error('Session error:', e);
                        setStatus(Status.ERROR);
                        stopSession();
                    },
                    onclose: (e: CloseEvent) => {
                        console.log('Session closed.');
                        // If status is not already error or stopped, it was an unexpected close.
                        if (status !== Status.ERROR && status !== Status.STOPPED) {
                             stopSession();
                        }
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    systemInstruction: systemInstruction,
                },
            });
            await sessionPromiseRef.current;
        } catch (error) {
            console.error("Failed to start session:", error);
            setStatus(Status.ERROR);
            stopSession();
        }
    }, [lang1, lang2, onMessage, stopSession]);

    useEffect(() => {
        return () => {
            stopSession();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { 
        startSession, 
        stopSession, 
        status, 
        transcriptionLog,
        currentText1,
        currentText2
    };
}