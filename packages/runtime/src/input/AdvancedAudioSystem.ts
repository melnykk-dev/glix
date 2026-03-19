import { Vec3 } from '../math';

/**
 * Advanced Audio System with 3D spatial audio, mixing, effects, music transitions,
 * procedural audio, dynamic music, and voice synthesis.
 */
export class AdvancedAudioSystem {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private listener: AudioListener | null = null;

    // Audio sources and buffers
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private audioSources: Map<string, AudioBufferSourceNode> = new Map();
    private spatialSources: Map<string, PannerNode> = new Map();
    private playingSources: Map<string, PlayingAudioSource> = new Map();

    // Audio buses and mixing
    private buses: Map<string, AudioBus> = new Map();
    private masterBus: AudioBus | null = null;

    // Effects processing
    private effects: Map<string, AudioEffect> = new Map();
    private effectChains: Map<string, AudioEffect[]> = new Map();

    // Music system
    private musicTracks: Map<string, MusicTrack> = new Map();
    private currentMusicTrack: string | null = null;

    // Dynamic music
    private dynamicMusicSystem: DynamicMusicSystem | null = null;

    // Procedural audio
    private proceduralGenerators: Map<string, ProceduralAudioGenerator> = new Map();

    // Voice synthesis
    private speechSynthesizer: SpeechSynthesizer | null = null;

    // 3D audio settings
    private distanceModel: DistanceModelType = 'inverse';
    private maxDistance: number = 1000;
    private rolloffFactor: number = 1;
    private coneInnerAngle: number = 360;
    private coneOuterAngle: number = 360;
    private coneOuterGain: number = 0;

    // Performance and memory
    private maxConcurrentSources: number = 32;
    private activeSourceCount: number = 0;
    private audioPool: AudioBufferSourceNode[] = [];
    private pannerPool: PannerNode[] = [];

    // Recording and analysis
    private recorder: MediaRecorder | null = null;
    private analyser: AnalyserNode | null = null;
    private frequencyData: Uint8Array | null = null;
    private timeData: Uint8Array | null = null;

    // Spatial audio zones
    private audioZones: Map<string, AudioZone> = new Map();

    // MIDI support
    private midiAccess: MIDIAccess | null = null;
    private midiInputs: Map<string, MIDIInput> = new Map();
    private midiOutputs: Map<string, MIDIOutput> = new Map();

    // Audio scripting
    private audioScripts: Map<string, AudioScript> = new Map();

    constructor() {
        this.initializeAudioContext();
        console.log('[AdvancedAudioSystem] Advanced audio system initialized');
    }

    private async initializeAudioContext(): Promise<void> {
        try {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

            // Resume context if suspended (required by some browsers)
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.masterGain = this.audioContext.createGain();
            this.masterGain.connect(this.audioContext.destination);

            this.listener = this.audioContext.listener;

            // Set default 3D audio settings
            if (this.listener) {
                this.listener.positionX.value = 0;
                this.listener.positionY.value = 0;
                this.listener.positionZ.value = 0;
                this.listener.forwardX.value = 0;
                this.listener.forwardY.value = 0;
                this.listener.forwardZ.value = -1;
                this.listener.upX.value = 0;
                this.listener.upY.value = 1;
                this.listener.upZ.value = 0;
            }

            // Create master bus
            this.masterBus = {
                id: 'master',
                gain: this.masterGain,
                input: this.masterGain,
                output: this.audioContext.destination,
                effects: [],
                muted: false,
                solo: false,
                volume: 1.0,
                pan: 0.0
            };

            this.buses.set('master', this.masterBus);

            // Initialize analyser for audio analysis
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeData = new Uint8Array(this.analyser.frequencyBinCount);

            // Connect analyser to master
            this.masterGain.connect(this.analyser);

            // Initialize speech synthesis
            if ('speechSynthesis' in window) {
                this.speechSynthesizer = new SpeechSynthesizer(this.audioContext);
            }

            // Request MIDI access
            if (navigator.requestMIDIAccess) {
                try {
                    this.midiAccess = await navigator.requestMIDIAccess();
                    this.initializeMIDI();
                } catch (error) {
                    console.warn('[AdvancedAudioSystem] MIDI access denied:', error);
                }
            }

        } catch (error) {
            console.error('[AdvancedAudioSystem] Failed to initialize audio context:', error);
        }
    }

    private initializeMIDI(): void {
        if (!this.midiAccess) return;

        // Set up MIDI inputs
        for (const input of this.midiAccess.inputs.values()) {
            this.midiInputs.set(input.id, input);
            input.onmidimessage = this.onMIDIMessage.bind(this);
        }

        // Set up MIDI outputs
        for (const output of this.midiAccess.outputs.values()) {
            this.midiOutputs.set(output.id, output);
        }

        console.log(`[AdvancedAudioSystem] MIDI initialized: ${this.midiInputs.size} inputs, ${this.midiOutputs.size} outputs`);
    }

    private onMIDIMessage(message: MIDIMessageEvent): void {
        const [command, note, velocity] = message.data;

        // Emit MIDI events for scripts to handle
        // This would integrate with the event system
        console.log(`[AdvancedAudioSystem] MIDI: ${command}, ${note}, ${velocity}`);
    }

    // Audio loading and management
    async loadAudio(audioId: string, audioData: ArrayBuffer | string): Promise<void> {
        if (!this.audioContext) return;

        try {
            let buffer: AudioBuffer;

            if (typeof audioData === 'string') {
                // Load from URL
                const response = await fetch(audioData);
                const arrayBuffer = await response.arrayBuffer();
                buffer = await this.audioContext.decodeAudioData(arrayBuffer);
            } else {
                // Decode provided ArrayBuffer
                buffer = await this.audioContext.decodeAudioData(audioData);
            }

            this.audioBuffers.set(audioId, buffer);
            console.log(`[AdvancedAudioSystem] Loaded audio: ${audioId} (${buffer.duration.toFixed(2)}s)`);

        } catch (error) {
            console.error(`[AdvancedAudioSystem] Failed to load audio ${audioId}:`, error);
        }
    }

