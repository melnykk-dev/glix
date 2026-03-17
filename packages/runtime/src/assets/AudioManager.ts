export class AudioManager {
    private context: AudioContext;
    private buffers: Map<string, AudioBuffer> = new Map();
    private sources: Map<string, AudioBufferSourceNode> = new Map();
    private gainNode: GainNode;

    constructor() {
        this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.gainNode = this.context.createGain();
        this.gainNode.connect(this.context.destination);
    }

    async loadSound(id: string, dataURL: string): Promise<void> {
        const response = await fetch(dataURL);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
        this.buffers.set(id, audioBuffer);
    }

    play(id: string, options: { loop?: boolean; volume?: number } = {}): void {
        const buffer = this.buffers.get(id);
        if (!buffer) {
            console.warn(`Sound buffer not found: ${id}`);
            return;
        }

        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.loop = options.loop || false;

        const volume = this.context.createGain();
        volume.gain.value = options.volume ?? 1.0;

        source.connect(volume);
        volume.connect(this.gainNode);

        source.start(0);
        this.sources.set(id, source);

        source.onended = () => {
            if (this.sources.get(id) === source) {
                this.sources.delete(id);
            }
        };
    }

    stop(id: string): void {
        const source = this.sources.get(id);
        if (source) {
            source.stop();
            this.sources.delete(id);
        }
    }

    setVolume(volume: number): void {
        this.gainNode.gain.value = volume;
    }

    resume(): void {
        if (this.context.state === 'suspended') {
            this.context.resume();
        }
    }
}
