// Music Player App - Musik Garde

class MusicPlayer {
    constructor() {
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.draggingIndex = null;
        this.fileCache = {}; // Cache blob URLs in memory

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
        this.autoplay = true; // Default to enabled

        this.init();
    }

    init() {
        this.initializeDB().then(() => {
            this.loadPlaylistFromStorage();
            this.loadAutoplaySetting();
            this.setupEventListeners();
            this.renderPlaylist();
            
            // Restore files from DB and then load track
            this.restoreFilesFromDB().then(() => {
                if (this.playlist.length > 0) {
                    this.loadTrack(0);
                }
                this.registerServiceWorker();
            });
        });
    }

    restoreFilesFromDB() {
        return new Promise((resolve) => {
            if (!this.db || this.playlist.length === 0) {
                resolve();
                return;
            }

            const promises = this.playlist.map(track => 
                this.getFileFromDB(track.filename).then(blobUrl => {
                    this.fileCache[track.filename] = blobUrl;
                    console.log('Restored from DB:', track.filename);
                }).catch(err => {
                    console.log('File not in DB:', track.filename);
                })
            );

            Promise.all(promises).then(() => resolve());
        });
    }

    initializeDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open('MusicGardeDB', 1);

            request.onerror = () => {
                console.error('IndexedDB failed, continuing without persistence');
                resolve();
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'filename' });
                }
            };
        });
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

        // Autoplay toggle
        document.getElementById('autoplayToggle').addEventListener('change', (e) => {
            this.autoplay = e.target.checked;
            localStorage.setItem('musikGardeAutoplay', JSON.stringify(this.autoplay));
            console.log('Autoplay:', this.autoplay);
        });

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
        console.log('Selected files:', files);
        
        // Filter for MP3 files only
        const mp3Files = files.filter(file => 
            file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
        );

        console.log('MP3 files after filter:', mp3Files);

        if (mp3Files.length === 0) {
            alert('Bitte wählen Sie MP3-Dateien aus');
            return;
        }

        // Add new files to existing playlist
        mp3Files.forEach(file => {
            // Create blob URL and cache it
            const blobUrl = URL.createObjectURL(file);
            this.fileCache[file.name] = blobUrl;
            
            // Save to IndexedDB for persistence
            if (this.db) {
                this.saveFileToDB(file);
            }
            
            const track = {
                filename: file.name,
                artist: 'Unbekannter Künstler',
                title: file.name.replace(/\.mp3$/i, ''),
                year: ''
            };
            
            this.playlist.push(track);
            this.extractMetadata(file, this.playlist.length - 1);
        });

        this.updateFileCount();
        this.savePlaylistMetadataToStorage();
        this.renderPlaylist();
        
        // Load first track if nothing is loaded yet
        if (this.currentTrackIndex === 0 && !this.audioPlayer.src) {
            this.loadTrack(0);
        }
    }

    saveFileToDB(file) {
        if (!this.db) return;

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const transaction = this.db.transaction(['files'], 'readwrite');
                const store = transaction.objectStore('files');
                
                const fileData = {
                    filename: file.name,
                    data: reader.result
                };
                
                store.put(fileData);
                console.log('Saved to IndexedDB:', file.name);
            } catch (e) {
                console.error('Error saving to IndexedDB:', e);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    getFileFromDB(filename) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject('IndexedDB not available');
                return;
            }
            
            try {
                const transaction = this.db.transaction(['files'], 'readonly');
                const store = transaction.objectStore('files');
                const request = store.get(filename);
                
                request.onsuccess = () => {
                    if (request.result && request.result.data) {
                        const blob = new Blob([request.result.data], { type: 'audio/mpeg' });
                        const blobUrl = URL.createObjectURL(blob);
                        resolve(blobUrl);
                    } else {
                        reject('File not found');
                    }
                };
                
                request.onerror = () => reject('DB read failed');
            } catch (e) {
                reject(e);
            }
        });
    }

    deleteFileFromDB(filename) {
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            store.delete(filename);
            console.log('Deleted from IndexedDB:', filename);
        } catch (e) {
            console.error('Error deleting from IndexedDB:', e);
        }
    }

    extractMetadata(file, index) {
        // Only extract if jsmediatags library is available
        if (typeof jsmediatags === 'undefined') {
            console.log('jsmediatags library not loaded, using filename as title');
            return;
        }

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

                // Save to storage
                this.savePlaylistMetadataToStorage();

                // Re-render playlist to show updated metadata
                this.renderPlaylist();
            },
            onError: (error) => {
                console.log('Error reading metadata for', file.name, error);
                // File is still playable, just without metadata
            }
        });
    }

    savePlaylistMetadataToStorage() {
        // Save ONLY metadata to localStorage (not the actual files)
        const metadata = this.playlist.map(track => ({
            filename: track.filename,
            artist: track.artist,
            title: track.title,
            year: track.year
        }));
        localStorage.setItem('musikGardePlaylist', JSON.stringify(metadata));
    }

    loadPlaylistFromStorage() {
        const stored = localStorage.getItem('musikGardePlaylist');
        if (stored) {
            try {
                this.playlist = JSON.parse(stored);
                console.log('Loaded playlist metadata:', this.playlist.length, 'tracks');
            } catch (e) {
                console.error('Error loading playlist:', e);
                this.playlist = [];
            }
        }
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
            // Use filename if artist is empty
            const artist = track.artist && track.artist !== 'Unbekannter Künstler' ? track.artist : '';
            const displayText = artist
                ? (track.year 
                    ? `${artist} - ${track.title} - ${track.year}`
                    : `${artist} - ${track.title}`)
                : track.title || track.filename;
            
            // Remove .mp3 extension from filename display
            const filenameDisplay = track.filename.replace(/\.mp3$/i, '');
            
            return `
                <div class="playlist-item ${index === this.currentTrackIndex ? 'active' : ''}" 
                     data-index="${index}"
                     draggable="true">
                    <span class="playlist-item-drag-handle">⋮⋮</span>
                    <span class="playlist-item-number">${index + 1}</span>
                    <div class="playlist-item-content">
                        <span class="playlist-item-name">${displayText}</span>
                        <span class="playlist-item-filename">${filenameDisplay}</span>
                    </div>
                    <button class="playlist-item-delete" data-index="${index}" title="Löschen">✕</button>
                </div>
            `;
        }).join('');

        // Add click handlers for playing
        this.playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't play if clicking delete button or drag handle
                if (e.target.classList.contains('playlist-item-delete') || 
                    e.target.classList.contains('playlist-item-drag-handle')) {
                    return;
                }
                const index = parseInt(item.dataset.index);
                this.loadTrack(index);
                if (this.autoplay) {
                    this.play();
                }
            });
        });

        // Add drag and drop handlers
        this.playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('dragstart', (e) => this.handleDragStart(e));
            item.addEventListener('dragover', (e) => this.handleDragOver(e));
            item.addEventListener('drop', (e) => this.handleDrop(e));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));
        });

        // Add delete handlers
        this.playlistContainer.querySelectorAll('.playlist-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.deleteTrack(index);
            });
        });
    }

    handleDragStart(e) {
        this.draggingIndex = parseInt(e.target.closest('.playlist-item').dataset.index);
        e.target.closest('.playlist-item').style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const item = e.target.closest('.playlist-item');
        if (item && item.dataset.index !== this.draggingIndex.toString()) {
            item.style.borderTop = '3px solid var(--success)';
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const dropIndex = parseInt(e.target.closest('.playlist-item').dataset.index);
        
        if (this.draggingIndex !== null && this.draggingIndex !== dropIndex) {
            // Reorder playlist
            const draggedTrack = this.playlist[this.draggingIndex];
            this.playlist.splice(this.draggingIndex, 1);
            this.playlist.splice(dropIndex, 0, draggedTrack);

            // Update current track index if needed
            if (this.currentTrackIndex === this.draggingIndex) {
                this.currentTrackIndex = dropIndex;
            } else if (this.draggingIndex < this.currentTrackIndex && dropIndex >= this.currentTrackIndex) {
                this.currentTrackIndex--;
            } else if (this.draggingIndex > this.currentTrackIndex && dropIndex <= this.currentTrackIndex) {
                this.currentTrackIndex++;
            }

            this.savePlaylistMetadataToStorage();
            this.renderPlaylist();
        }
    }

    handleDragEnd(e) {
        e.target.closest('.playlist-item').style.opacity = '1';
        document.querySelectorAll('.playlist-item').forEach(item => {
            item.style.borderTop = '';
        });
        this.draggingIndex = null;
    }

    deleteTrack(index) {
        if (confirm(`"${this.playlist[index].title}" löschen?`)) {
            const filename = this.playlist[index].filename;
            
            // Clear from cache and DB
            delete this.fileCache[filename];
            this.deleteFileFromDB(filename);
            
            this.playlist.splice(index, 1);
            
            // Adjust current track index
            if (index === this.currentTrackIndex) {
                if (this.playlist.length > 0) {
                    this.currentTrackIndex = Math.min(index, this.playlist.length - 1);
                    this.loadTrack(this.currentTrackIndex);
                } else {
                    this.currentTrackIndex = 0;
                    this.stop();
                }
            } else if (index < this.currentTrackIndex) {
                this.currentTrackIndex--;
            }

            this.updateFileCount();
            this.savePlaylistMetadataToStorage();
            this.renderPlaylist();
        }
    }

    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentTrackIndex = index;
        const track = this.playlist[index];
        
        // Use cached blob URL
        const blobUrl = this.fileCache[track.filename];
        
        if (blobUrl) {
            this.audioPlayer.src = blobUrl;
            this.updatePlaylistUI();
            this.resetProgressBar();
            this.updateDuration();
            this.updateNowPlaying();
        } else {
            console.error('File not in cache:', track.filename);
            alert('Musikdatei nicht verfügbar. Bitte erneut importieren.');
        }
    }

    updateNowPlaying() {
        const track = this.playlist[this.currentTrackIndex];
        // Use filename as artist if artist is empty
        const artist = track.artist && track.artist !== 'Unbekannter Künstler' ? track.artist : '';
        const displayText = artist
            ? (track.year 
                ? `${artist} - ${track.title} - ${track.year}`
                : `${artist} - ${track.title}`)
            : track.title || track.filename;
        
        // Remove .mp3 extension from filename display
        const filenameDisplay = track.filename.replace(/\.mp3$/i, '');
        
        this.currentTitle.textContent = displayText;
        document.getElementById('currentFilename').textContent = filenameDisplay;
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

    savePlaylistMetadataToStorage() {
        // Save ONLY metadata to localStorage (not the actual files)
        const metadata = this.playlist.map(track => ({
            filename: track.filename,
            artist: track.artist,
            title: track.title,
            year: track.year
        }));
        localStorage.setItem('musikGardePlaylist', JSON.stringify(metadata));
    }

    loadPlaylistFromStorage() {
        const stored = localStorage.getItem('musikGardePlaylist');
        if (stored) {
            try {
                this.playlist = JSON.parse(stored);
                console.log('Loaded playlist metadata:', this.playlist.length, 'tracks');
            } catch (e) {
                console.error('Error loading playlist:', e);
                this.playlist = [];
            }
        }
    }

    loadAutoplaySetting() {
        const stored = localStorage.getItem('musikGardeAutoplay');
        if (stored) {
            try {
                this.autoplay = JSON.parse(stored);
                document.getElementById('autoplayToggle').checked = this.autoplay;
            } catch (e) {
                console.error('Error loading autoplay setting:', e);
            }
        }
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
