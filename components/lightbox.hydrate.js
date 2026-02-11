/**
 * Lightbox Hydration
 * Full-featured image viewer with zoom and navigation
 */

let lightboxEl = null;
let currentImages = [];
let currentIndex = 0;
let isZoomed = false;
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let imageOffset = { x: 0, y: 0 };

/**
 * Create the lightbox DOM structure
 */
function createLightbox() {
    if (lightboxEl) return;

    lightboxEl = document.createElement('div');
    lightboxEl.className = 'lightbox';
    lightboxEl.innerHTML = `
    <div class="lightbox-backdrop"></div>
    <button class="lightbox-close" aria-label="Close">×</button>
    <button class="lightbox-prev" aria-label="Previous">‹</button>
    <button class="lightbox-next" aria-label="Next">›</button>
    <div class="lightbox-content">
      <img class="lightbox-image" src="" alt="" />
    </div>
    <div class="lightbox-counter"></div>
    <div class="lightbox-zoom-hint">Click to zoom</div>
  `;

    document.body.appendChild(lightboxEl);

    // Event listeners
    lightboxEl.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    lightboxEl.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lightboxEl.querySelector('.lightbox-prev').addEventListener('click', prevImage);
    lightboxEl.querySelector('.lightbox-next').addEventListener('click', nextImage);

    const img = lightboxEl.querySelector('.lightbox-image');
    img.addEventListener('click', toggleZoom);
    img.addEventListener('mousedown', startDrag);
    img.addEventListener('touchstart', startDrag, { passive: false });

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', drag, { passive: false });
    document.addEventListener('touchend', endDrag);
}

/**
 * Open lightbox with images
 */
export function openLightbox(images, startIndex = 0) {
    createLightbox();
    currentImages = images;
    currentIndex = startIndex;
    isZoomed = false;

    showImage();
    lightboxEl.classList.add('open');
    document.body.style.overflow = 'hidden';
}

/**
 * Close lightbox
 */
export function closeLightbox() {
    if (!lightboxEl) return;
    lightboxEl.classList.remove('open', 'zoomed');
    document.body.style.overflow = '';
    isZoomed = false;
}

/**
 * Show current image
 */
function showImage() {
    const img = lightboxEl.querySelector('.lightbox-image');
    const counter = lightboxEl.querySelector('.lightbox-counter');

    img.src = currentImages[currentIndex];
    counter.textContent = `${currentIndex + 1} / ${currentImages.length}`;

    // Reset zoom state
    lightboxEl.classList.remove('zoomed');
    isZoomed = false;
    imageOffset = { x: 0, y: 0 };
    img.style.transform = '';

    // Show/hide nav based on image count
    lightboxEl.querySelector('.lightbox-prev').style.display = currentImages.length > 1 ? '' : 'none';
    lightboxEl.querySelector('.lightbox-next').style.display = currentImages.length > 1 ? '' : 'none';
}

function prevImage() {
    currentIndex = (currentIndex - 1 + currentImages.length) % currentImages.length;
    showImage();
}

function nextImage() {
    currentIndex = (currentIndex + 1) % currentImages.length;
    showImage();
}

function toggleZoom(e) {
    const img = lightboxEl.querySelector('.lightbox-image');
    if (img.naturalWidth <= window.innerWidth && img.naturalHeight <= window.innerHeight) {
        return;
    }

    isZoomed = !isZoomed;
    lightboxEl.classList.toggle('zoomed', isZoomed);

    if (!isZoomed) {
        imageOffset = { x: 0, y: 0 };
        img.style.transform = '';
    } else {
        handleHoverPan(e);
    }
}

function handleHoverPan(e) {
    if (!isZoomed || !lightboxEl?.classList.contains('open')) return;

    const img = lightboxEl.querySelector('.lightbox-image');
    if (!img) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const overflowX = Math.max(0, imgWidth - viewportWidth);
    const overflowY = Math.max(0, imgHeight - viewportHeight);

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    const ratioX = mouseX / viewportWidth;
    const ratioY = mouseY / viewportHeight;

    const offsetX = overflowX * (0.5 - ratioX);
    const offsetY = overflowY * (0.5 - ratioY);

    imageOffset = { x: offsetX, y: offsetY };
    img.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
}

function startDrag(e) {
    if (!isZoomed || !e.touches) return;
    isDragging = true;
    const pos = e.touches[0];
    dragStart = { x: pos.clientX - imageOffset.x, y: pos.clientY - imageOffset.y };
    e.preventDefault();
}

function drag(e) {
    if (!e.touches && isZoomed && lightboxEl?.classList.contains('open')) {
        handleHoverPan(e);
        return;
    }

    if (!isDragging || !isZoomed || !e.touches) return;

    const pos = e.touches[0];
    const img = lightboxEl.querySelector('.lightbox-image');

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const overflowX = Math.max(0, imgWidth - viewportWidth);
    const overflowY = Math.max(0, imgHeight - viewportHeight);

    let offsetX = pos.clientX - dragStart.x;
    let offsetY = pos.clientY - dragStart.y;

    offsetX = Math.max(-overflowX / 2, Math.min(overflowX / 2, offsetX));
    offsetY = Math.max(-overflowY / 2, Math.min(overflowY / 2, offsetY));

    imageOffset = { x: offsetX, y: offsetY };
    img.style.transform = `translate(${offsetX}px, ${offsetY}px)`;

    e.preventDefault();
}

function endDrag() {
    isDragging = false;
}

function handleKeydown(e) {
    if (!lightboxEl?.classList.contains('open')) return;

    switch (e.key) {
        case 'Escape':
            closeLightbox();
            break;
        case 'ArrowLeft':
            prevImage();
            break;
        case 'ArrowRight':
            nextImage();
            break;
    }
}

/**
 * Initialize lightbox on standalone images
 */
export function initImageLightbox() {
    createLightbox();

    document.querySelectorAll('[data-lightbox-image]').forEach(figure => {
        const img = figure.querySelector('img');
        if (!img) return;

        figure.style.cursor = 'pointer';
        figure.addEventListener('click', () => {
            openLightbox([img.src], 0);
        });
    });
}

/**
 * Initialize lightbox (pre-create element)
 */
export function initLightbox() {
    createLightbox();
}
