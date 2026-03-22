export class AudioManager {
    private context: AudioContext | null = null;
    private buffers: Map<string, AudioBuffer> = new Map();
    private gainNodes: Map<string, GainNode> = new Map();
    private sources: Map<string, AudioBufferSourceNode> = new Map();
    private masterGain: GainNode | null = null;

    private getContext(): AudioContext {
        if (!this.context) {
            this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.context.createGain();
            this.masterGain.connect(this.context.destination);
        }
        return this.context;
    }

    private ensureRunning(): void {
        const ctx = this.getContext();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }
    }

    async loadSound(id: string, dataURL: string): Promise<void> {
        try {
            const ctx = this.getContext();
            const response = await fetch(dataURL);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(id, audioBuffer);
        } catch (e) {
            console.warn(`[AudioManager] Failed to load sound "${id}":`, e);
        }
    }

    async loadAudio(id: string, dataURL: string): Promise<void> {
        return this.loadSound(id, dataURL);
    }

    hasSound(id: string): boolean {
        return this.buffers.has(id);
    }

    play(id: string, options: { loop?: boolean; volume?: number } = {}): void {
        const buffer = this.buffers.get(id);
        if (!buffer) {
            console.warn(`[AudioManager] Sound not found: "${id}". Make sure the audio asset is loaded.`);
            return;
        }

        this.ensureRunning();
        const ctx = this.getContext();

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = options.loop ?? false;

        const gainNode = ctx.createGain();
        gainNode.gain.value = Math.max(0, Math.min(1, options.volume ?? 1.0));

        source.connect(gainNode);
        gainNode.connect(this.masterGain!);

        this.stopSource(id);
        source.start(0);
        this.sources.set(id, source);
        this.gainNodes.set(id, gainNode);

        source.onended = () => {
            if (this.sources.get(id) === source) {
                this.sources.delete(id);
            }
        };
    }

    playSound(id: string, volume?: number, loop?: boolean): void {
        this.play(id, { volume, loop });
    }

    stop(id: string): void {
        this.stopSource(id);
    }

    stopSound(id: string): void {
        this.stopSource(id);
    }

    stopAll(): void {
        for (const id of this.sources.keys()) {
            this.stopSource(id);
        }
    }

    private stopSource(id: string): void {
        const source = this.sources.get(id);
        if (source) {
            try { source.stop(); } catch (_) {}
            this.sources.delete(id);
        }
    }

    setVolume(volume: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    setSoundVolume(id: string, volume: number): void {
        const gainNode = this.gainNodes.get(id);
        if (gainNode) {
            gainNode.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    isPlaying(id: string): boolean {
        return this.sources.has(id);
    }

    resume(): void {
        this.ensureRunning();
    }
}
