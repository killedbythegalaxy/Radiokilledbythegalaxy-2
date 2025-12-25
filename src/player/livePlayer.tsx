// LivePlayer State Management
export interface LivePlayerState {
  status: 'INTRO' | 'LIVE_CONNECTING' | 'LIVE_ON_AIR' | 'LIVE_RECONNECTING' | 'LIVE_UNAVAILABLE';
  isPlaying: boolean;
  volume: number;
  currentTime: number;
  duration: number;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
}

export interface LivePlayerCallbacks {
  onStateChange: (state: LivePlayerState) => void;
  onFrequencyData: (data: Uint8Array) => void;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
}

export class LivePlayer {
  private state: LivePlayerState;
  private callbacks: LivePlayerCallbacks;
  private introAudio: HTMLAudioElement | null = null;
  private liveAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array | null = null;
  private animationFrame: number | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private crossfadeTimeout: NodeJS.Timeout | null = null;

  constructor(callbacks: LivePlayerCallbacks) {
    this.callbacks = callbacks;
    this.state = {
      status: 'INTRO',
      isPlaying: false,
      volume: 0.5,
      currentTime: 0,
      duration: 0,
      reconnectAttempts: 0,
      maxReconnectAttempts: 10
    };
  }

  async init(): Promise<void> {
    try {
      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create analyser for frequency data
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.connect(this.audioContext.destination);

      // Create intro audio element
      this.introAudio = new Audio('/music/intro.mp3');
      this.introAudio.crossOrigin = 'anonymous';
      this.introAudio.preload = 'auto';
      this.introAudio.volume = this.state.volume;

      // Create live audio element
      this.liveAudio = new Audio();
      this.liveAudio.crossOrigin = 'anonymous';
      this.liveAudio.volume = this.state.volume;

      // Set up event listeners
      this.setupIntroListeners();
      this.setupLiveListeners();

      // Start frequency analysis
      this.startFrequencyAnalysis();

      this.updateState({ status: 'INTRO' });
    } catch (error) {
      console.error('Failed to initialize LivePlayer:', error);
      this.updateState({ status: 'LIVE_UNAVAILABLE' });
    }
  }

  private setupIntroListeners(): void {
    if (!this.introAudio) return;

    this.introAudio.addEventListener('loadedmetadata', () => {
      if (this.introAudio) {
        this.updateState({ duration: this.introAudio.duration });
      }
    });

    this.introAudio.addEventListener('timeupdate', () => {
      if (this.introAudio) {
        const currentTime = this.introAudio.currentTime;
        this.updateState({ currentTime });
        this.callbacks.onTimeUpdate(currentTime);
      }
    });

    this.introAudio.addEventListener('ended', () => {
      this.updateState({ isPlaying: false });
      // Auto-transition to live when intro ends
      this.goLiveNow();
    });

    this.introAudio.addEventListener('play', () => {
      this.updateState({ isPlaying: true });
    });

    this.introAudio.addEventListener('pause', () => {
      this.updateState({ isPlaying: false });
    });

    this.introAudio.addEventListener('error', (e) => {
      console.warn('Intro audio not available, skipping to live stream');
      // Skip intro and go directly to live stream
      this.goLiveNow();
    });

    this.introAudio.addEventListener('canplaythrough', () => {
      console.log('Intro audio loaded successfully');
    });
  }

  private setupLiveListeners(): void {
    if (!this.liveAudio) return;

    this.liveAudio.addEventListener('canplay', () => {
      if (this.state.status === 'LIVE_CONNECTING') {
        this.updateState({ status: 'LIVE_ON_AIR', isPlaying: true });
        this.startCrossfade();
      }
    });

    this.liveAudio.addEventListener('play', () => {
      if (this.state.status === 'LIVE_ON_AIR') {
        this.updateState({ isPlaying: true });
      }
    });

    this.liveAudio.addEventListener('pause', () => {
      this.updateState({ isPlaying: false });
    });

    this.liveAudio.addEventListener('error', () => {
      console.warn('Live stream error, attempting reconnect...');
      this.handleLiveError();
    });

    this.liveAudio.addEventListener('stalled', () => {
      console.warn('Live stream stalled, attempting reconnect...');
      this.handleLiveError();
    });

    this.liveAudio.addEventListener('loadstart', () => {
      console.log('Starting to load live stream...');
    });

    this.liveAudio.addEventListener('canplaythrough', () => {
      console.log('Live stream loaded successfully');
    });
  }

  private startFrequencyAnalysis(): void {
    const analyze = () => {
      if (this.analyser && this.frequencyData) {
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.callbacks.onFrequencyData(this.frequencyData);
      }
      this.animationFrame = requestAnimationFrame(analyze);
    };
    analyze();
  }