    unloadAudio(audioId: string): void {
        this.audioBuffers.delete(audioId);

        // Stop any playing instances
        for (const [sourceId, source] of this.playingSources) {
            if (source.audioId === audioId) {
                this.stopAudio(sourceId);
            }
        }

        console.log(`[AdvancedAudioSystem] Unloaded audio: ${audioId}`);
    }

    // Audio playback
    playAudio(audioId: string, options: AudioPlaybackOptions = {}): string {
        if (!this.audioContext || !this.audioBuffers.has(audioId)) {
            console.warn(`[AdvancedAudioSystem] Cannot play audio ${audioId}: not loaded or no context`);
            return '';
        }

        if (this.activeSourceCount >= this.maxConcurrentSources) {
            console.warn('[AdvancedAudioSystem] Max concurrent sources reached');
            return '';
        }

        const sourceId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const buffer = this.audioBuffers.get(audioId)!;

        // Create source node
        const source = this.getSourceFromPool();
        source.buffer = buffer;

        // Create panner for 3D audio
        const panner = this.getPannerFromPool();
        this.configurePanner(panner, options);

        // Create gain node for volume control
        const gain = this.audioContext.createGain();
        gain.gain.value = options.volume || 1.0;

        // Set up routing
        source.connect(gain);
        gain.connect(panner);

        // Route to appropriate bus
        const targetBus = options.bus ? this.buses.get(options.bus) : this.masterBus;
        if (targetBus) {
            panner.connect(targetBus.input);
        } else {
            panner.connect(this.masterGain!);
        }

        // Apply effects if specified
        if (options.effects) {
            this.applyEffectsToSource(source, options.effects);
        }

        // Start playback
        const startTime = options.delay || 0;
        const offset = options.offset || 0;
        const duration = options.duration;

        if (duration) {
            source.start(this.audioContext.currentTime + startTime, offset, duration);
        } else {
            source.start(this.audioContext.currentTime + startTime, offset);
        }

        // Handle looping
        if (options.loop) {
            source.loop = true;
            if (options.loopStart !== undefined) source.loopStart = options.loopStart;
            if (options.loopEnd !== undefined) source.loopEnd = options.loopEnd;
        }

        // Store playing source info
        const playingSource: PlayingAudioSource = {
            id: sourceId,
            audioId,
            source,
            panner,
            gain,
            startTime: this.audioContext.currentTime + startTime,
            duration: duration || buffer.duration,
            volume: options.volume || 1.0,
            spatial: options.spatial || false,
            looping: options.loop || false,
            bus: options.bus || 'master',
            effects: options.effects || []
        };

        this.playingSources.set(sourceId, playingSource);
        this.spatialSources.set(sourceId, panner);
        this.activeSourceCount++;

        // Set up end handler
        source.onended = () => {
            this.cleanupSource(sourceId);
        };

        console.log(`[AdvancedAudioSystem] Playing audio ${audioId} as ${sourceId}`);
        return sourceId;
    }

    stopAudio(sourceId: string): void {
        const playingSource = this.playingSources.get(sourceId);
        if (!playingSource) return;

        try {
            playingSource.source.stop();
        } catch (error) {
            // Source might already be stopped
        }

        this.cleanupSource(sourceId);
    }

    pauseAudio(sourceId: string): void {
        const playingSource = this.playingSources.get(sourceId);
        if (!playingSource) return;

        // Web Audio API doesn't have pause, so we need to track manually
        playingSource.paused = true;
        playingSource.pauseTime = this.audioContext!.currentTime;
        playingSource.source.stop();
    }

    resumeAudio(sourceId: string): void {
        const playingSource = this.playingSources.get(sourceId);
        if (!playingSource || !playingSource.paused) return;

        const resumeTime = this.audioContext!.currentTime - playingSource.pauseTime!;
        const remainingDuration = playingSource.duration - resumeTime;

        if (remainingDuration > 0) {
            playingSource.source.start(0, resumeTime, remainingDuration);
            playingSource.paused = false;
            playingSource.pauseTime = undefined;
        }
    }

    private cleanupSource(sourceId: string): void {
        const playingSource = this.playingSources.get(sourceId);
        if (!playingSource) return;

        // Return nodes to pools
        this.returnSourceToPool(playingSource.source);
        this.returnPannerToPool(playingSource.panner);

        // Clean up references
        this.playingSources.delete(sourceId);
        this.spatialSources.delete(sourceId);
        this.activeSourceCount--;

        console.log(`[AdvancedAudioSystem] Cleaned up audio source: ${sourceId}`);
    }

    private configurePanner(panner: PannerNode, options: AudioPlaybackOptions): void {
        if (!options.spatial) {
            // Disable spatialization
            panner.panningModel = 'equalpower';
            panner.distanceModel = 'linear';
            panner.rolloffFactor = 0;
            return;
        }

        // Configure 3D spatialization
        panner.panningModel = 'HRTF';
        panner.distanceModel = this.distanceModel;
        panner.maxDistance = options.maxDistance || this.maxDistance;
        panner.rolloffFactor = options.rolloffFactor || this.rolloffFactor;
        panner.coneInnerAngle = options.coneInnerAngle || this.coneInnerAngle;
        panner.coneOuterAngle = options.coneOuterAngle || this.coneOuterAngle;
        panner.coneOuterGain = options.coneOuterGain || this.coneOuterGain;

        // Set position
        if (options.position) {
            panner.positionX.value = options.position[0];
            panner.positionY.value = options.position[1];
            panner.positionZ.value = options.position[2];
        }

        // Set orientation
        if (options.orientation) {
            panner.orientationX.value = options.orientation[0];
            panner.orientationY.value = options.orientation[1];
            panner.orientationZ.value = options.orientation[2];
        }
    }

    // Spatial audio
    setListenerPosition(position: Vec3): void {
        if (!this.listener) return;

        this.listener.positionX.value = position[0];
        this.listener.positionY.value = position[1];
        this.listener.positionZ.value = position[2];
    }

