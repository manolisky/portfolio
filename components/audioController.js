/**
 * Global Audio Controller
 * Singleton managing audio playback across route changes
 */

// Shared AudioContext for waveform decoding
let audioContext = null;

// Waveform cache
const waveformCache = new Map();

// Global state
const state = {
    audio: null,
    currentTrack: null,  // { src, title, index, playlistId, sourceRoute }
    isPlaying: false,
    miniPlayerVisible: false,
    playlists: new Map(), // playlistId -> { updateUI, tracks, elementId }
    // Queue state
    queue: [],           // { src, title, originalIndex, id }
    queueIndex: 0,       // Current position in queue
    queueExpanded: false,
    shuffle: false,
    loop: false
};

// Mini-player element (created once)
let miniPlayerEl = null;
let lastQueueHash = '';

// Event subscribers
const subscribers = new Set();

/**
 * Initialize the audio controller (call once on app init)
 */
export function initAudioController() {
    if (state.audio) return; // Already initialized

    state.audio = new Audio();
    state.audio.addEventListener('timeupdate', handleTimeUpdate);
    state.audio.addEventListener('ended', handleTrackEnd);
    state.audio.addEventListener('play', () => {
        state.isPlaying = true;
        updatePlaylistUI();
        notifySubscribers();
    });
    state.audio.addEventListener('pause', () => {
        state.isPlaying = false;
        updatePlaylistUI();
        notifySubscribers();
    });

    createMiniPlayer();
}

/**
 * Get or create AudioContext
 */
export function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

/**
 * Get waveform data (with caching and lazy loading)
 */
