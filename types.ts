export enum Status {
    IDLE = 'idle',
    CONNECTING = 'connecting',
    LISTENING = 'listening',
    ERROR = 'error',
    STOPPED = 'stopped',
}

export type Language = {
    code: 'en' | 'ja' | 'zh-CN' | 'zh-TW';
    name: string;
};

export interface TranscriptionLog {
    id: number;
    lang1Text: string;
    lang2Text: string;
}
