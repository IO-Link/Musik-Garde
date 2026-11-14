// Music Player App - Musik Garde

class MusicPlayer {
    constructor() {
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;

        // UI Elements
        this.selectFilesBtn = document.getElementById('selectFilesBtn');
        this.fileInput = document.getElementById('fileInput');
        this.fileCount = document.getElementById('fileCount');
        this.currentTitle = document.getElementById('currentTitle');
        this.currentTime = document.getElementById('currentTime');
        this.duration = document.getElementById('duration');
        this.progressBar = document.getElementById('progressBar');
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.volumeValue = document.getElementById('volumeValue');
        this.muteBtn = document.getElementById('muteBtn');
        this.playlistContainer = document.getElementById('playlist');

        this.isMuted = false;
        this.previousVolume = 70;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.registerServiceWorker();
    }

    setupEventListeners() {
        // File selection
        this.selectFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));

        // Playback controls
        this.playBtn.addEventListener('click', () => this.play());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.prevBtn.addEventListener('click', () => this.previous());
        this.nextBtn.addEventListener('click', () => this.next());

        // Volume control
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.muteBtn.addEventListener('click', () => this.toggleMute());

        // Progress bar
        this.progressBar.addEventListener('input', (e) => this.seek(e.target.value));

        // Audio events
        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgressBar());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('ended', () => this.next());
        this.audioPlayer.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayButton();
        });
        this.audioPlayer.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
    }

    handleFileSelection(event) {
        const files = Array.from(event.target.files);
        
        // Filter for MP3 files only
        const mp3Files = files.filter(file => 
            file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
        );

        if (mp3Files.length === 0) {
            alert('Bitte wählen Sie MP3-Dateien aus');
            return;
        }

        // Create file objects with ObjectURLs and extract metadata
        this.playlist = mp3Files.map(file => ({
            file: file,
            url: URL.createObjectURL(file),
            artist: 'Unbekannter Künstler',
            title: file.name.replace(/\.mp3$/i, ''),
            year: ''
        }));

        // Extract metadata from all files
        this.playlist.forEach((track, index) => {
            this.extractMetadata(track.file, index);
        });

        this.currentTrackIndex = 0;
        this.updateFileCount();
        this.renderPlaylist();
        this.loadTrack(0);
    }

    extractMetadata(file, index) {
        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const tags = tag.tags;
                const track = this.playlist[index];

                if (tags.artist) {
                    track.artist = tags.artist;
                }
                if (tags.title) {
                    track.title = tags.title;
                }
                if (tags.year) {
                    track.year = tags.year;
                }

                // Update UI if this is current track
                if (index === this.currentTrackIndex) {
                    this.updateNowPlaying();
                }

                // Re-render playlist to show updated metadata
                this.renderPlaylist();
            },
            onError: (error) => {
                console.log('Error reading metadata for', file.name, error);
                // File is still playable, just without metadata
            }
        });
    }

    updateFileCount() {
        const count = this.playlist.length;
        this.fileCount.textContent = count > 0 
            ? `${count} Datei${count !== 1 ? 'en' : ''} geladen`
            : '';
    }

    renderPlaylist() {
        if (this.playlist.length === 0) {
            this.playlistContainer.innerHTML = '<p class="empty-message">Keine Dateien importiert</p>';
            return;
        }

        this.playlistContainer.innerHTML = this.playlist.map((track, index) => {
            const displayText = track.year 
                ? `${track.artist} - ${track.title} - ${track.year}`
                : `${track.artist} - ${track.title}`;
            
            return `
                <div class="playlist-item ${index === this.currentTrackIndex ? 'active' : ''}" 
                     data-index="${index}">
                    <span class="playlist-item-number">${index + 1}</span>
                    <span class="playlist-item-name">${displayText}</span>
                </div>
            `;
        }).join('');

        // Add click handlers
        this.playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.loadTrack(index);
                this.play();
            });
        });
    }

    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentTrackIndex = index;
        const track = this.playlist[index];
        
        this.audioPlayer.src = track.url;
        
        this.updatePlaylistUI();
        this.resetProgressBar();
        this.updateDuration();
        this.updateNowPlaying();
    }

    updateNowPlaying() {
        const track = this.playlist[this.currentTrackIndex];
        const displayText = track.year 
            ? `${track.artist} - ${track.title} - ${track.year}`
            : `${track.artist} - ${track.title}`;
        
        this.currentTitle.textContent = displayText;
    }

    updatePlaylistUI() {
        document.querySelectorAll('.playlist-item').forEach((item, index) => {
            item.classList.toggle('active', index === this.currentTrackIndex);
        });
    }

    play() {
        if (this.playlist.length === 0) {
            alert('Bitte importieren Sie zuerst MP3-Dateien');
            return;
        }
        this.audioPlayer.play().catch(err => {
            console.error('Fehler beim Abspielen:', err);
        });
    }

    pause() {
        this.audioPlayer.pause();
    }

    stop() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.resetProgressBar();
    }

    next() {
        if (this.playlist.length === 0) return;
        
        let nextIndex = this.currentTrackIndex + 1;
        if (nextIndex >= this.playlist.length) {
            nextIndex = 0; // Loop to beginning
        }
        
        this.loadTrack(nextIndex);
        if (this.isPlaying) {
            this.play();
        }
    }

    previous() {
        if (this.playlist.length === 0) return;
        
        let prevIndex = this.currentTrackIndex - 1;
        if (prevIndex < 0) {
            prevIndex = this.playlist.length - 1; // Loop to end
        }
        
        this.loadTrack(prevIndex);
        if (this.isPlaying) {
            this.play();
        }
    }

    seek(percentage) {
        const duration = this.audioPlayer.duration;
        if (isFinite(duration)) {
            this.audioPlayer.currentTime = (percentage / 100) * duration;
        }
    }

    setVolume(value) {
        const volume = value / 100;
        this.audioPlayer.volume = volume;
        this.volumeValue.textContent = `${value}%`;
        
        if (this.isMuted && volume > 0) {
            this.isMuted = false;
            this.updateMuteButton();
        }
    }

    toggleMute() {
        if (this.isMuted) {
            // Unmute
            this.audioPlayer.volume = this.previousVolume / 100;
            this.volumeSlider.value = this.previousVolume;
            this.volumeValue.textContent = `${this.previousVolume}%`;
            this.isMuted = false;
        } else {
            // Mute
            this.previousVolume = this.volumeSlider.value;
            this.audioPlayer.volume = 0;
            this.volumeValue.textContent = '0%';
            this.isMuted = true;
        }
        this.updateMuteButton();
    }

    updateMuteButton() {
        if (this.isMuted) {
            this.muteBtn.textContent = '🔇';
            this.muteBtn.title = 'Lautstärke einschalten';
        } else {
            this.muteBtn.textContent = '🔊';
            this.muteBtn.title = 'Stummschalten';
        }
    }

    updateProgressBar() {
        const duration = this.audioPlayer.duration;
        if (isFinite(duration) && duration > 0) {
            const percentage = (this.audioPlayer.currentTime / duration) * 100;
            this.progressBar.value = percentage;
        }

        this.currentTime.textContent = this.formatTime(this.audioPlayer.currentTime);
    }

    updateDuration() {
        this.duration.textContent = this.formatTime(this.audioPlayer.duration);
    }

    resetProgressBar() {
        this.progressBar.value = 0;
        this.currentTime.textContent = '0:00';
    }

    updatePlayButton() {
        if (this.isPlaying) {
            this.playBtn.disabled = true;
            this.pauseBtn.disabled = false;
        } else {
            this.playBtn.disabled = false;
            this.pauseBtn.disabled = true;
        }
    }

    formatTime(seconds) {
        if (!isFinite(seconds)) return '0:00';
        
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
});
