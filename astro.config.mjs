import { defineConfig } from 'astro/config';

// SITE_ENV — явный признак окружения сборки: 'production' или 'staging'.
// По умолчанию (переменная не задана) — staging: ошибочная сборка не должна
// случайно разрешить индексацию.
const SITE_ENV = process.env.SITE_ENV === 'production' ? 'production' : 'staging';
const SITE_URL = SITE_ENV === 'production' ? 'https://alyans-em.ru' : 'https://dev.alyans-em.ru';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
});
