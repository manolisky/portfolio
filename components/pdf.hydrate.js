/**
 * PDF Viewer Hydration
 * Initializes PDF viewer interactivity on existing HTML
 */

// PDF.js library (loaded dynamically)
let pdfjsLib = null;

// PDF Lightbox state
let pdfLightbox = null;

/**
 * Load PDF.js library dynamically
 */
async function loadPDFJS() {
    if (pdfjsLib) return pdfjsLib;

    pdfjsLib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';

    return pdfjsLib;
}

/**
 * Initialize all PDF viewers on the page
 */
export function initPDFViewers() {
    document.querySelectorAll('[data-pdf]').forEach(initViewer);
}

/**
 * Initialize a single PDF viewer
 */
async function initViewer(container) {
    const options = {
        src: container.dataset.src,
        layout: container.dataset.layout || 'scroll',
        pages: container.dataset.pages || 'single',
        direction: container.dataset.direction || 'vertical',
        startPage: parseInt(container.dataset.start) || 1,
        zoom: container.dataset.zoom || 'auto'
    };

    if (!options.src) {
        console.warn('PDF viewer missing src attribute');
        return;
    }

    const content = container.querySelector('.pdf-viewer__content');
    content.innerHTML = '<div class="pdf-viewer__loading">Loading PDF...</div>';

    try {
        await loadPDFJS();

        const pdf = await pdfjsLib.getDocument(options.src).promise;
        const totalPages = pdf.numPages;

        container._pdfState = {
            pdf,
            options,
            totalPages,
            currentPage: options.startPage,
            currentSlideIndex: 0,
            renderedPages: new Map(),
            scale: 1
        };

        container.classList.add(`pdf-viewer--${options.layout}`);
        container.classList.add(`pdf-viewer--${options.direction}`);
        if (options.pages !== 'single') {
            container.classList.add(`pdf-viewer--${options.pages}`);
        }

        if (options.layout === 'paged') {
            await buildPagedViewer(container);
        } else {
            await buildScrollViewer(container);
        }

    } catch (error) {
        console.error('Failed to load PDF:', error);
        content.innerHTML = `<div class="pdf-viewer__error">Failed to load PDF</div>`;
    }
}

async function buildScrollViewer(container) {
    const state = container._pdfState;
    const content = container.querySelector('.pdf-viewer__content');
    content.innerHTML = '';

    for (let i = 1; i <= state.totalPages; i++) {
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-viewer__page';
        pageContainer.dataset.page = i;

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-viewer__canvas';
        pageContainer.appendChild(canvas);

        content.appendChild(pageContainer);
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pageNum = parseInt(entry.target.dataset.page);
                renderPage(container, pageNum, entry.target.querySelector('canvas'));
            }
        });
    }, { rootMargin: '100px' });

    content.querySelectorAll('.pdf-viewer__page').forEach(page => {
        observer.observe(page);
    });

    addPageCounter(container);

    content.addEventListener('scroll', () => {
        updateCurrentPage(container);
    });

    content.addEventListener('click', () => {
        openPDFLightbox(container);
    });
}

async function buildPagedViewer(container) {
    const state = container._pdfState;
    const content = container.querySelector('.pdf-viewer__content');
    content.innerHTML = '';

    const track = document.createElement('div');
    track.className = 'pdf-viewer__track';
    content.appendChild(track);

    state.slides = buildSlideStructure(state);

    state.slides.forEach((slideInfo, index) => {
        const slide = document.createElement('div');
        slide.className = 'pdf-viewer__slide';
        slide.dataset.slideIndex = index;

        if (slideInfo.pages.length === 1) {
            slide.classList.add('pdf-viewer__slide--single');
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-viewer__canvas';
            canvas.dataset.page = slideInfo.pages[0];
            slide.appendChild(canvas);
        } else {
            slide.classList.add('pdf-viewer__slide--spread');
            slideInfo.pages.forEach(pageNum => {
                const pageEl = document.createElement('div');
                pageEl.className = 'pdf-viewer__spread-page';
                pageEl.dataset.page = pageNum;
                const canvas = document.createElement('canvas');
                canvas.className = 'pdf-viewer__canvas';
                canvas.dataset.page = pageNum;
                pageEl.appendChild(canvas);
                slide.appendChild(pageEl);
            });
        }

        track.appendChild(slide);
    });

    addNavigation(container);
    addPageCounter(container);
    addDots(container);

    await goToSlide(container, 0);

    track.addEventListener('click', () => {
        openPDFLightbox(container);
    });

    track.addEventListener('scroll', () => {
        updateSlideFromScroll(container);
    });
}