export async function getWaveformData(src, barCount = 80) {
    if (waveformCache.has(src)) {
        return waveformCache.get(src);
    }

    const ctx = getAudioContext();

    try {
        const response = await fetch(src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const rawData = audioBuffer.getChannelData(0);
        const samples = rawData.length;
        const blockSize = Math.floor(samples / barCount);
        const peaks = [];

        for (let i = 0; i < barCount; i++) {
            const start = i * blockSize;
            let max = 0;
            for (let j = 0; j < blockSize; j++) {
                const abs = Math.abs(rawData[start + j]);
                if (abs > max) max = abs;
            }
            peaks.push(max);
        }

        const maxPeak = Math.max(...peaks);
        const normalized = peaks.map(p => maxPeak > 0 ? p / maxPeak : 0.3);

        const result = { peaks: normalized, duration: audioBuffer.duration };
        waveformCache.set(src, result);
        return result;
    } catch (e) {
        console.error('Failed to decode audio:', e);
        return { peaks: Array(barCount).fill(0.3), duration: 0 };
    }
}

/**
 * Play a track - if queue is empty, add entire playlist first
 */
export function playTrack(track, playlistId, sourceRoute) {
    getAudioContext(); // Ensure context is ready (iOS)

    const playlist = state.playlists.get(playlistId);

    // If queue is empty, add entire playlist
    if (state.queue.length === 0 && playlist) {
        addPlaylistToQueue(playlist.tracks, track.index);
    }

    state.currentTrack = {
        ...track,
        playlistId,
        sourceRoute,
        peaks: null,
        duration: 0
    };

    state.audio.src = track.src;
    state.audio.play();
    state.miniPlayerVisible = true;

    // Load waveform for mini-player
    getWaveformData(track.src).then(data => {
        if (state.currentTrack?.src === track.src) {
            state.currentTrack.peaks = data.peaks;
            state.currentTrack.duration = data.duration;
            updateMiniPlayerWaveform();
        }
    });

    notifySubscribers();
    updateMiniPlayer();
}

/**
 * Play a track from queue by index
 */
function playFromQueue(queueIndex) {
    if (queueIndex < 0 || queueIndex >= state.queue.length) return;

    state.queueIndex = queueIndex;
    const track = state.queue[queueIndex];

    state.currentTrack = {
        ...track,
        peaks: null,
        duration: 0
    };

    state.audio.src = track.src;
    state.audio.play();

    // Load waveform for mini-player
    getWaveformData(track.src).then(data => {
        if (state.currentTrack?.src === track.src) {
            state.currentTrack.peaks = data.peaks;
            state.currentTrack.duration = data.duration;
            updateMiniPlayerWaveform();
        }
    });

    notifySubscribers();
    updateMiniPlayer();
}

/**
 * Toggle play/pause
 */
export function togglePlay() {
    if (!state.audio.src) return;

    if (state.isPlaying) {
        state.audio.pause();
    } else {
        state.audio.play();
    }
}

/**
 * Pause
 */
export function pause() {
    state.audio.pause();
}

/**
 * Seek to position (0-1)
 */
export function seek(percent) {
    if (state.audio.duration) {
        state.audio.currentTime = percent * state.audio.duration;
    }
}

/**
 * Play next track in queue
 */
export function playNext() {
    if (state.queue.length === 0) return;

    const nextIndex = state.queueIndex + 1;

    if (nextIndex < state.queue.length) {
        playFromQueue(nextIndex);
    } else if (state.loop) {
        // Loop back to start
        playFromQueue(0);
    } else {
        // End of queue, stop
        state.audio.pause();
        state.isPlaying = false;
        notifySubscribers();
    }
}

/**
 * Play previous track in queue
 */
export function playPrev() {
    if (state.queue.length === 0) return;

    // If more than 3 seconds in, restart current track
    if (state.audio.currentTime > 3) {
        state.audio.currentTime = 0;
        return;
    }

    const prevIndex = state.queueIndex - 1;

    if (prevIndex >= 0) {
        playFromQueue(prevIndex);
    } else if (state.loop) {
        // Loop to end
        playFromQueue(state.queue.length - 1);
    } else {
        // At start, restart current
        state.audio.currentTime = 0;
    }
}

/**
 * Stop and close mini-player
 */
export function stop() {
    const prevPlaylistId = state.currentTrack?.playlistId;

    state.audio.pause();
    state.audio.src = '';
    state.currentTrack = null;
    state.isPlaying = false;
    state.miniPlayerVisible = false;

    // Clear queue
    state.queue = [];
    state.queueIndex = 0;
    state.queueExpanded = false;

    // Clear active state on the playlist that was playing
    if (prevPlaylistId) {
        const playlist = state.playlists.get(prevPlaylistId);
        if (playlist?.updateUI) {
            playlist.updateUI(-1, false, 0); // -1 index = no active track
        }
    }

    notifySubscribers();
    updateMiniPlayer();
}

/**
 * Get current state
 */
export function getState() {
    return {
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        currentTime: state.audio?.currentTime || 0,
        duration: state.audio?.duration || 0,
        queue: state.queue,
        queueIndex: state.queueIndex,
        queueExpanded: state.queueExpanded,
        shuffle: state.shuffle,
        loop: state.loop
    };
}

// ========================================
// Queue Management
// ========================================

let queueIdCounter = 0;

/**
 * Add single track to queue
 */
export function addToQueue(track) {
    state.queue.push({
        ...track,
        id: ++queueIdCounter
    });
    updateMiniPlayer();
}

/**
 * Add all tracks from a playlist to queue
 */
export function addPlaylistToQueue(tracks, startIndex = 0) {
    const newTracks = tracks.map((t, i) => ({
        ...t,
        originalIndex: i,
        id: ++queueIdCounter
    }));

    if (state.shuffle) {
        // Shuffle but keep startIndex track first
        const startTrack = newTracks[startIndex];
        const rest = newTracks.filter((_, i) => i !== startIndex);
        shuffleArray(rest);
        state.queue = [startTrack, ...rest];
    } else {
        // Start from the clicked track
        state.queue = [...newTracks.slice(startIndex), ...newTracks.slice(0, startIndex)];
    }

    state.queueIndex = 0;
    updateMiniPlayer();
}

/**
 * Remove track from queue
 */
export function removeFromQueue(index) {
    state.queue.splice(index, 1);

    // Adjust queueIndex if needed
    if (index < state.queueIndex) {
        state.queueIndex--;
    } else if (index === state.queueIndex && state.queueIndex >= state.queue.length) {
        state.queueIndex = Math.max(0, state.queue.length - 1);
    }

    updateMiniPlayer();
}

/**
 * Reorder queue (drag and drop)
 */
export function reorderQueue(fromIndex, toIndex) {
    const [item] = state.queue.splice(fromIndex, 1);
    state.queue.splice(toIndex, 0, item);

    // Update queueIndex if the currently playing track moved
    if (fromIndex === state.queueIndex) {
        state.queueIndex = toIndex;
    } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
        state.queueIndex--;
    } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
        state.queueIndex++;
    }

    updateMiniPlayer();
}