  private updateState(updates: Partial<LivePlayerState>): void {
    this.state = { ...this.state, ...updates };
    this.callbacks.onStateChange(this.state);
  }

  private connectAudioSource(audio: HTMLAudioElement): void {
    if (!this.audioContext || !this.analyser) return;

    try {
      const source = this.audioContext.createMediaElementSource(audio);
      source.connect(this.analyser);
    } catch (error) {
      // Source might already be connected, ignore error
    }
  }

  private startCrossfade(): void {
    if (!this.introAudio || !this.liveAudio) return;

    // Clear any existing crossfade
    if (this.crossfadeTimeout) {
      clearTimeout(this.crossfadeTimeout);
    }

    const duration = 2000; // 2 seconds
    const steps = 50;
    const stepDuration = duration / steps;
    let step = 0;

    const crossfade = () => {
      if (!this.introAudio || !this.liveAudio) return;

      const progress = step / steps;
      const introVolume = (1 - progress) * this.state.volume;
      const liveVolume = progress * this.state.volume;

      this.introAudio.volume = Math.max(0, introVolume);
      this.liveAudio.volume = Math.max(0, liveVolume);

      step++;

      if (step <= steps) {
        this.crossfadeTimeout = setTimeout(crossfade, stepDuration);
      } else {
        // Crossfade complete
        this.introAudio.pause();
        this.introAudio.currentTime = 0;
      }
    };

    crossfade();
  }

  private handleLiveError(): void {
    const attempts = this.state.reconnectAttempts + 1;
    
    if (attempts >= this.state.maxReconnectAttempts) {
      this.updateState({ 
        status: 'LIVE_UNAVAILABLE', 
        isPlaying: false,
        reconnectAttempts: attempts 
      });
      return;
    }

    this.updateState({ 
      status: 'LIVE_RECONNECTING', 
      reconnectAttempts: attempts 
    });

    // Attempt reconnect after delay
    this.reconnectTimeout = setTimeout(() => {
      this.goLiveNow();
    }, 3000);
  }

  togglePlayPause(): void {
    if (this.state.status === 'INTRO') {
      if (this.state.isPlaying) {
        this.introAudio?.pause();
      } else {
        this.introAudio?.play().catch(console.error);
        this.connectAudioSource(this.introAudio!);
      }
    } else if (this.state.status === 'LIVE_ON_AIR') {
      if (this.state.isPlaying) {
        this.liveAudio?.pause();
      } else {
        this.liveAudio?.play().catch(console.error);
      }
    }
  }

  goLiveNow(): void {
    if (!this.liveAudio) return;

    // Clear any existing reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.updateState({ 
      status: 'LIVE_CONNECTING',
      reconnectAttempts: 0 
    });

    // Set live stream URL with fallback
    const streamUrls = [
      'https://radio.killedbythegalaxy.com/radio/8000/radio.mp3',
      'https://stream.zeno.fm/your-fallback-stream', // Add fallback stream
      '/music/intro.mp3' // Local fallback
    ];
    
    this.tryStreamUrls(streamUrls, 0);
  }

  private tryStreamUrls(urls: string[], index: number): void {
    if (!this.liveAudio || index >= urls.length) {
      this.handleLiveError();
      return;
    }

    const url = urls[index];
    console.log(`Trying stream URL ${index + 1}/${urls.length}: ${url}`);
    
    this.liveAudio.src = url;
    this.liveAudio.load();
    
    this.connectAudioSource(this.liveAudio);
    
    const playPromise = this.liveAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        console.warn(`Failed to play stream ${index + 1}, trying next...`);
        setTimeout(() => {
          this.tryStreamUrls(urls, index + 1);
        }, 1000);
      });
    }

    // Set a timeout to try next URL if this one doesn't work
    setTimeout(() => {
      if (this.state.status === 'LIVE_CONNECTING') {
        console.warn(`Stream ${index + 1} timeout, trying next...`);
        this.tryStreamUrls(urls, index + 1);
      }
    }, 5000);
  }

  setVolume(volume: number): void {
    this.updateState({ volume });
    
    if (this.introAudio) {
      this.introAudio.volume = volume;
    }
    if (this.liveAudio) {
      this.liveAudio.volume = volume;
    }
  }

  teardown(): void {
    // Clear timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.crossfadeTimeout) {
      clearTimeout(this.crossfadeTimeout);
    }
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }

    // Stop and cleanup audio
    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio.src = '';
      this.introAudio.load();
    }
    if (this.liveAudio) {
      this.liveAudio.pause();
      this.liveAudio.src = '';
      this.liveAudio.load();
    }

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }
}