    setListenerOrientation(forward: Vec3, up: Vec3): void {
        if (!this.listener) return;

        this.listener.forwardX.value = forward[0];
        this.listener.forwardY.value = forward[1];
        this.listener.forwardZ.value = forward[2];

        this.listener.upX.value = up[0];
        this.listener.upY.value = up[1];
        this.listener.upZ.value = up[2];
    }

    updateSourcePosition(sourceId: string, position: Vec3): void {
        const panner = this.spatialSources.get(sourceId);
        if (!panner) return;

        panner.positionX.value = position[0];
        panner.positionY.value = position[1];
        panner.positionZ.value = position[2];
    }

    updateSourceOrientation(sourceId: string, orientation: Vec3): void {
        const panner = this.spatialSources.get(sourceId);
        if (!panner) return;

        panner.orientationX.value = orientation[0];
        panner.orientationY.value = orientation[1];
        panner.orientationZ.value = orientation[2];
    }

    // Audio buses and mixing
    createBus(busId: string, options: AudioBusOptions = {}): AudioBus {
        if (!this.audioContext) throw new Error('Audio context not initialized');

        const gain = this.audioContext.createGain();
        const bus: AudioBus = {
            id: busId,
            gain,
            input: gain,
            output: options.output || this.masterGain!,
            effects: [],
            muted: false,
            solo: false,
            volume: options.volume || 1.0,
            pan: options.pan || 0.0
        };

        // Connect to output
        gain.connect(bus.output);

        // Set initial volume
        gain.gain.value = bus.volume;

        this.buses.set(busId, bus);
        console.log(`[AdvancedAudioSystem] Created audio bus: ${busId}`);

        return bus;
    }

    setBusVolume(busId: string, volume: number): void {
        const bus = this.buses.get(busId);
        if (!bus) return;

        bus.volume = Math.max(0, Math.min(1, volume));
        bus.gain.gain.value = bus.muted ? 0 : bus.volume;
    }

    setBusPan(busId: string, pan: number): void {
        const bus = this.buses.get(busId);
        if (!bus) return;

        bus.pan = Math.max(-1, Math.min(1, pan));
        // Pan implementation would require a stereo panner node
    }

    muteBus(busId: string, muted: boolean): void {
        const bus = this.buses.get(busId);
        if (!bus) return;

        bus.muted = muted;
        bus.gain.gain.value = bus.muted ? 0 : bus.volume;
    }

    soloBus(busId: string, solo: boolean): void {
        const bus = this.buses.get(busId);
        if (!bus) return;

        bus.solo = solo;

        // When solo is enabled, mute all other buses
        for (const [id, otherBus] of this.buses) {
            if (id !== busId) {
                otherBus.gain.gain.value = solo ? 0 : (otherBus.muted ? 0 : otherBus.volume);
            }
        }
    }

    // Audio effects
    createEffect(effectId: string, type: AudioEffectType, options: any = {}): AudioEffect {
        if (!this.audioContext) throw new Error('Audio context not initialized');

        let effect: AudioEffect;

        switch (type) {
            case 'reverb':
                effect = this.createReverbEffect(options);
                break;
            case 'delay':
                effect = this.createDelayEffect(options);
                break;
            case 'distortion':
                effect = this.createDistortionEffect(options);
                break;
            case 'filter':
                effect = this.createFilterEffect(options);
                break;
            case 'compressor':
                effect = this.createCompressorEffect(options);
                break;
            case 'equalizer':
                effect = this.createEqualizerEffect(options);
                break;
            case 'chorus':
                effect = this.createChorusEffect(options);
                break;
            case 'flanger':
                effect = this.createFlangerEffect(options);
                break;
            case 'phaser':
                effect = this.createPhaserEffect(options);
                break;
            case 'pitch_shift':
                effect = this.createPitchShiftEffect(options);
                break;
            default:
                throw new Error(`Unknown effect type: ${type}`);
        }

        effect.id = effectId;
        effect.type = type;
        effect.enabled = true;

        this.effects.set(effectId, effect);
        console.log(`[AdvancedAudioSystem] Created ${type} effect: ${effectId}`);

        return effect;
    }

    private createReverbEffect(options: any): AudioEffect {
        const convolver = this.audioContext!.createConvolver();
        const gain = this.audioContext!.createGain();

        // Create impulse response for reverb
        const decay = options.decay || 2;
        const wetness = options.wetness || 0.3;
        const mix = options.mix || 0.3;
        const impulseResponse = this.generateReverbImpulse(decay, wetness);

        convolver.buffer = impulseResponse;
        gain.gain.value = mix;

        return {
            input: convolver,
            output: wetGain,
            nodes: [wetGain, convolver],
            parameters: {
                decay,
                wetness,
                mix
            },
            id: 'reverb',
            type: 'reverb',
            enabled: true
        };
    }

    private createDelayEffect(options: any): AudioEffect {
        const delay = this.audioContext!.createDelay(options.maxDelay || 1);
        const feedback = this.audioContext!.createGain();
        const wet = this.audioContext!.createGain();
        const dry = this.audioContext!.createGain();
        const output = this.audioContext!.createGain();

        delay.delayTime.value = options.delayTime || 0.3;
        feedback.gain.value = options.feedback || 0.4;
        wet.gain.value = options.wetness || 0.3;
        dry.gain.value = options.dryness || 0.7;

        // Connect: input -> dry -> output
        //          input -> delay -> feedback -> delay (loop)
        //          delay -> wet -> output

        return {
            input: delay,
            output: output,
            nodes: [delay, feedback, wet, dry, output],
            parameters: {
                delayTime: options.delayTime || 0.5,
                feedback: options.feedback || 0.3,
                wetness: options.wetness || 0.5,
                dryness: options.dryness || 0.5
            },
            id: 'delay',
            type: 'delay',
            enabled: true
        };
    }

