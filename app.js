// Music Player App - Musik Garde
// Updated: Fix autoplay OFF behavior - loadedTrackIndex reset on stop
// Test clone from GitHub Desktop - Nov 14, 2026

class MusicPlayer {
    constructor() {
        this.audioPlayer = document.getElementById('audioPlayer');
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.isPlaying = false;
        this.draggingIndex = null;
        this.fileCache = {};

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
        this.autoplay = true;
        this.db = null;
        this.loadedTrackIndex = -1; // Track which song is loaded in audio
        this.wakeLock = null;

        this.init();
    }

    init() {
        this.initializeDB().then(() => {
            this.loadPlaylistFromStorage();
            this.setupEventListeners();
            this.loadAutoplaySetting();
            this.renderPlaylist();
            
            // Restore files from DB
            this.restoreFilesFromDB().then(() => {
                if (this.playlist.length > 0) {
                    this.loadTrack(0).then(() => {
                        this.registerServiceWorker();
                        this.checkForUpdates();
                    });
                } else {
                    this.registerServiceWorker();
                    this.checkForUpdates();
                }
            });
        });
    }

    initializeDB() {
        return new Promise((resolve) => {
            const request = indexedDB.open('MusicGardeDB', 2);
            request.onerror = () => resolve();
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Delete old store if it exists
                if (db.objectStoreNames.contains('files')) {
                    db.deleteObjectStore('files');
                }
                // Create new store with 'id' as keyPath
                db.createObjectStore('files', { keyPath: 'id' });
            };
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
                    console.log('Restored:', track.filename);
                }).catch(err => {
                    console.log('File not in DB:', track.filename);
                })
            );

            Promise.all(promises).then(() => resolve());
        });
    }

    setupEventListeners() {
        this.selectFilesBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));

        this.playBtn.addEventListener('click', () => this.play());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.prevBtn.addEventListener('click', () => this.previous());
        this.nextBtn.addEventListener('click', () => this.next());

        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
        this.muteBtn.addEventListener('click', () => this.toggleMute());

        document.getElementById('autoplayToggle').addEventListener('change', (e) => {
            this.autoplay = e.target.checked;
            localStorage.setItem('musikGardeAutoplay', JSON.stringify(this.autoplay));
            console.log('Autoplay:', this.autoplay);
        });

        this.progressBar.addEventListener('input', (e) => this.seek(e.target.value));

        this.audioPlayer.addEventListener('timeupdate', () => this.updateProgressBar());
        this.audioPlayer.addEventListener('loadedmetadata', () => this.updateDuration());
        this.audioPlayer.addEventListener('ended', () => {
            if (this.autoplay) {
                // Load next track and play it immediately
                this.next();
            } else {
                // Just stop, don't auto-advance
                this.stop();
            }
        });
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
        const mp3Files = files.filter(file => 
            file.type === 'audio/mpeg' || file.name.toLowerCase().endsWith('.mp3')
        );

        if (mp3Files.length === 0) {
            alert('Bitte wählen Sie MP3-Dateien aus');
            return;
        }

        mp3Files.forEach(file => {
            const blobUrl = URL.createObjectURL(file);
            this.fileCache[file.name] = blobUrl;
            
            // Save to IndexedDB
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
                
                const compoundKey = `${file.name}_${file.size}_${file.lastModified}`;
                const fileData = {
                    id: compoundKey,
                    filename: file.name,
                    data: reader.result
                };
                
                store.put(fileData);
            } catch (e) {
                console.error('Error saving to DB:', e);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    getFileFromDB(filename) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject('No DB');
                return;
            }
            
            try {
                const transaction = this.db.transaction(['files'], 'readonly');
                const store = transaction.objectStore('files');
                const request = store.getAll();
                
                request.onsuccess = () => {
                    // Find the file by filename (most recent if multiple exist)
                    const results = request.result.filter(item => item.filename === filename);
                    if (results.length > 0) {
                        const fileData = results[results.length - 1]; // Get most recent
                        const blob = new Blob([fileData.data], { type: 'audio/mpeg' });
                        const blobUrl = URL.createObjectURL(blob);
                        resolve(blobUrl);
                    } else {
                        reject('Not found');
                    }
                };
                
                request.onerror = () => reject('Read error');
            } catch (e) {
                reject(e);
            }
        });
    }

    extractMetadata(file, index) {
        if (typeof jsmediatags === 'undefined') {
            console.log('jsmediatags not loaded');
            return;
        }

        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const tags = tag.tags;
                const track = this.playlist[index];

                if (tags.artist) track.artist = tags.artist;
                if (tags.title) track.title = tags.title;
                if (tags.year) track.year = tags.year;

                if (index === this.currentTrackIndex) {
                    this.updateNowPlaying();
                }

                this.savePlaylistMetadataToStorage();
                this.renderPlaylist();
            },
            onError: (error) => {
                console.log('Error reading metadata:', file.name);
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
            const artist = track.artist && track.artist !== 'Unbekannter Künstler' ? track.artist : '';
            const displayText = artist
                ? (track.year 
                    ? `${artist} - ${track.title} - ${track.year}`
                    : `${artist} - ${track.title}`)
                : track.title || track.filename;
            
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
                    ${index > 0 ? `<button class="playlist-item-up" data-index="${index}" title="Nach oben">▲</button>` : '<span style="width:24px;"></span>'}
                    ${index < this.playlist.length - 1 ? `<button class="playlist-item-down" data-index="${index}" title="Nach unten">▼</button>` : '<span style="width:24px;"></span>'}
                    <button class="playlist-item-delete" data-index="${index}" title="Löschen">✕</button>
                </div>
            `;
        }).join('');

        this.playlistContainer.querySelectorAll('.playlist-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('playlist-item-delete') || 
                    e.target.classList.contains('playlist-item-up') ||
                    e.target.classList.contains('playlist-item-down') ||
                    e.target.classList.contains('playlist-item-drag-handle')) {
                    return;
                }
                const index = parseInt(item.dataset.index);
                
                if (this.autoplay) {
                    // Autoplay ON: Load and play immediately
                    this.loadTrack(index);
                    this.play();
                } else {
                    // Autoplay OFF: Just select the song (don't update UI, don't load)
                    this.currentTrackIndex = index;
                    this.updatePlaylistUI(); // Just highlight in playlist
                }
            });

            item.addEventListener('dragstart', (e) => this.handleDragStart(e));
            item.addEventListener('dragover', (e) => this.handleDragOver(e));
            item.addEventListener('drop', (e) => this.handleDrop(e));
            item.addEventListener('dragend', (e) => this.handleDragEnd(e));
        });

        this.playlistContainer.querySelectorAll('.playlist-item-up').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                if (index > 0) {
                    [this.playlist[index], this.playlist[index - 1]] = [this.playlist[index - 1], this.playlist[index]];
                    if (this.currentTrackIndex === index) {
                        this.currentTrackIndex = index - 1;
                    } else if (this.currentTrackIndex === index - 1) {
                        this.currentTrackIndex = index;
                    }
                    this.savePlaylistMetadataToStorage();
                    this.renderPlaylist();
                }
            });
        });

        this.playlistContainer.querySelectorAll('.playlist-item-down').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                if (index < this.playlist.length - 1) {
                    [this.playlist[index], this.playlist[index + 1]] = [this.playlist[index + 1], this.playlist[index]];
                    if (this.currentTrackIndex === index) {
                        this.currentTrackIndex = index + 1;
                    } else if (this.currentTrackIndex === index + 1) {
                        this.currentTrackIndex = index;
                    }
                    this.savePlaylistMetadataToStorage();
                    this.renderPlaylist();
                }
            });
        });

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
            const draggedTrack = this.playlist[this.draggingIndex];
            this.playlist.splice(this.draggingIndex, 1);
            this.playlist.splice(dropIndex, 0, draggedTrack);

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
            const track = this.playlist[index];
            const filename = track.filename;
            delete this.fileCache[filename];
            
            // Delete from DB using compound key
            if (this.db) {
                try {
                    const transaction = this.db.transaction(['files'], 'readwrite');
                    const store = transaction.objectStore('files');
                    // Get all files and delete those matching filename
                    const request = store.getAll();
                    request.onsuccess = () => {
                        const results = request.result.filter(item => item.filename === filename);
                        results.forEach(item => {
                            store.delete(item.id);
                        });
                    };
                } catch (e) {
                    console.error('Error deleting from DB:', e);
                }
            }
            
            this.playlist.splice(index, 1);
            
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
        return new Promise((resolve) => {
            if (index < 0 || index >= this.playlist.length) {
                resolve();
                return;
            }

            this.currentTrackIndex = index;
            this.loadedTrackIndex = index; // Mark this track as loaded
            const track = this.playlist[index];
            
            const blobUrl = this.fileCache[track.filename];
            
            if (blobUrl) {
                this.audioPlayer.src = blobUrl;
                this.updatePlaylistUI();
                this.resetProgressBar();
                this.updateDuration();
                this.updateNowPlaying();
                resolve();
            } else {
                // File not in cache yet, try to get from DB
                this.getFileFromDB(track.filename).then(blobUrl => {
                    this.fileCache[track.filename] = blobUrl;
                    this.audioPlayer.src = blobUrl;
                    this.updatePlaylistUI();
                    this.resetProgressBar();
                    this.updateDuration();
                    this.updateNowPlaying();
                    resolve();
                }).catch(err => {
                    console.error('File not available:', track.filename);
                    resolve();
                });
            }
        });
    }

    updateNowPlaying() {
        const track = this.playlist[this.currentTrackIndex];
        const artist = track.artist && track.artist !== 'Unbekannter Künstler' ? track.artist : '';
        const displayText = artist
            ? (track.year 
                ? `${artist} - ${track.title} - ${track.year}`
                : `${artist} - ${track.title}`)
            : track.title || track.filename;
        
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
        console.log('Play clicked, selected:', this.currentTrackIndex, 'loaded:', this.loadedTrackIndex);
        if (this.playlist.length === 0) {
            alert('Bitte importieren Sie MP3-Dateien');
            return;
        }
        
        // If a different track is selected, load it first
        if (this.currentTrackIndex !== this.loadedTrackIndex) {
            console.log('Track mismatch detected, loading track:', this.currentTrackIndex);
            this.loadTrack(this.currentTrackIndex).then(() => {
                this._playAfterLoad();
            });
        } else {
            console.log('Track already loaded, resuming playback');
            this._playAfterLoad();
        }
    }

    _playAfterLoad() {
        // Request Screen Wake Lock
        if (navigator.wakeLock) {
            navigator.wakeLock.request('screen')
                .then(wakeLock => {
                    this.wakeLock = wakeLock;
                    console.log('Screen Wake Lock acquired');
                })
                .catch(err => {
                    console.log('Wake Lock error:', err);
                });
        }
        
        this.audioPlayer.play().catch(err => {
            console.error('Play error:', err);
        });
    }

    pause() {
        this.audioPlayer.pause();
        if (this.wakeLock) {
            this.wakeLock.release().catch(err => {
                console.log('Wake Lock release error:', err);
            });
            this.wakeLock = null;
        }
    }

    stop() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
        this.loadedTrackIndex = -1; // Reset so next play() will load the selected track
        this.resetProgressBar();
        if (this.wakeLock) {
            this.wakeLock.release().catch(err => {
                console.log('Wake Lock release error:', err);
            });
            this.wakeLock = null;
        }
        console.log('Stop called, loadedTrackIndex reset to -1');
    }

    next() {
        if (this.playlist.length === 0) return;
        let nextIndex = this.currentTrackIndex + 1;
        if (nextIndex >= this.playlist.length) nextIndex = 0;
        this.loadTrack(nextIndex).then(() => {
            if (this.isPlaying) this._playAfterLoad();
        });
    }

    previous() {
        if (this.playlist.length === 0) return;
        let prevIndex = this.currentTrackIndex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.loadTrack(prevIndex).then(() => {
            if (this.isPlaying) this._playAfterLoad();
        });
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
            this.audioPlayer.volume = this.previousVolume / 100;
            this.volumeSlider.value = this.previousVolume;
            this.volumeValue.textContent = `${this.previousVolume}%`;
            this.isMuted = false;
        } else {
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

    savePlaylistMetadataToStorage() {
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
                console.error('Error loading autoplay:', e);
            }
        }
    }

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('SW error:', err));
        }
    }

    checkForUpdates() {
        if ('serviceWorker' in navigator) {
            const notificationEl = document.getElementById('updateNotification');
            
            // Check for updates periodically
            setInterval(() => {
                navigator.serviceWorker.getRegistrations().then(registrations => {
                    registrations.forEach(reg => {
                        reg.update(); // Check for updates
                    });
                });
            }, 60000); // Check every 60 seconds
            
            // Listen for controller change (new version installed)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (notificationEl) {
                    notificationEl.style.display = 'block';
                    console.log('Update available - notification shown');
                }
            });
            
            // Also check on first load
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(reg => {
                    reg.update();
                });
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MusicPlayer();
});
