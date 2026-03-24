import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'now-playing',
      component: () => import('@/views/NowPlayingView.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: () => import('@/views/QueueView.vue'),
    },
    {
      path: '/library',
      redirect: '/library/folders',
    },
    {
      path: '/library/folders/:path(.*)*',
      name: 'library-folders',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/library/artists',
      name: 'library-artists',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/library/artists/:name(.*)',
      name: 'artist-detail',
      component: () => import('@/views/ArtistDetailView.vue'),
    },
    {
      path: '/library/albums',
      name: 'library-albums',
      component: () => import('@/views/LibraryView.vue'),
    },
    {
      path: '/library/albums/:artist(.*)/:album(.*)',
      name: 'album-detail',
      component: () => import('@/views/AlbumDetailView.vue'),
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/views/SearchView.vue'),
    },
    {
      path: '/playlists',
      name: 'playlists',
      component: () => import('@/views/PlaylistsView.vue'),
    },
    {
      path: '/playlists/:name',
      name: 'playlist-detail',
      component: () => import('@/views/PlaylistDetailView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})