    private createDistortionEffect(options: any): AudioEffect {
        const distortion = this.audioContext!.createWaveShaper();
        const gain = this.audioContext!.createGain();

        // Create distortion curve
        const samples = 44100;
        const curve = new Float32Array(samples);
        const amount = options.amount || 50;

        for (let i = 0; i < samples; ++i) {
            const x = i * 2 / samples - 1;
            curve[i] = (3 + amount) * x * 20 * Math.PI / (Math.PI + amount * Math.abs(x));
        }

        distortion.curve = curve;
        gain.gain.value = options.gain || 0.5;

        distortion.connect(gain);

        return {
            input: distortion,
            output: gain,
            nodes: [distortion, gain],
            parameters: {
                amount: options.amount || 50,
                gain: options.gain || 0.5
            },
            id: 'distortion',
            type: 'distortion',
            enabled: true
        };
    }

    private createFilterEffect(options: any): AudioEffect {
        const filter = this.audioContext!.createBiquadFilter();

        filter.type = options.type || 'lowpass';
        filter.frequency.value = options.frequency || 1000;
        filter.Q.value = options.q || 1;
        filter.gain.value = options.gain || 0;

        return {
            input: filter,
            output: filter,
            nodes: [filter],
            parameters: {
                type: options.type || 'lowpass',
                frequency: options.frequency || 1000,
                q: options.q || 1,
                gain: options.gain || 0
            },
            id: 'filter',
            type: 'filter',
            enabled: true
        };
    }

    private createCompressorEffect(options: any): AudioEffect {
        const compressor = this.audioContext!.createDynamicsCompressor();

        compressor.threshold.value = options.threshold || -24;
        compressor.knee.value = options.knee || 30;
        compressor.ratio.value = options.ratio || 12;
        compressor.attack.value = options.attack || 0.003;
        compressor.release.value = options.release || 0.25;

        return {
            input: compressor,
            output: compressor,
            nodes: [compressor],
            parameters: {
                threshold: options.threshold || -24,
                knee: options.knee || 30,
                ratio: options.ratio || 12,
                attack: options.attack || 0.003,
                release: options.release || 0.25
            }
        };
    }

    private createEqualizerEffect(options: any): AudioEffect {
        // Create multiple filters for EQ bands
        const bands = options.bands || [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        const filters: BiquadFilterNode[] = [];
        const input = this.audioContext!.createGain();
        const output = this.audioContext!.createGain();

        let currentNode: AudioNode = input;

        for (const frequency of bands) {
            const filter = this.audioContext!.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = frequency;
            filter.Q.value = 1.4;
            filter.gain.value = 0; // Flat initially

            currentNode.connect(filter);
            filters.push(filter);
            currentNode = filter;
        }

        currentNode.connect(output);

        return {
            input,
            output,
            nodes: [input, ...filters, output],
            parameters: {
                bands,
                gains: new Array(bands.length).fill(0)
            }
        };
    }

    private createChorusEffect(options: any): AudioEffect {
        // Chorus effect using delay and LFO
        const delay = this.audioContext!.createDelay(0.05);
        const lfo = this.audioContext!.createOscillator();
        const lfoGain = this.audioContext!.createGain();
        const feedback = this.audioContext!.createGain();
        const wet = this.audioContext!.createGain();
        const dry = this.audioContext!.createGain();
        const output = this.audioContext!.createGain();

        delay.delayTime.value = options.delay || 0.01;
        lfo.frequency.value = options.rate || 0.5;
        lfoGain.gain.value = options.depth || 0.002;
        feedback.gain.value = options.feedback || 0.2;
        wet.gain.value = options.wetness || 0.3;
        dry.gain.value = options.dryness || 0.7;

        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();

        return {
            input: dry,
            output,
            nodes: [delay, lfo, lfoGain, feedback, wet, dry, output],
            parameters: {
                delay: options.delay || 0.01,
                rate: options.rate || 0.5,
                depth: options.depth || 0.002,
                feedback: options.feedback || 0.2,
                wetness: options.wetness || 0.3,
                dryness: options.dryness || 0.7
            }
        };
    }

    private createFlangerEffect(options: any): AudioEffect {
        // Flanger effect - similar to chorus but shorter delays
        const delay = this.audioContext!.createDelay(0.01);
        const lfo = this.audioContext!.createOscillator();
        const lfoGain = this.audioContext!.createGain();
        const feedback = this.audioContext!.createGain();
        const wet = this.audioContext!.createGain();
        const dry = this.audioContext!.createGain();
        const output = this.audioContext!.createGain();

        delay.delayTime.value = options.delay || 0.005;
        lfo.frequency.value = options.rate || 1.0;
        lfoGain.gain.value = options.depth || 0.001;
        feedback.gain.value = options.feedback || 0.5;
        wet.gain.value = options.wetness || 0.5;
        dry.gain.value = options.dryness || 0.5;

        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);
        lfo.start();

        return {
            input: dry,
            output,
            nodes: [delay, lfo, lfoGain, feedback, wet, dry, output],
            parameters: {
                delay: options.delay || 0.005,
                rate: options.rate || 1.0,
                depth: options.depth || 0.001,
                feedback: options.feedback || 0.5,
                wetness: options.wetness || 0.5,
                dryness: options.dryness || 0.5
            }
        };
    }

    private createPhaserEffect(options: any): AudioEffect {
        // Phaser effect using all-pass filters
        const filters: BiquadFilterNode[] = [];
        const lfo = this.audioContext!.createOscillator();
        const lfoGain = this.audioContext!.createGain();
        const input = this.audioContext!.createGain();
        const output = this.audioContext!.createGain();

        // Create chain of all-pass filters
        const stages = options.stages || 4;
        let currentNode: AudioNode = input;

        for (let i = 0; i < stages; i++) {
            const filter = this.audioContext!.createBiquadFilter();
            filter.type = 'allpass';
            filter.frequency.value = 1000;
            filter.Q.value = 1;

            currentNode.connect(filter);
            filters.push(filter);
            currentNode = filter;
        }

        currentNode.connect(output);

        // Connect LFO to filter frequencies
        lfo.frequency.value = options.rate || 0.5;
        lfoGain.gain.value = options.depth || 1000;
        lfo.connect(lfoGain);

        for (const filter of filters) {
            lfoGain.connect(filter.frequency);
        }

        lfo.start();

        return {
            input,
            output,
            nodes: [input, ...filters, lfo, lfoGain, output],
            parameters: {
                stages: options.stages || 4,
                rate: options.rate || 0.5,
                depth: options.depth || 1000
            }
        };
    }

