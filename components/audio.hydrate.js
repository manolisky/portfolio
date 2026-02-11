/**
 * Audio Hydration
 * Initializes playlist interactivity on existing HTML
 */

import {
    initAudioController,
    getWaveformData,
    playTrack,
    togglePlay,
    seek,
    getState,
    registerPlaylist,
    unregisterPlaylist,
    subscribe,
    addToQueue
} from './audioController.js';

// Track active playlist for cleanup
let activePlaylistId = null;

// DEBUG: Set to true to disable waveform rendering
const DEBUG_DISABLE_WAVEFORM = false;

/**
 * Format time in M:SS
 */
function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Draw static waveform with smooth progress overlay
 */
function drawWaveform(canvas, peaks, progress = 0) {
    if (DEBUG_DISABLE_WAVEFORM) return;
    if (!peaks || !canvas.offsetWidth) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const barCount = peaks.length;
    const barWidth = width / barCount;
    const gap = 1;
    const progressX = progress * width;

    const style = getComputedStyle(document.documentElement);
    const accentColor = style.getPropertyValue('--accent').trim() || '#3b82f6';
    const mutedColor = style.getPropertyValue('--text-muted').trim() || '#555555';

    // Draw all bars in muted color first
    for (let i = 0; i < barCount; i++) {
        const barHeight = Math.max(2, peaks[i] * height * 0.85);
        const x = i * barWidth;
        const y = (height - barHeight) / 2;

        ctx.fillStyle = mutedColor;
        ctx.beginPath();
        ctx.roundRect(x + gap / 2, y, barWidth - gap, barHeight, 1);
        ctx.fill();
    }

    // Draw played portion with accent color (smooth clip)
    if (progress > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, progressX, height);
        ctx.clip();

        for (let i = 0; i < barCount; i++) {
            const barHeight = Math.max(2, peaks[i] * height * 0.85);
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

/**
 * Create a track row element
 */
function createTrackRow({ src, title, index }, callbacks) {
    const row = document.createElement('div');
    row.className = 'track';
    row.dataset.index = index;

    row.innerHTML = `
        <span class="track__num">${index + 1}</span>
        <button class="track__play" aria-label="Play">
            <svg class="track__icon track__icon--play" viewBox="0 0 24 24">
                <polygon points="6,4 20,12 6,20" fill="currentColor"/>
            </svg>
            <svg class="track__icon track__icon--pause" viewBox="0 0 24 24">
                <rect x="5" y="4" width="4" height="16" fill="currentColor"/>
                <rect x="15" y="4" width="4" height="16" fill="currentColor"/>
            </svg>
        </button>
        <span class="track__title">${title}</span>
        <div class="track__waveform">
            <canvas class="track__canvas"></canvas>
            <div class="track__loading"></div>
        </div>
        <span class="track__duration">--:--</span>
        <button class="track__add" aria-label="Add to queue" title="Add to queue">+</button>
    `;

    const playBtn = row.querySelector('.track__play');
    const addBtn = row.querySelector('.track__add');
    const canvas = row.querySelector('.track__canvas');
    const loadingEl = row.querySelector('.track__loading');
    const durationEl = row.querySelector('.track__duration');
    const waveformEl = row.querySelector('.track__waveform');

    let peaks = null;
    let duration = 0;
    let isLoading = false;
    let isLoaded = false;

    // Lazy load waveform when visible
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !isLoaded && !isLoading) {
            loadWaveform();
        }
    }, { rootMargin: '100px' });
    observer.observe(row);

    async function loadWaveform() {
        isLoading = true;
        loadingEl.classList.add('track__loading--active');

        try {
            const data = await getWaveformData(src);
            peaks = data.peaks;
            duration = data.duration;
            durationEl.textContent = formatTime(duration);
            drawWaveform(canvas, peaks, 0);
            isLoaded = true;
        } catch (e) {
            console.error('Failed to load waveform:', e);
        } finally {
            isLoading = false;
            loadingEl.classList.remove('track__loading--active');
        }
    }

    // Play button click
    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const state = getState();

        if (state.currentTrack?.index === index && state.currentTrack?.src === src) {
            togglePlay();
        } else {
            if (!isLoaded) loadWaveform();
            callbacks.onPlay(index);
        }
    });

    // Seek on waveform click
    waveformEl.addEventListener('click', (e) => {
        const rect = waveformEl.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        callbacks.onSeek(index, percent);
    });

    // Add to queue button
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addToQueue({ src, title, index });
    });

    // Update UI
    function updateUI(isPlaying, progress, currentTime = 0) {
        row.classList.toggle('track--playing', isPlaying);
        if (peaks) {
            drawWaveform(canvas, peaks, progress);
        }
    }

    // Update time display separately
    function updateTime(currentTime) {
        if (duration > 0) {
            durationEl.innerHTML = `<span class="track__time-current">${formatTime(currentTime)}</span><span class="track__time-total">${formatTime(duration)}</span>`;
        }
    }

    function setActive(active) {
        row.classList.toggle('track--active', active);
        if (!active && duration > 0) {
            durationEl.innerHTML = formatTime(duration);
        }
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
        if (peaks) {
            const state = getState();
            const isThisTrack = state.currentTrack?.index === index;
            const progress = isThisTrack ? (state.currentTime / state.duration) : 0;
            drawWaveform(canvas, peaks, progress);
        }
    });
    resizeObserver.observe(canvas);

    return {
        element: row,
        updateUI,
        updateTime,
        setActive,
        forceLoad: loadWaveform
    };
}

