import { defineConfig } from 'vite';
import { yocoApiHandler } from './server/yoco.mjs';

const mountYocoApi = (server) => {
  server.middlewares.use(async (req, res, next) => {
    try {
      const handled = await yocoApiHandler(req, res);
      if (!handled) next();
    } catch (error) {
      next(error);
    }
  });
};

export default defineConfig({
  plugins: [
    {
      name: 'sheabliss-yoco-api',
      configureServer: mountYocoApi,
      configurePreviewServer: mountYocoApi,
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        about: new URL('./about.html', import.meta.url).pathname,
        cookies: new URL('./cookies.html', import.meta.url).pathname,
      },
    },
  },
});
