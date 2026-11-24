// LED-style spectrum analyzer for the currently playing track.
// Reads the audio element via the Web Audio API and draws segmented bars on a canvas.

class SpectrumAnalyzer {
    constructor(audioElement, canvas, options = {}) {
        this.audio = audioElement;
        this.canvas = canvas;
        this.ctx2d = canvas.getContext('2d');

        this.barCount = options.barCount || 20;
        this.segmentCount = options.segmentCount || 16;
        this.minFreq = options.minFreq || 40;
        this.maxFreq = options.maxFreq || 16000;

        this.audioCtx = null;
        this.analyser = null;
        this.data = null;
        this.levels = new Array(this.barCount).fill(0);
        this.binRanges = null;
        this.rafId = null;
        this.running = false;
        this.unavailable = false;

        this.resize = this.resize.bind(this);
        this.draw = this.draw.bind(this);

        window.addEventListener('resize', this.resize);
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.cancelFrame();
            } else if (this.running || this.hasEnergy()) {
                this.scheduleFrame();
            }
        });
        this.resize();
    }

    // Create the audio graph lazily. Must happen after a user gesture (play click).
    setupAudio() {
        if (this.audioCtx || this.unavailable) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) throw new Error('Web Audio API not supported');

            const audioCtx = new AudioCtx();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.6;
            analyser.minDecibels = -85;
            analyser.maxDecibels = -25;

            // Last step that can throw. Until it succeeds, audio keeps playing natively.
            const source = audioCtx.createMediaElementSource(this.audio);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);

            this.audioCtx = audioCtx;
            this.analyser = analyser;
            this.data = new Uint8Array(analyser.frequencyBinCount);
            this.computeBinRanges();
        } catch (err) {
            console.warn('Spectrum analyzer unavailable:', err);
            this.unavailable = true;
        }
    }

    // Logarithmic frequency bands, one per bar.
    computeBinRanges() {
        const nyquist = this.audioCtx.sampleRate / 2;
        const binCount = this.analyser.frequencyBinCount;
        const ratio = this.maxFreq / this.minFreq;
        this.binRanges = [];
        for (let i = 0; i < this.barCount; i++) {
            const f0 = this.minFreq * Math.pow(ratio, i / this.barCount);
            const f1 = this.minFreq * Math.pow(ratio, (i + 1) / this.barCount);
            const start = Math.min(binCount - 1, Math.floor((f0 / nyquist) * binCount));
            const end = Math.min(binCount, Math.max(start + 1, Math.ceil((f1 / nyquist) * binCount)));
            this.binRanges.push([start, end]);
        }
    }

    start() {
        this.setupAudio();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
        this.running = true;
        this.scheduleFrame();
    }

    // Bars fall back to zero, then the animation loop ends.
    stop() {
        this.running = false;
        this.scheduleFrame();
    }

    hasEnergy() {
        return this.levels.some(l => l > 0.01);
    }

    scheduleFrame() {
        if (this.rafId === null && !document.hidden) {
            this.rafId = requestAnimationFrame(this.draw);
        }
    }

    cancelFrame() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        this.canvas.width = Math.round(rect.width * dpr);
        this.canvas.height = Math.round(rect.height * dpr);
        this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.cssWidth = rect.width;
        this.cssHeight = rect.height;
        this.render();
    }

    readLevels() {
        const live = this.running && this.analyser && !this.audio.paused;
        if (live) this.analyser.getByteFrequencyData(this.data);

        for (let i = 0; i < this.barCount; i++) {
            let target = 0;
            if (live) {
                const [start, end] = this.binRanges[i];
                let sum = 0;
                for (let b = start; b < end; b++) sum += this.data[b];
                const avg = sum / (end - start) / 255;
                // Slight boost for higher bands, which carry less energy in music.
                const tilt = 1 + (i / this.barCount) * 0.5;
                target = Math.min(1, Math.pow(avg, 1.3) * tilt);
            }
            // Fast rise, slower fall.
            const current = this.levels[i];
            this.levels[i] = target > current
                ? current + (target - current) * 0.6
                : current + (target - current) * 0.15;
            if (this.levels[i] < 0.005) this.levels[i] = 0;
        }
    }

    draw() {
        this.rafId = null;
        this.readLevels();
        this.render();
        if (this.running || this.hasEnergy()) this.scheduleFrame();
    }

    // Bottom cyan -> middle violet -> top pink.
    segmentColor(t) {
        const stops = [
            [0.0, [0, 200, 255]],
            [0.5, [140, 110, 210]],
            [1.0, [255, 0, 128]]
        ];
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const [t0, c0] = stops[i - 1];
                const [t1, c1] = stops[i];
                const k = (t - t0) / (t1 - t0);
                const rgb = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
                return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            }
        }
        return 'rgb(255, 0, 128)';
    }

    render() {
        const w = this.cssWidth;
        const h = this.cssHeight;
        if (!w || !h) return;

        const g = this.ctx2d;
        g.clearRect(0, 0, w, h);

        const gapX = Math.max(2, w * 0.012);
        const barWidth = (w - gapX * (this.barCount - 1)) / this.barCount;
        const gapY = Math.max(1, h * 0.02);
        const segHeight = (h - gapY * (this.segmentCount - 1)) / this.segmentCount;

        for (let i = 0; i < this.barCount; i++) {
            const lit = Math.round(this.levels[i] * this.segmentCount);
            const x = i * (barWidth + gapX);
            for (let s = 0; s < lit; s++) {
                const y = h - (s + 1) * segHeight - s * gapY;
                g.fillStyle = this.segmentColor(s / (this.segmentCount - 1));
                g.fillRect(x, y, barWidth, segHeight);
            }
        }
    }
}