    private createPitchShiftEffect(options: any): AudioEffect {
        // Pitch shifting using Web Audio API (limited support)
        // In a real implementation, you'd use a more sophisticated approach
        const pitchShift = this.audioContext!.createGain(); // Placeholder

        return {
            input: pitchShift,
            output: pitchShift,
            nodes: [pitchShift],
            parameters: {
                pitch: options.pitch || 1.0
            }
        };
    }

    private generateReverbImpulse(decay: number, wetness: number): AudioBuffer {
        const sampleRate = this.audioContext!.sampleRate;
        const length = sampleRate * decay;
        const impulse = this.audioContext!.createBuffer(2, length, sampleRate);

        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                const decayFactor = Math.pow(1 - i / length, 2);
                const noise = (Math.random() * 2 - 1) * decayFactor;
                channelData[i] = noise * wetness;
            }
        }

        return impulse;
    }

    private applyEffectsToSource(source: AudioBufferSourceNode, effectIds: string[]): void {
        let currentNode: AudioNode = source;

        for (const effectId of effectIds) {
            const effect = this.effects.get(effectId);
            if (effect && effect.enabled) {
                currentNode.connect(effect.input);
                currentNode = effect.output;
            }
        }

        // Connect final node to master
        currentNode.connect(this.masterGain!);
    }

    addEffectToBus(busId: string, effectId: string): void {
        const bus = this.buses.get(busId);
        const effect = this.effects.get(effectId);

        if (!bus || !effect) return;

        // Insert effect into bus chain
        const lastEffect = bus.effects[bus.effects.length - 1];
        const insertPoint = lastEffect ? lastEffect.output : bus.input;

        insertPoint.disconnect();
        insertPoint.connect(effect.input);
        effect.output.connect(bus.output);

        bus.effects.push(effect);
    }

    removeEffectFromBus(busId: string, effectId: string): void {
        const bus = this.buses.get(busId);
        if (!bus) return;

        const effectIndex = bus.effects.findIndex(e => e.id === effectId);
        if (effectIndex === -1) return;

        const effect = bus.effects[effectIndex];

        // Remove effect from chain
        const prevNode = effectIndex > 0 ? bus.effects[effectIndex - 1].output : bus.input;
        const nextNode = effectIndex < bus.effects.length - 1 ? bus.effects[effectIndex + 1].input : bus.output;

        prevNode.disconnect();
        effect.output.disconnect();

        if (nextNode) {
            prevNode.connect(nextNode);
        } else {
            prevNode.connect(bus.output);
        }

        bus.effects.splice(effectIndex, 1);
    }

    // Music system
    createMusicTrack(trackId: string, audioId: string, options: MusicTrackOptions = {}): MusicTrack {
        const track: MusicTrack = {
            id: trackId,
            audioId,
            volume: options.volume || 1.0,
            fadeInTime: options.fadeInTime || 0,
            fadeOutTime: options.fadeOutTime || 0,
            loop: options.loop || true,
            crossfadeTime: options.crossfadeTime || 0,
            layers: options.layers || [],
            stingers: options.stingers || [],
            transitions: options.transitions || []
        };

        this.musicTracks.set(trackId, track);
        console.log(`[AdvancedAudioSystem] Created music track: ${trackId}`);

        return track;
    }

    playMusic(trackId: string): void {
        const track = this.musicTracks.get(trackId);
        if (!track) return;

        // Stop current music with fade out
        if (this.currentMusicTrack) {
            this.fadeOutMusic(track.fadeOutTime || 1.0);
        }

        // Play new track
        const sourceId = this.playAudio(track.audioId, {
            volume: 0, // Start at 0 for fade in
            loop: track.loop,
            bus: 'music' // Assume music bus exists
        });

        if (sourceId) {
            this.currentMusicTrack = trackId;

            // Fade in
            if (track.fadeInTime > 0) {
                this.fadeInSource(sourceId, track.volume, track.fadeInTime);
            } else {
                this.setSourceVolume(sourceId, track.volume);
            }
        }
    }

    stopMusic(fadeOutTime: number = 0): void {
        if (!this.currentMusicTrack) return;

        if (fadeOutTime > 0) {
            this.fadeOutMusic(fadeOutTime);
        } else {
            // Stop all music sources
            for (const [sourceId, source] of this.playingSources) {
                if (source.bus === 'music') {
                    this.stopAudio(sourceId);
                }
            }
        }

        this.currentMusicTrack = null;
    }

    private fadeInSource(sourceId: string, targetVolume: number, fadeTime: number): void {
        const source = this.playingSources.get(sourceId);
        if (!source) return;

        const startVolume = source.volume;
        const startTime = this.audioContext!.currentTime;

        const fade = () => {
            const elapsed = this.audioContext!.currentTime - startTime;
            const progress = Math.min(elapsed / fadeTime, 1.0);

            const currentVolume = startVolume + (targetVolume - startVolume) * progress;
            source.gain.gain.value = currentVolume;

            if (progress < 1.0) {
                requestAnimationFrame(fade);
            } else {
                source.volume = targetVolume;
            }
        };

        requestAnimationFrame(fade);
    }

    private fadeOutMusic(fadeTime: number): void {
        for (const [sourceId, source] of this.playingSources) {
            if (source.bus === 'music') {
                const startVolume = source.volume;
                const startTime = this.audioContext!.currentTime;

                const fade = () => {
                    const elapsed = this.audioContext!.currentTime - startTime;
                    const progress = Math.min(elapsed / fadeTime, 1.0);

                    const currentVolume = startVolume * (1 - progress);
                    source.gain.gain.value = currentVolume;

                    if (progress < 1.0) {
                        requestAnimationFrame(fade);
                    } else {
                        this.stopAudio(sourceId);
                    }
                };

                requestAnimationFrame(fade);
            }
        }
    }

    private setSourceVolume(sourceId: string, volume: number): void {
        const source = this.playingSources.get(sourceId);
        if (source) {
            source.volume = volume;
            source.gain.gain.value = volume;
        }
    }

    // Dynamic music system
    createDynamicMusicSystem(systemId: string): DynamicMusicSystem {
        const system: DynamicMusicSystem = {
            id: systemId,
            states: new Map(),
            transitions: [],
            currentState: null,
            parameters: new Map(),
            intensity: 0,
            tension: 0
        };

        this.dynamicMusicSystem = system;
        console.log(`[AdvancedAudioSystem] Created dynamic music system: ${systemId}`);

        return system;
    }

    addMusicState(systemId: string, stateId: string, tracks: string[], conditions: any): void {
        if (!this.dynamicMusicSystem || this.dynamicMusicSystem.id !== systemId) return;

        const state: MusicState = {
            id: stateId,
            tracks,
            conditions,
            active: false
        };

        this.dynamicMusicSystem.states.set(stateId, state);
    }

    updateDynamicMusic(parameters: Map<string, number>): void {
        if (!this.dynamicMusicSystem) return;

        // Update parameters
        for (const [param, value] of parameters) {
            this.dynamicMusicSystem.parameters.set(param, value);
        }

        // Evaluate state transitions
        this.evaluateMusicTransitions();
    }

    private evaluateMusicTransitions(): void {
        if (!this.dynamicMusicSystem) return;

        for (const transition of this.dynamicMusicSystem.transitions) {
            if (this.evaluateMusicCondition(transition.condition)) {
                this.transitionToMusicState(transition.targetState);
                break;
            }
        }
    }

    private evaluateMusicCondition(condition: any): boolean {
        // Evaluate condition based on parameters
        // Simplified implementation
        return true;
    }

    private transitionToMusicState(stateId: string): void {
        if (!this.dynamicMusicSystem) return;

        const state = this.dynamicMusicSystem.states.get(stateId);
        if (!state) return;

        // Stop current state
        if (this.dynamicMusicSystem.currentState) {
            const currentState = this.dynamicMusicSystem.states.get(this.dynamicMusicSystem.currentState);
            if (currentState) {
                currentState.active = false;
                // Stop current tracks
            }
        }

        // Start new state
        state.active = true;
        this.dynamicMusicSystem.currentState = stateId;

        // Play state tracks
        for (const trackId of state.tracks) {
            this.playMusic(trackId);
        }
    }

    // Procedural audio
    createProceduralGenerator(generatorId: string, type: ProceduralAudioType, config: any): ProceduralAudioGenerator {
        const generator: ProceduralAudioGenerator = {
            id: generatorId,
            type,
            config,
            isPlaying: false,
            source: null,
            scriptProcessor: null
        };

        // Initialize based on type
        switch (type) {
            case 'noise':
                generator.source = this.createNoiseGenerator(config);
                break;
            case 'tone':
                generator.source = this.createToneGenerator(config);
                break;
            case 'drum':
                generator.source = this.createDrumGenerator(config);
                break;
            case 'ambient':
                generator.source = this.createAmbientGenerator(config);
                break;
        }

        this.proceduralGenerators.set(generatorId, generator);
        console.log(`[AdvancedAudioSystem] Created procedural generator: ${generatorId} (${type})`);

        return generator;
    }

    private createNoiseGenerator(config: any): AudioBufferSourceNode {
        const bufferSize = this.audioContext!.sampleRate * (config.duration || 1);
        const buffer = this.audioContext!.createBuffer(1, bufferSize, this.audioContext!.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (config.amplitude || 0.1);
        }

        const source = this.audioContext!.createBufferSource();
        source.buffer = buffer;
        source.loop = config.loop || false;

        return source;
    }

    private createToneGenerator(config: any): OscillatorNode {
        const oscillator = this.audioContext!.createOscillator();
        oscillator.type = config.waveform || 'sine';
        oscillator.frequency.value = config.frequency || 440;

        const gain = this.audioContext!.createGain();
        gain.gain.value = config.amplitude || 0.1;

        oscillator.connect(gain);

        // Store gain node for cleanup
        (oscillator as any).gainNode = gain;

        return oscillator as any;
    }

    private createDrumGenerator(config: any): AudioBufferSourceNode {
        // Generate drum sound using noise and envelope
        const bufferSize = this.audioContext!.sampleRate * 0.5; // 0.5 second
        const buffer = this.audioContext!.createBuffer(1, bufferSize, this.audioContext!.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            const t = i / this.audioContext!.sampleRate;
            const envelope = Math.exp(-t * (config.decay || 10));
            const noise = (Math.random() * 2 - 1) * envelope;
            data[i] = noise * (config.amplitude || 0.3);
        }

        const source = this.audioContext!.createBufferSource();
        source.buffer = buffer;

        return source;
    }

    private createAmbientGenerator(config: any): AudioBufferSourceNode {
        // Generate ambient texture using filtered noise
        const bufferSize = this.audioContext!.sampleRate * (config.duration || 10);
        const buffer = this.audioContext!.createBuffer(1, bufferSize, this.audioContext!.sampleRate);
        const data = buffer.getChannelData(0);

        // Create filtered noise
        let filterState = 0;
        const filterCoeff = config.filterCoeff || 0.99;

        for (let i = 0; i < bufferSize; i++) {
            const noise = Math.random() * 2 - 1;
            filterState = filterState * filterCoeff + noise * (1 - filterCoeff);
            data[i] = filterState * (config.amplitude || 0.05);
        }

        const source = this.audioContext!.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        return source;
    }

    playProcedural(generatorId: string): void {
        const generator = this.proceduralGenerators.get(generatorId);
        if (!generator || generator.isPlaying) return;

        if (generator.source) {
            generator.source.connect(this.masterGain!);
            generator.source.start();
            generator.isPlaying = true;
        }
    }

    stopProcedural(generatorId: string): void {
        const generator = this.proceduralGenerators.get(generatorId);
        if (!generator || !generator.isPlaying) return;

        if (generator.source) {
            try {
                generator.source.stop();
            } catch (error) {
                // Source might already be stopped
            }
            generator.isPlaying = false;
        }
    }

    // Voice synthesis
    speak(text: string, options: SpeechSynthesisOptions = {}): void {
        if (!this.speechSynthesizer) {
            console.warn('[AdvancedAudioSystem] Speech synthesis not supported');
            return;
        }

        this.speechSynthesizer.speak(text, options);
    }

    stopSpeech(): void {
        if (this.speechSynthesizer) {

this.speechSynthesizer.speak(text, options);
}

stopSpeech(): void {
if (this.speechSynthesizer) {
    this.speechSynthesizer.stop();
}
}

// Audio analysis
getFrequencyData(): Uint8Array | null {
if (!this.analyser) return null;

if (this.frequencyData) {
    this.analyser!.getByteFrequencyData(this.frequencyData);
    this.analyser!.getByteTimeDomainData(this.timeData!);
}
return this.frequencyData;
}

    getRMSLevel(): number {
        const timeData = this.getTimeData();
        if (!timeData) return 0;

        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
            const sample = (timeData[i] - 128) / 128;
            sum += sample * sample;
        }

        return Math.sqrt(sum / timeData.length);
    }

    // Recording
    startRecording(): void {
        if (!this.audioContext) return;

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                this.recorder = new MediaRecorder(stream);
                this.recorder.ondataavailable = (event) => {
                    // Handle recorded data
                    console.log('[AdvancedAudioSystem] Recorded audio chunk:', event.data.size, 'bytes');
                };
                this.recorder.start();
                console.log('[AdvancedAudioSystem] Started audio recording');
            })
            .catch(error => {
                console.error('[AdvancedAudioSystem] Failed to start recording:', error);
            });
    }

    stopRecording(): void {
        if (this.recorder && this.recorder.state === 'recording') {
            this.recorder.stop();
            console.log('[AdvancedAudioSystem] Stopped audio recording');
        }
    }

    // Spatial audio zones
    createAudioZone(zoneId: string, position: Vec3, size: Vec3, config: AudioZoneConfig): AudioZone {
        const zone: AudioZone = {
            id: zoneId,
            position: Vec3.clone(position),
            size: Vec3.clone(size),
            config,
            activeSources: new Set()
        };

        this.audioZones.set(zoneId, zone);
        console.log(`[AdvancedAudioSystem] Created audio zone: ${zoneId}`);

        return zone;
    }

    updateAudioZone(zoneId: string, position: Vec3, listenerPosition: Vec3): void {
        const zone = this.audioZones.get(zoneId);
        if (!zone) return;

        Vec3.copy(zone.position, position);

        // Update all sources in this zone
        for (const sourceId of zone.activeSources) {
            const playingSource = this.playingSources.get(sourceId);
            if (playingSource) {
                // Apply zone-specific effects or filtering
                this.applyZoneEffects(playingSource, zone, listenerPosition);
            }
        }
    }

    private applyZoneEffects(source: PlayingAudioSource, zone: AudioZone, listenerPosition: Vec3): void {
        // Apply zone-specific audio processing
        // This could include reverb, filtering, volume adjustments, etc.
    }

    // Pool management
    private getSourceFromPool(): AudioBufferSourceNode {
        if (this.audioPool.length > 0) {
            return this.audioPool.pop()!;
        }

        return this.audioContext!.createBufferSource();
    }

    private returnSourceToPool(source: AudioBufferSourceNode): void {
        // Reset source properties
        source.buffer = null;
        source.loop = false;
        source.loopStart = 0;
        source.loopEnd = 0;

        this.audioPool.push(source);
    }

    private getPannerFromPool(): PannerNode {
        if (this.pannerPool.length > 0) {
            return this.pannerPool.pop()!;
        }

        return this.audioContext!.createPanner();
    }

    private returnPannerToPool(panner: PannerNode): void {
        // Reset panner properties
        panner.positionX.value = 0;
        panner.positionY.value = 0;
        panner.positionZ.value = 0;
        panner.orientationX.value = 0;
        panner.orientationY.value = 0;
        panner.orientationZ.value = 1;

        this.pannerPool.push(panner);
    }

    // Getters and setters
    setMasterVolume(volume: number): void {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    getMasterVolume(): number {
        return this.masterGain ? this.masterGain.gain.value : 1;
    }

    setDistanceModel(model: DistanceModelType): void {
        this.distanceModel = model;

        // Update all existing panners
        for (const panner of this.spatialSources.values()) {
            panner.distanceModel = model;
        }
    }

    setMaxDistance(distance: number): void {
        this.maxDistance = distance;

        // Update all existing panners
        for (const panner of this.spatialSources.values()) {
            panner.maxDistance = distance;
        }
    }

    setRolloffFactor(factor: number): void {
        this.rolloffFactor = factor;

        // Update all existing panners
        for (const panner of this.spatialSources.values()) {
            panner.rolloffFactor = factor;
        }
    }

    // Audio scripting
    createAudioScript(scriptId: string, scriptFunction: AudioScriptFunction): AudioScript {
        const script: AudioScript = {
            id: scriptId,
            function: scriptFunction,
            isActive: false
        };

        this.audioScripts.set(scriptId, script);
        console.log(`[AdvancedAudioSystem] Created audio script: ${scriptId}`);

        return script;
    }

    runAudioScript(scriptId: string, context: AudioScriptContext): void {
        const script = this.audioScripts.get(scriptId);
        if (!script) return;

        try {
            script.isActive = true;
            script.function(context);
            script.isActive = false;
        } catch (error) {
            console.error(`[AdvancedAudioSystem] Audio script error in ${scriptId}:`, error);
            script.isActive = false;
        }
    }

    // Debug and profiling
    getDebugInfo(): any {
        return {
            audioContext: this.audioContext ? 'initialized' : 'not initialized',
            activeSources: this.activeSourceCount,
            maxConcurrentSources: this.maxConcurrentSources,
            loadedBuffers: this.audioBuffers.size,
            audioBuses: this.buses.size,
            audioEffects: this.effects.size,
            musicTracks: this.musicTracks.size,
            proceduralGenerators: this.proceduralGenerators.size,
            audioZones: this.audioZones.size,
            midiInputs: this.midiInputs.size,
            midiOutputs: this.midiOutputs.size,
            sourcePoolSize: this.audioPool.length,
            pannerPoolSize: this.pannerPool.length,
            currentMusicTrack: this.currentMusicTrack,
            rmsLevel: this.getRMSLevel()
        };
    }

    // Cleanup
    dispose(): void {
        // Stop all audio
        for (const sourceId of this.playingSources.keys()) {
            this.stopAudio(sourceId);
        }

        // Stop music
        this.stopMusic();

        // Stop procedural audio
        for (const generatorId of this.proceduralGenerators.keys()) {
            this.stopProcedural(generatorId);
        }

        // Stop speech
        this.stopSpeech();

        // Stop recording
        this.stopRecording();

        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }

        // Clear all data structures
        this.audioBuffers.clear();
        this.audioSources.clear();
        this.spatialSources.clear();
        this.playingSources.clear();
        this.buses.clear();
        this.effects.clear();
        this.effectChains.clear();
        this.musicTracks.clear();
        this.proceduralGenerators.clear();
        this.audioZones.clear();
        this.audioScripts.clear();

        this.audioPool.length = 0;
        this.pannerPool.length = 0;

        console.log('[AdvancedAudioSystem] Disposed');
    }
}

