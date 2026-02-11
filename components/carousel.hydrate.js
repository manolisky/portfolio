/**
 * Carousel Hydration
 * Attaches event listeners to existing carousel HTML
 */

import { openLightbox } from './lightbox.hydrate.js';

/**
 * Initialize all carousels on the page
 */
export function initCarousels() {
    document.querySelectorAll('[data-carousel]').forEach(carousel => {
        const track = carousel.querySelector('.carousel-track');
        const slides = carousel.querySelectorAll('.carousel-slide');
        if (slides.length <= 1) return;

        // Collect all image sources for lightbox
        const images = Array.from(slides).map(slide => slide.querySelector('img')?.src).filter(Boolean);

        let currentIndex = 0;

        // Add click handler to open lightbox
        slides.forEach((slide, i) => {
            slide.style.cursor = 'pointer';
            slide.addEventListener('click', () => {
                openLightbox(images, i);
            });
        });

        // Add navigation buttons
        const prevBtn = document.createElement('button');
        prevBtn.className = 'carousel-btn carousel-prev';
        prevBtn.innerHTML = '‹';
        prevBtn.setAttribute('aria-label', 'Previous');

        const nextBtn = document.createElement('button');
        nextBtn.className = 'carousel-btn carousel-next';
        nextBtn.innerHTML = '›';
        nextBtn.setAttribute('aria-label', 'Next');

        carousel.appendChild(prevBtn);
        carousel.appendChild(nextBtn);

        // Add dots
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'carousel-dots';
        slides.forEach((_, i) => {
            const dot = document.createElement('button');
            dot.className = `carousel-dot ${i === 0 ? 'active' : ''}`;
            dot.setAttribute('aria-label', `Go to slide ${i + 1}`);
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);
        });
        carousel.appendChild(dotsContainer);

        // Navigation functions
        function goToSlide(index) {
            currentIndex = index;
            track.scrollTo({
                left: slides[index].offsetLeft,
                behavior: 'smooth'
            });
            updateDots();
        }

        function updateDots() {
            dotsContainer.querySelectorAll('.carousel-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === currentIndex);
            });
        }

        prevBtn.addEventListener('click', () => {
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            goToSlide(currentIndex);
        });

        nextBtn.addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % slides.length;
            goToSlide(currentIndex);
        });

        // Update dots on scroll
        track.addEventListener('scroll', () => {
            const scrollLeft = track.scrollLeft;
            const slideWidth = slides[0].offsetWidth;
            const newIndex = Math.round(scrollLeft / slideWidth);
            if (newIndex !== currentIndex) {
                currentIndex = newIndex;
                updateDots();
            }
        });
    });
}