/**
 * Initialize all playlists on the page
 */
export function initPlaylists() {
    // Initialize the audio controller first
    initAudioController();

    const routeHash = window.location.hash.replace(/[^a-zA-Z0-9]/g, '-') || 'home';
    document.querySelectorAll('[data-playlist]').forEach((container, idx) => {
        createPlaylist(container, `playlist-${routeHash}-${idx}`);
    });
}

/**
 * Create a playlist instance
 */
function createPlaylist(container, playlistId) {
    if (activePlaylistId) {
        unregisterPlaylist(activePlaylistId);
    }
    activePlaylistId = playlistId;

    const trackDataEls = container.querySelectorAll('[data-track]');
    const tracksData = Array.from(trackDataEls).map((el, i) => ({
        src: el.dataset.src,
        title: el.dataset.title || `Track ${i + 1}`,
        index: i
    }));

    if (tracksData.length === 0) return;

    const sourceRoute = window.location.hash.slice(1) || '/';

    // Build UI
    container.innerHTML = '';
    container.classList.add('playlist');

    const elementId = `playlist-el-${playlistId}`;
    container.id = elementId;

    const trackList = document.createElement('div');
    trackList.className = 'playlist__list';
    container.appendChild(trackList);

    const trackRows = [];

    tracksData.forEach((data) => {
        const row = createTrackRow(data, {
            onPlay: (index) => {
                const track = tracksData[index];
                playTrack(track, playlistId, sourceRoute);
            },
            onSeek: (index, percent) => {
                const state = getState();
                const track = tracksData[index];

                if (state.currentTrack?.index !== index || state.currentTrack?.src !== track.src) {
                    playTrack(track, playlistId, sourceRoute);
                    setTimeout(() => seek(percent), 100);
                } else {
                    seek(percent);
                }
            }
        });
        trackList.appendChild(row.element);
        trackRows.push(row);
    });

    registerPlaylist(playlistId, tracksData, (activeIndex, isPlaying, progress, currentTime = 0) => {
        trackRows.forEach((row, i) => {
            const isActive = i === activeIndex;
            row.setActive(isActive);
            row.updateUI(isActive && isPlaying, isActive ? progress : 0, currentTime);
            if (isActive) {
                row.updateTime(currentTime);
            }
        });
    }, elementId);

    // Sync with current state
    const state = getState();
    if (state.currentTrack?.playlistId === playlistId) {
        trackRows.forEach((row, i) => {
            const isActive = i === state.currentTrack.index;
            row.setActive(isActive);
            if (isActive) {
                row.forceLoad();
            }
        });
    }
}

/**
 * Initialize audio blocks (no-op, handled by playlists)
 */
export function initAudioBlocks() {
    // Audio blocks are now handled by playlists
}

/**
 * Cleanup on route change
 */
export function cleanupAudio() {
    if (activePlaylistId) {
        unregisterPlaylist(activePlaylistId);
        activePlaylistId = null;
    }
}