// Type definitions
interface PlayingAudioSource {
    id: string;
    audioId: string;
    source: AudioBufferSourceNode;
    panner: PannerNode;
    gain: GainNode;
    startTime: number;
    duration: number;
    volume: number;
    spatial: boolean;
    looping: boolean;
    bus: string;
    effects: string[];
    paused?: boolean;
    pauseTime?: number;
}

interface AudioPlaybackOptions {
    volume?: number;
    loop?: boolean;
    loopStart?: number;
    loopEnd?: number;
    delay?: number;
    offset?: number;
    duration?: number;
    spatial?: boolean;
    position?: [number, number, number];
    orientation?: [number, number, number];
    maxDistance?: number;
    rolloffFactor?: number;
    coneInnerAngle?: number;
    coneOuterAngle?: number;
    coneOuterGain?: number;
    bus?: string;
    effects?: string[];
}

interface AudioBus {
    id: string;
    gain: GainNode;
    input: AudioNode;
    output: AudioNode;
    effects: AudioEffect[];
    muted: boolean;
    solo: boolean;
    volume: number;
    pan: number;
}

interface AudioBusOptions {
    output?: AudioNode;
    volume?: number;
    pan?: number;
}

type AudioEffectType = 'reverb' | 'delay' | 'distortion' | 'filter' | 'compressor' | 'equalizer' | 'chorus' | 'flanger' | 'phaser' | 'pitch_shift';