/**
 * Toggle shuffle mode
 */
export function toggleShuffle() {
    state.shuffle = !state.shuffle;

    if (state.shuffle && state.queue.length > 1) {
        // Shuffle remaining tracks (keep current at front)
        const current = state.queue[state.queueIndex];
        const before = state.queue.slice(0, state.queueIndex);
        const after = state.queue.slice(state.queueIndex + 1);
        const rest = [...before, ...after];
        shuffleArray(rest);
        state.queue = [current, ...rest];
        state.queueIndex = 0;
    }

    updateMiniPlayer();
    notifySubscribers();
}

/**
 * Toggle loop mode
 */
export function toggleLoop() {
    state.loop = !state.loop;
    updateMiniPlayer();
    notifySubscribers();
}

/**
 * Toggle queue expanded/collapsed
 */
export function toggleQueueExpanded() {
    state.queueExpanded = !state.queueExpanded;
    updateMiniPlayer();
}

/**
 * Shuffle array in place (Fisher-Yates)
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

/**
 * Register a playlist
 */
export function registerPlaylist(playlistId, tracks, updateUI, elementId = null) {
    state.playlists.set(playlistId, { tracks, updateUI, elementId });

    // Sync UI if this playlist is currently playing
    if (state.currentTrack?.playlistId === playlistId) {
        updateUI(state.currentTrack.index, state.isPlaying, getProgress());
    }
}

/**
 * Unregister a playlist (on route change)
 */
export function unregisterPlaylist(playlistId) {
    state.playlists.delete(playlistId);
}

/**
 * Subscribe to state changes
 */
export function subscribe(callback) {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
}

// Internal helpers

function getProgress() {
    if (!state.audio.duration) return 0;
    return state.audio.currentTime / state.audio.duration;
}

function updatePlaylistUI() {
    // Update current playlist UI with play/pause state and time
    if (state.currentTrack) {
        const playlist = state.playlists.get(state.currentTrack.playlistId);
        if (playlist?.updateUI) {
            playlist.updateUI(
                state.currentTrack.index,
                state.isPlaying,
                getProgress(),
                state.audio.currentTime
            );
        }
    }
}

function handleTimeUpdate() {
    updatePlaylistUI();
    updateMiniPlayer();
}

function handleTrackEnd() {
    playNext();
}

function notifySubscribers() {
    const currentState = getState();
    subscribers.forEach(cb => cb(currentState));
}

// Mini-player

