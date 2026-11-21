import { defineConfig } from 'vite';
import { yocoApiHandler } from './server/yoco.mjs';
import { accountApiHandler } from './server/accounts.mjs';

const mountYocoApi = (server) => {
  server.middlewares.use(async (req, res, next) => {
    try {
      if (await accountApiHandler(req, res)) return;
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
        terms: new URL('./terms.html', import.meta.url).pathname,
        privacy: new URL('./privacy.html', import.meta.url).pathname,
        category: new URL('./category.html', import.meta.url).pathname,
        shop: new URL('./shop.html', import.meta.url).pathname,
        account: new URL('./account.html', import.meta.url).pathname,
        wishlist: new URL('./wishlist.html', import.meta.url).pathname,
        cleanShop: new URL('./shop/index.html', import.meta.url).pathname,
        cleanAbout: new URL('./about/index.html', import.meta.url).pathname,
        body: new URL('./body/index.html', import.meta.url).pathname,
        hair: new URL('./hair/index.html', import.meta.url).pathname,
        skin: new URL('./skin/index.html', import.meta.url).pathname,
        health: new URL('./health/index.html', import.meta.url).pathname,
        organicSheaButter: new URL('./shop/organic-shea-butter/index.html', import.meta.url).pathname,
        hairButter: new URL('./shop/hair-butter/index.html', import.meta.url).pathname,
        mucunaPruriensBeans: new URL('./shop/mucuna-pruriens-beans/index.html', import.meta.url).pathname,
      },
    },
  },
});