interface AudioEffect {
    id: string;
    type: AudioEffectType;
    input: AudioNode;
    output: AudioNode;
    nodes: AudioNode[];
    enabled: boolean;
    parameters: any;
}

interface MusicTrack {
    id: string;
    audioId: string;
    volume: number;
    fadeInTime: number;
    fadeOutTime: number;
    loop: boolean;
    crossfadeTime: number;
    layers: MusicLayer[];
    stingers: MusicStinger[];
    transitions: MusicTransition[];
}

interface MusicTrackOptions {
    volume?: number;
    fadeInTime?: number;
    fadeOutTime?: number;
    loop?: boolean;
    crossfadeTime?: number;
    layers?: MusicLayer[];
    stingers?: MusicStinger[];
    transitions?: MusicTransition[];
}

interface MusicLayer {
    audioId: string;
    triggerIntensity: number;
    volume: number;
}

interface MusicStinger {
    audioId: string;
    triggerEvent: string;
    volume: number;
}

interface MusicTransition {
    fromTrack: string;
    toTrack: string;
    fadeTime: number;
    conditions: any[];
}

interface DynamicMusicSystem {
    id: string;
    states: Map<string, MusicState>;
    transitions: StateTransition[];
    currentState: string | null;
    parameters: Map<string, number>;
    intensity: number;
    tension: number;
}

