import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      manifestFilename: 'manifest.webmanifest',
      includeAssets: [
        'icon.svg',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
        'sw-notifications.js',
      ],
      manifest: {
        id: '/',
        name: 'BVS Special — B V Tasks Executive Planner',
        short_name: 'B V Tasks',
        description:
          'Planejamento executivo com Visão Global, Importação em Lote, Fechamento IA com Gemini e Sincronização SQL Multi-Dispositivo.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#09090B',
        theme_color: '#7F1D1D',
        categories: ['productivity', 'education', 'lifestyle'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
        shortcuts: [
          {
            name: 'Nova Tarefa',
            short_name: 'Nova Tarefa',
            description: 'Criar uma nova tarefa rapidamente',
            url: '/?action=new-task',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Importar Planilha',
            short_name: 'Importar',
            description: 'Importar lote Excel, CSV ou JSON',
            url: '/?action=import',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Fechamento IA',
            short_name: 'IA Mês',
            description: 'Gerar fechamento inteligente do mês com Gemini',
            url: '/?action=ai-review',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Tarefas de Hoje',
            short_name: 'Hoje',
            description: 'Abrir direto nas tarefas agendadas para hoje',
            url: '/?filter=today',
            icons: [{ src: '/icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        importScripts: ['/sw-notifications.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:4173',
    },
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx,mjs}'],
  },
});