function buildSlideStructure(state) {
    const slides = [];
    const isDual = state.options.pages === 'dual' || state.options.pages === 'dual-cover';
    const isCover = state.options.pages === 'dual-cover';
    let pageIndex = 1;

    if (!isDual) {
        for (let i = 1; i <= state.totalPages; i++) {
            slides.push({ pages: [i] });
        }
    } else {
        if (isCover && pageIndex <= state.totalPages) {
            slides.push({ pages: [pageIndex] });
            pageIndex++;
        }

        while (pageIndex <= state.totalPages) {
            const pages = [pageIndex];
            pageIndex++;
            if (pageIndex <= state.totalPages) {
                pages.push(pageIndex);
                pageIndex++;
            }
            slides.push({ pages });
        }
    }

    return slides;
}

async function renderPage(container, pageNum, canvas, targetHeight = null) {
    const state = container._pdfState;

    const cacheKey = `${pageNum}-${targetHeight || 'default'}`;
    if (state.renderedPages.has(cacheKey)) return;
    state.renderedPages.set(cacheKey, true);

    try {
        const page = await state.pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });

        const content = container.querySelector('.pdf-viewer__content');
        const containerWidth = content.clientWidth || container.clientWidth;
        const maxHeight = window.innerHeight * 0.65;
        const containerHeight = targetHeight || maxHeight;

        const isDual = state.options.pages === 'dual' || state.options.pages === 'dual-cover';
        let scale;

        const availableWidth = isDual
            ? (containerWidth - 60) / 2
            : (containerWidth - 40);

        const widthScale = availableWidth / viewport.width;
        const heightScale = (containerHeight - 40) / viewport.height;

        if (state.options.zoom === 'fit-page') {
            scale = Math.min(heightScale, widthScale);
        } else if (state.options.zoom === 'fit-width') {
            scale = widthScale;
        } else {
            scale = Math.min(heightScale, widthScale);
        }

        scale = Math.max(scale, 0.3);

        const pixelRatio = window.devicePixelRatio || 1;
        const renderScale = scale * pixelRatio;

        const scaledViewport = page.getViewport({ scale: renderScale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${scaledViewport.width / pixelRatio}px`;
        canvas.style.height = `${scaledViewport.height / pixelRatio}px`;

        const context = canvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: scaledViewport
        }).promise;

    } catch (error) {
        console.error(`Failed to render page ${pageNum}:`, error);
    }
}

function addNavigation(container) {
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pdf-viewer__btn pdf-viewer__prev';
    prevBtn.innerHTML = '‹';
    prevBtn.setAttribute('aria-label', 'Previous page');
    prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateSlide(container, -1);
    });

    const nextBtn = document.createElement('button');
    nextBtn.className = 'pdf-viewer__btn pdf-viewer__next';
    nextBtn.innerHTML = '›';
    nextBtn.setAttribute('aria-label', 'Next page');
    nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateSlide(container, 1);
    });

    container.appendChild(prevBtn);
    container.appendChild(nextBtn);
}

function addPageCounter(container) {
    const state = container._pdfState;

    const counter = document.createElement('div');
    counter.className = 'pdf-viewer__counter';
    counter.innerHTML = `<span class="pdf-viewer__current">1</span> / ${state.totalPages}`;

    container.appendChild(counter);
}

function addDots(container) {
    const state = container._pdfState;

    if (state.slides.length <= 1) return;

    const dotsContainer = document.createElement('div');
    dotsContainer.className = 'pdf-viewer__dots';

    state.slides.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = `pdf-viewer__dot ${i === 0 ? 'active' : ''}`;
        dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            goToSlide(container, i);
        });
        dotsContainer.appendChild(dot);
    });

    container.appendChild(dotsContainer);
}

function navigateSlide(container, direction) {
    const state = container._pdfState;
    const newIndex = Math.max(0, Math.min(state.slides.length - 1, state.currentSlideIndex + direction));
    goToSlide(container, newIndex);
}

async function goToSlide(container, slideIndex) {
    const state = container._pdfState;
    state.currentSlideIndex = slideIndex;

    const track = container.querySelector('.pdf-viewer__track');
    const slides = track.querySelectorAll('.pdf-viewer__slide');
    const targetSlide = slides[slideIndex];

    if (targetSlide) {
        const slideWidth = targetSlide.offsetWidth;
        track.scrollTo({
            left: slideIndex * slideWidth,
            behavior: 'smooth'
        });

        const canvases = targetSlide.querySelectorAll('canvas[data-page]');
        for (const canvas of canvases) {
            const pageNum = parseInt(canvas.dataset.page);
            await renderPage(container, pageNum, canvas);
        }

        state.currentPage = state.slides[slideIndex].pages[0];

        updateDots(container, slideIndex);
        updateCounter(container);
    }
}

function updateCounter(container) {
    const state = container._pdfState;
    const currentEl = container.querySelector('.pdf-viewer__current');
    if (currentEl) {
        const slideInfo = state.slides[state.currentSlideIndex];
        if (slideInfo.pages.length === 1) {
            currentEl.textContent = slideInfo.pages[0];
        } else {
            currentEl.textContent = `${slideInfo.pages[0]}-${slideInfo.pages[slideInfo.pages.length - 1]}`;
        }
    }
}

function updateDots(container, activeIndex) {
    const dots = container.querySelectorAll('.pdf-viewer__dot');
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i === activeIndex);
    });
}

function updateSlideFromScroll(container) {
    const state = container._pdfState;
    const track = container.querySelector('.pdf-viewer__track');
    const slides = track.querySelectorAll('.pdf-viewer__slide');

    if (slides.length === 0) return;

    const scrollLeft = track.scrollLeft;
    const slideWidth = slides[0].offsetWidth;

    const newSlideIndex = Math.round(scrollLeft / slideWidth);
    const clampedIndex = Math.max(0, Math.min(state.slides.length - 1, newSlideIndex));

    if (clampedIndex !== state.currentSlideIndex) {
        state.currentSlideIndex = clampedIndex;
        state.currentPage = state.slides[clampedIndex].pages[0];

        updateDots(container, clampedIndex);
        updateCounter(container);

        const targetSlide = slides[clampedIndex];
        const canvases = targetSlide.querySelectorAll('canvas[data-page]');
        canvases.forEach(canvas => {
            const pageNum = parseInt(canvas.dataset.page);
            renderPage(container, pageNum, canvas);
        });
    }
}

function updateCurrentPage(container) {
    const state = container._pdfState;
    const content = container.querySelector('.pdf-viewer__content');
    const pages = content.querySelectorAll('.pdf-viewer__page');

    const scrollTop = content.scrollTop;
    const contentHeight = content.clientHeight;

    let currentPage = 1;
    pages.forEach(page => {
        const pageTop = page.offsetTop;
        if (pageTop <= scrollTop + contentHeight / 2) {
            currentPage = parseInt(page.dataset.page);
        }
    });

    state.currentPage = currentPage;
    const currentEl = container.querySelector('.pdf-viewer__current');
    if (currentEl) {
        currentEl.textContent = currentPage;
    }
}

// Lightbox functions
function createPDFLightbox() {
    if (pdfLightbox) return pdfLightbox;

    pdfLightbox = document.createElement('div');
    pdfLightbox.className = 'pdf-lightbox';
    pdfLightbox.innerHTML = `
        <div class="pdf-lightbox__backdrop"></div>
        <button class="pdf-lightbox__close" aria-label="Close">×</button>
        <button class="pdf-lightbox__prev" aria-label="Previous">‹</button>
        <button class="pdf-lightbox__next" aria-label="Next">›</button>
        <div class="pdf-lightbox__content"></div>
        <div class="pdf-lightbox__counter"></div>
    `;

    document.body.appendChild(pdfLightbox);

    pdfLightbox.querySelector('.pdf-lightbox__backdrop').addEventListener('click', closePDFLightbox);
    pdfLightbox.querySelector('.pdf-lightbox__close').addEventListener('click', closePDFLightbox);
    pdfLightbox.querySelector('.pdf-lightbox__prev').addEventListener('click', () => navigateLightbox(-1));
    pdfLightbox.querySelector('.pdf-lightbox__next').addEventListener('click', () => navigateLightbox(1));

    document.addEventListener('keydown', handleLightboxKeydown);

    return pdfLightbox;
}

async function openPDFLightbox(container) {
    const state = container._pdfState;
    createPDFLightbox();

    pdfLightbox._sourceContainer = container;
    pdfLightbox._currentSlideIndex = state.currentSlideIndex;

    pdfLightbox.classList.add('open');
    document.body.style.overflow = 'hidden';

    await renderLightboxSlide();
}

async function renderLightboxSlide() {
    const container = pdfLightbox._sourceContainer;
    const state = container._pdfState;
    const slideIndex = pdfLightbox._currentSlideIndex;
    const slideInfo = state.slides[slideIndex];

    const content = pdfLightbox.querySelector('.pdf-lightbox__content');
    content.innerHTML = '';

    const slideEl = document.createElement('div');
    slideEl.className = 'pdf-lightbox__slide';

    if (slideInfo.pages.length > 1) {
        slideEl.classList.add('pdf-lightbox__slide--spread');
    }

    for (const pageNum of slideInfo.pages) {
        const pageEl = document.createElement('div');
        pageEl.className = 'pdf-lightbox__page';

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-lightbox__canvas';
        pageEl.appendChild(canvas);
        slideEl.appendChild(pageEl);

        await renderLightboxPage(container, pageNum, canvas, slideInfo.pages.length);
    }

    content.appendChild(slideEl);

    const counter = pdfLightbox.querySelector('.pdf-lightbox__counter');
    if (slideInfo.pages.length === 1) {
        counter.textContent = `${slideInfo.pages[0]} / ${state.totalPages}`;
    } else {
        counter.textContent = `${slideInfo.pages[0]}-${slideInfo.pages[slideInfo.pages.length - 1]} / ${state.totalPages}`;
    }
}

async function renderLightboxPage(container, pageNum, canvas, pagesInSlide) {
    const state = container._pdfState;

    try {
        const page = await state.pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const availableWidth = pagesInSlide > 1 ? (viewportWidth - 120) / 2 : viewportWidth - 120;
        const availableHeight = viewportHeight - 100;

        const widthScale = availableWidth / viewport.width;
        const heightScale = availableHeight / viewport.height;
        const scale = Math.min(widthScale, heightScale);

        const pixelRatio = window.devicePixelRatio || 1;
        const renderScale = scale * pixelRatio;

        const scaledViewport = page.getViewport({ scale: renderScale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        canvas.style.width = `${scaledViewport.width / pixelRatio}px`;
        canvas.style.height = `${scaledViewport.height / pixelRatio}px`;

        const context = canvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: scaledViewport
        }).promise;

    } catch (error) {
        console.error(`Failed to render lightbox page ${pageNum}:`, error);
    }
}

async function navigateLightbox(direction) {
    const container = pdfLightbox._sourceContainer;
    const state = container._pdfState;
    const newIndex = Math.max(0, Math.min(state.slides.length - 1, pdfLightbox._currentSlideIndex + direction));

    if (newIndex !== pdfLightbox._currentSlideIndex) {
        pdfLightbox._currentSlideIndex = newIndex;
        await renderLightboxSlide();
    }
}

function closePDFLightbox() {
    if (!pdfLightbox) return;
    pdfLightbox.classList.remove('open');
    document.body.style.overflow = '';
}

function handleLightboxKeydown(e) {
    if (!pdfLightbox?.classList.contains('open')) return;

    switch (e.key) {
        case 'Escape':
            closePDFLightbox();
            break;
        case 'ArrowLeft':
            navigateLightbox(-1);
            break;
        case 'ArrowRight':
            navigateLightbox(1);
            break;
    }
}

/**
 * Cleanup PDF viewers
 */
export function cleanupPDFViewers() {
    document.querySelectorAll('[data-pdf]').forEach(container => {
        if (container._pdfState) {
            container._pdfState.pdf.destroy();
            container._pdfState = null;
        }
    });
}
