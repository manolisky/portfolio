/**
 * Immersive Template Hydration
 * Initializes scroll-snapping behavior and navigation
 */

/**
 * Initialize immersive page navigation and transitions
 * Returns cleanup function for route changes
 */
export function initImmersiveNav() {
    const container = document.querySelector('[data-immersive]');
    if (!container) return null;

    const app = document.getElementById('app');
    const isFadeMode = container.dataset.transition === 'fade';

    // Inject background layer into #app (before header) for fade mode
    let backgroundsEl = null;
    if (isFadeMode && container.dataset.bgHtml) {
        const bgHtml = decodeURIComponent(container.dataset.bgHtml);
        if (bgHtml && app) {
            app.insertAdjacentHTML('afterbegin', bgHtml);
            backgroundsEl = app.querySelector('.immersive-backgrounds');
        }
    }

    const slides = container.querySelectorAll('.immersive-slide');
    const dots = container.querySelectorAll('.nav-dot');
    const backgrounds = backgroundsEl ? backgroundsEl.querySelectorAll('.immersive-bg') : [];
    let currentSlide = 0;

    // IntersectionObserver to detect active slide
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const slideIndex = parseInt(entry.target.dataset.slide, 10);
                setActiveSlide(slideIndex);
            }
        });
    }, {
        root: container,
        threshold: 0.5
    });

    slides.forEach(slide => observer.observe(slide));

    // Click dots to navigate
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            const target = parseInt(dot.dataset.target, 10);
            slides[target].scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Arrow key navigation
    document.addEventListener('keydown', handleKeyNav);

    function handleKeyNav(e) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
            e.preventDefault();
            navigateToSlide(currentSlide + 1);
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateToSlide(currentSlide - 1);
        }
    }

    function navigateToSlide(index) {
        if (index >= 0 && index < slides.length) {
            slides[index].scrollIntoView({ behavior: 'smooth' });
        }
    }

    function setActiveSlide(index) {
        currentSlide = index;

        // Update nav dots
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });

        // Fade mode: update backgrounds
        if (isFadeMode && backgrounds.length > 0) {
            backgrounds.forEach((bg, i) => {
                bg.classList.toggle('active', i === index);
            });
        }
    }

    // Add immersive-mode class to body
    document.body.classList.add('immersive-mode');

    // Cleanup function for route changes
    return () => {
        observer.disconnect();
        document.removeEventListener('keydown', handleKeyNav);
        document.body.classList.remove('immersive-mode');
        // Remove background layer from #app
        if (backgroundsEl && backgroundsEl.parentNode) {
            backgroundsEl.parentNode.removeChild(backgroundsEl);
        }
    };
}
