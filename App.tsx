import React, { useState } from 'react';
import { useSimultaneousTranslator } from './hooks/useSimultaneousTranslator';
import { Status, Language } from './types';
import { Mic, MicOff, AlertTriangle } from 'lucide-react';

const supportedLanguages: Language[] = [
    { code: 'ja', name: '日本語' },
    { code: 'en', name: 'English' },
    { code: 'zh-CN', name: 'Chinese (Simplified)' },
    { code: 'zh-TW', name: 'Chinese (Traditional)' },
];


const StatusIndicator: React.FC<{ status: Status }> = ({ status }) => {
    let statusText = 'Ready to translate';
    let textColor = 'text-gray-400';

    switch (status) {
        case Status.CONNECTING:
            statusText = 'Connecting...';
            textColor = 'text-blue-400';
            break;
        case Status.LISTENING:
            statusText = 'Listening...';
            textColor = 'text-green-400';
            break;
        case Status.ERROR:
            statusText = 'An error occurred.';
            textColor = 'text-red-400';
            break;
        case Status.STOPPED:
            statusText = 'Session stopped.';
            textColor = 'text-yellow-400';
            break;
    }

    return <p className={`text-center text-sm ${textColor} transition-colors`}>{statusText}</p>;
};

const ControlButton: React.FC<{ status: Status; onClick: () => void }> = ({ status, onClick }) => {
    const isRunning = status === Status.CONNECTING || status === Status.LISTENING;

    return (
        <button
            onClick={onClick}
            disabled={status === Status.CONNECTING}
            className={`relative flex items-center justify-center w-24 h-24 rounded-full transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50
                ${isRunning ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}
                ${status === Status.CONNECTING ? 'cursor-wait animate-pulse' : ''}`}
        >
            {isRunning ? <MicOff size={48} /> : <Mic size={48} />}
        </button>
    );
};

const TranscriptionPanel: React.FC<{ title: string, text: string }> = ({ title, text }) => {
    return (
        <div className="bg-gray-800 rounded-lg p-6 flex-1 flex flex-col min-h-[200px]">
            <h2 className="text-lg font-semibold text-gray-400 mb-4">{title}</h2>
            <div className="flex-grow text-gray-200 text-xl leading-relaxed whitespace-pre-wrap">{text}</div>
        </div>
    );
};

export default function App() {
    const [lang1Code, setLang1Code] = useState<Language['code']>('ja');
    const [lang2Code, setLang2Code] = useState<Language['code']>('en');

    const lang1 = supportedLanguages.find(l => l.code === lang1Code)!;
    const lang2 = supportedLanguages.find(l => l.code === lang2Code)!;

    const {
        startSession,
        stopSession,
        status,
        transcriptionLog,
        currentText1,
        currentText2
    } = useSimultaneousTranslator(lang1, lang2);

    const handleButtonClick = () => {
        if (status === Status.LISTENING || status === Status.CONNECTING) {
            stopSession();
        } else {
            startSession();
        }
    };

    const isRunning = status === Status.CONNECTING || status === Status.LISTENING;

    const handleLang1Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang1Code = e.target.value as Language['code'];
        if (newLang1Code === lang2Code) {
            setLang2Code(lang1Code);
        }
        setLang1Code(newLang1Code);
    };

    const handleLang2Change = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang2Code = e.target.value as Language['code'];
        if (newLang2Code === lang1Code) {
            setLang1Code(lang2Code);
        }
        setLang2Code(newLang2Code);
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col p-4 md:p-8">
            <header className="text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                    Simultaneous <span className="text-blue-400">Translator</span>
                </h1>
                <p className="text-gray-400 mt-2">
                    Real-time multi-language translation powered by the Gemini Live API.
                </p>
            </header>

            <div className="flex justify-center items-center gap-4 md:gap-8 mb-8">
                <div className="flex flex-col gap-2">
                    <label htmlFor="lang1-select" className="text-sm text-gray-400">
                        Language 1
                    </label>
                    <select
                        id="lang1-select"
                        value={lang1Code}
                        onChange={handleLang1Change}
                        disabled={isRunning}
                        className="bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 cursor-pointer"
                    >
                        {supportedLanguages.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                </div>
                <span className="text-gray-500 mt-7 text-xl">&harr;</span>
                 <div className="flex flex-col gap-2">
                    <label htmlFor="lang2-select" className="text-sm text-gray-400">
                        Language 2
                    </label>
                    <select
                        id="lang2-select"
                        value={lang2Code}
                        onChange={handleLang2Change}
                        disabled={isRunning}
                        className="bg-gray-700 border border-gray-600 rounded-md p-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 cursor-pointer"
                    >
                        {supportedLanguages.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <main className="flex-grow flex flex-col gap-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <TranscriptionPanel title={lang1.name} text={currentText1} />
                    <TranscriptionPanel title={lang2.name} text={currentText2} />
                </div>
                
                <div id="transcription-history" className="bg-gray-800/50 rounded-lg p-4 space-y-4 h-64 overflow-y-auto">
                    {transcriptionLog.length === 0 && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                           Your conversation history will appear here.
                        </div>
                    )}
                    {transcriptionLog.map(entry => (
                        <div key={entry.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <p className="p-3 bg-gray-700 rounded-md"><strong className="text-blue-300">{lang1.name}:</strong> {entry.lang1Text}</p>
                            <p className="p-3 bg-gray-700 rounded-md"><strong className="text-green-300">{lang2.name}:</strong> {entry.lang2Text}</p>
                        </div>
                    ))}
                </div>
            </main>

            <footer className="mt-8 flex flex-col items-center justify-center gap-4">
                <ControlButton status={status} onClick={handleButtonClick} />
                <StatusIndicator status={status} />
                 {status === Status.ERROR && (
                    <div className="mt-2 flex items-center gap-2 text-red-400 bg-red-900/50 px-4 py-2 rounded-lg">
                        <AlertTriangle size={16} />
                        <span>Please check console for errors and ensure microphone access is enabled.</span>
                    </div>
                )}
            </footer>
        </div>
    );
}