interface MusicState {
    id: string;
    tracks: string[];
    conditions: any;
    active: boolean;
}

interface StateTransition {
    fromState: string;
    toState: string;
    condition: any;
    targetState: string;
}

type ProceduralAudioType = 'noise' | 'tone' | 'drum' | 'ambient';

interface ProceduralAudioGenerator {
    id: string;
    type: ProceduralAudioType;
    config: any;
    isPlaying: boolean;
    source: AudioBufferSourceNode | OscillatorNode | null;
    scriptProcessor: ScriptProcessorNode | null;
}

interface SpeechSynthesizer {
    speak(text: string, options: SpeechSynthesisOptions): void;
    stop(): void;
}

class SpeechSynthesizer {
    constructor(private audioContext: AudioContext) {}

    speak(text: string, options: SpeechSynthesisOptions = {}): void {
        if (!('speechSynthesis' in window)) return;

        const utterance = new SpeechSynthesisUtterance(text);

        if (options.voice) utterance.voice = options.voice;
        if (options.rate !== undefined) utterance.rate = options.rate;
        if (options.pitch !== undefined) utterance.pitch = options.pitch;
        if (options.volume !== undefined) utterance.volume = options.volume;
        if (options.lang) utterance.lang = options.lang;

        window.speechSynthesis.speak(utterance);
    }

    stop(): void {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }
}

interface SpeechSynthesisOptions {
    voice?: SpeechSynthesisVoice;
    rate?: number;
    pitch?: number;
    volume?: number;
    lang?: string;
}

interface AudioZone {
    id: string;
    position: Vec3;
    size: Vec3;
    config: AudioZoneConfig;
    activeSources: Set<string>;
}

interface AudioZoneConfig {
    reverb: number;
    filter: number;
    volume: number;
    effects: string[];
}

type DistanceModelType = 'linear' | 'inverse' | 'exponential';

interface AudioScript {
    id: string;
    function: AudioScriptFunction;
    isActive: boolean;
}

type AudioScriptFunction = (context: AudioScriptContext) => void;

interface AudioScriptContext {
    audioSystem: any;
    time: number;
    deltaTime: number;
    parameters: Map<string, any>;
}
