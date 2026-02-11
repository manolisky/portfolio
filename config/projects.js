/**
 * Project Registry
 * Single source of truth for grid layout, thumbnails, paths, and display order
 */

export default [
    {
        slug: 'nota',
        path: 'pages/nota',
        thumbnail: 'pages/nota/media/a4articledemo_grid_resized_20.png',
        gridColumn: 1,
        gridRow: 2,
        order: 4,
        featured: true
    },
    {
        slug: 'bullets',
        path: 'pages/bullets',
        thumbnail: 'pages/bullets/media/stairs.jpg',
        gridColumn: 1,
        gridRow: 2,
        order: 2,
        featured: false
    },
    {
        slug: 'pambur',
        path: 'pages/pambur',
        thumbnail: 'pages/pambur/media/full.jpeg',
        gridColumn: 1,
        gridRow: 2,
        order: 3,
        featured: false
    },
    {
        slug: 'impromptu',
        path: 'pages/impromptu',
        thumbnail: 'pages/impromptu/media/river-cover.webp',
        thumbnailStyle: 'masked',
        gridColumn: 2,
        gridRow: 2,
        order: 1,
        featured: false
    }
];