function createMiniPlayer() {
    miniPlayerEl = document.createElement('div');
    miniPlayerEl.className = 'mini-player';
    miniPlayerEl.innerHTML = `
        <div class="mini-player__queue">
            <div class="mini-player__queue-header">
                <span class="mini-player__queue-title">Queue (<span class="mini-player__queue-count">0</span>)</span>
                <button class="mini-player__queue-collapse" aria-label="Collapse queue" title="Collapse">
                    <svg viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" fill="currentColor"/></svg>
                </button>
                <div class="mini-player__queue-controls">
                    <button class="mini-player__queue-btn mini-player__shuffle" aria-label="Shuffle" title="Shuffle">
                        <svg viewBox="0 0 24 24"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" fill="currentColor"/></svg>
                    </button>
                    <button class="mini-player__queue-btn mini-player__loop" aria-label="Loop" title="Loop">
                        <svg viewBox="0 0 24 24"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" fill="currentColor"/></svg>
                    </button>
                </div>
            </div>
            <div class="mini-player__queue-list"></div>
        </div>
        <div class="mini-player__controls">
            <button class="mini-player__btn mini-player__source" aria-label="Go to source" title="Go to source">
                <svg viewBox="0 0 24 24"><path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z" fill="currentColor"/></svg>
            </button>
            <button class="mini-player__btn mini-player__prev" aria-label="Previous">
                <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" fill="currentColor"/></svg>
            </button>
            <button class="mini-player__btn mini-player__play" aria-label="Play">
                <svg class="icon-play" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20" fill="currentColor"/></svg>
                <svg class="icon-pause" viewBox="0 0 24 24"><rect x="5" y="4" width="4" height="16" fill="currentColor"/><rect x="15" y="4" width="4" height="16" fill="currentColor"/></svg>
            </button>
            <div class="mini-player__content">
                <span class="mini-player__title"></span>
                <div class="mini-player__progress">
                    <div class="mini-player__waveform">
                        <canvas class="mini-player__canvas"></canvas>
                    </div>
                    <span class="mini-player__time"></span>
                </div>
            </div>
            <button class="mini-player__btn mini-player__next" aria-label="Next">
                <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg>
            </button>
            <button class="mini-player__btn mini-player__close" aria-label="Close">
                <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
            </button>
        </div>
    `;
    document.body.appendChild(miniPlayerEl);

    // Click on controls area (dead space or title) to toggle queue
    const controlsEl = miniPlayerEl.querySelector('.mini-player__controls');
    const contentEl = miniPlayerEl.querySelector('.mini-player__content');
    const titleEl = miniPlayerEl.querySelector('.mini-player__title');

    [controlsEl, contentEl, titleEl].forEach(el => {
        if (el) {
            el.addEventListener('click', (e) => {
                // Only toggle if clicking on these elements, not buttons inside
                if (e.target === el || e.target.classList.contains('mini-player__title') ||
                    e.target.classList.contains('mini-player__content') ||
                    e.target.classList.contains('mini-player__progress')) {
                    e.stopPropagation();
                    toggleQueueExpanded();
                }
            });
        }
    });

    // Waveform click to seek
    const waveformEl = miniPlayerEl.querySelector('.mini-player__waveform');
    waveformEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const rect = waveformEl.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        seek(percent);
    });

    // Event listeners
    miniPlayerEl.querySelector('.mini-player__play').addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
    miniPlayerEl.querySelector('.mini-player__prev').addEventListener('click', (e) => { e.stopPropagation(); playPrev(); });
    miniPlayerEl.querySelector('.mini-player__next').addEventListener('click', (e) => { e.stopPropagation(); playNext(); });
    miniPlayerEl.querySelector('.mini-player__close').addEventListener('click', (e) => { e.stopPropagation(); stop(); });
    miniPlayerEl.querySelector('.mini-player__shuffle').addEventListener('click', (e) => { e.stopPropagation(); toggleShuffle(); });
    miniPlayerEl.querySelector('.mini-player__loop').addEventListener('click', (e) => { e.stopPropagation(); toggleLoop(); });
    miniPlayerEl.querySelector('.mini-player__queue-collapse').addEventListener('click', (e) => { e.stopPropagation(); toggleQueueExpanded(); });
    miniPlayerEl.querySelector('.mini-player__source').addEventListener('click', (e) => {
        e.stopPropagation();
        if (state.currentTrack?.sourceRoute) {
            window.location.hash = state.currentTrack.sourceRoute;
            // Scroll to playlist after navigation
            setTimeout(() => {
                const playlist = state.playlists.get(state.currentTrack.playlistId);
                if (playlist?.elementId) {
                    const el = document.getElementById(playlist.elementId);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }, 100);
        }
    });

    // Subscribe to state changes
    subscribe(updateMiniPlayer);
}

function updateMiniPlayer() {
    if (!miniPlayerEl) return;

    miniPlayerEl.classList.toggle('mini-player--visible', state.miniPlayerVisible);
    miniPlayerEl.classList.toggle('mini-player--playing', state.isPlaying);
    miniPlayerEl.classList.toggle('mini-player--expanded', state.queueExpanded);
    miniPlayerEl.classList.toggle('mini-player--shuffle', state.shuffle);
    miniPlayerEl.classList.toggle('mini-player--loop', state.loop);

    const titleEl = miniPlayerEl.querySelector('.mini-player__title');
    if (titleEl && state.currentTrack) {
        titleEl.textContent = state.currentTrack.title;
    }

    // Update time
    const timeEl = miniPlayerEl.querySelector('.mini-player__time');
    if (timeEl && state.currentTrack) {
        const current = formatMiniTime(state.audio.currentTime);
        const total = formatMiniTime(state.currentTrack.duration || state.audio.duration);
        timeEl.textContent = `${current} / ${total}`;
    }

    // Update queue count
    const countEl = miniPlayerEl.querySelector('.mini-player__queue-count');
    if (countEl) {
        countEl.textContent = state.queue.length;
    }

    // Only rebuild queue list if it changed (avoid flashing on timeupdate)
    const queueHash = state.queue.map(t => t.id).join(',') + '-' + state.queueIndex;
    if (queueHash !== lastQueueHash) {
        lastQueueHash = queueHash;
        renderQueueList();
    }

    // Update waveform progress if peaks loaded
    if (state.currentTrack?.peaks) {
        updateMiniPlayerWaveform();
    }
}

function renderQueueList() {
    if (!miniPlayerEl) return;

    const listEl = miniPlayerEl.querySelector('.mini-player__queue-list');
    if (!listEl) return;

    listEl.innerHTML = state.queue.map((track, i) => `
        <div class="mini-player__queue-item ${i === state.queueIndex ? 'mini-player__queue-item--active' : ''}" data-index="${i}" draggable="true">
            <span class="mini-player__queue-drag">≡</span>
            <span class="mini-player__queue-num">${i + 1}</span>
            <span class="mini-player__queue-track-title">${track.title}</span>
            <button class="mini-player__queue-remove" data-index="${i}" aria-label="Remove">✕</button>
        </div>
    `).join('');

    // Add click listeners to queue items
    listEl.querySelectorAll('.mini-player__queue-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('mini-player__queue-remove')) {
                const index = parseInt(item.dataset.index);
                playFromQueue(index);
            }
        });
    });

    // Add remove listeners
    listEl.querySelectorAll('.mini-player__queue-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            removeFromQueue(index);
        });
    });

    // Drag and drop reordering
    setupQueueDragDrop(listEl);
}

// Queue drag and drop
let draggedIndex = null;

function setupQueueDragDrop(listEl) {
    listEl.querySelectorAll('.mini-player__queue-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedIndex = parseInt(item.dataset.index);
            item.classList.add('mini-player__queue-item--dragging');
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('mini-player__queue-item--dragging');
            draggedIndex = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const targetIndex = parseInt(item.dataset.index);
            if (draggedIndex !== null && draggedIndex !== targetIndex) {
                item.classList.add('mini-player__queue-item--dragover');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('mini-player__queue-item--dragover');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('mini-player__queue-item--dragover');
            const targetIndex = parseInt(item.dataset.index);
            if (draggedIndex !== null && draggedIndex !== targetIndex) {
                reorderQueue(draggedIndex, targetIndex);
            }
        });
    });
}

// Expose playFromQueue for queue item clicks
function playFromQueueExport(index) {
    playFromQueue(index);
}

function updateMiniPlayerWaveform() {
    if (!miniPlayerEl || !state.currentTrack?.peaks) return;

    const canvas = miniPlayerEl.querySelector('.mini-player__canvas');
    if (!canvas) return;

    const peaks = state.currentTrack.peaks;
    const progress = state.audio.duration ? state.audio.currentTime / state.audio.duration : 0;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    if (width === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const barCount = peaks.length;
    const barWidth = width / barCount;
    const gap = 1;
    const progressX = progress * width;

    const accentColor = '#3b82f6';
    const mutedColor = 'rgba(255,255,255,0.25)';

    // Draw muted bars
    for (let i = 0; i < barCount; i++) {
        const barHeight = Math.max(2, peaks[i] * height * 0.8);
        const x = i * barWidth;
        const y = (height - barHeight) / 2;

        ctx.fillStyle = mutedColor;
        ctx.beginPath();
        ctx.roundRect(x + gap / 2, y, barWidth - gap, barHeight, 1);
        ctx.fill();
    }

    // Draw played portion
    if (progress > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, progressX, height);
        ctx.clip();

        for (let i = 0; i < barCount; i++) {
            const barHeight = Math.max(2, peaks[i] * height * 0.8);
            const x = i * barWidth;
            const y = (height - barHeight) / 2;

            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.roundRect(x + gap / 2, y, barWidth - gap, barHeight, 1);
            ctx.fill();
        }
        ctx.restore();
    }
}

function formatMiniTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '-:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
