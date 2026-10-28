# Паспорт: переезд staging на сервер Пульта

Дата: 2026-10-28. Не openspec-change: капабилити сайта не меняются, меняется место staging и способ его выкладки. Runbook — `docs/runbooks/staging-na-servere-pulta.md`.

Шаги 1, 2, 4–6 выполнял автор. Шаг 3 (первая выкладка) — Claude Code под `alyans`. Итоги шагов 4–6 записаны **со слов Ревизора Пульта, без выводов команд**: на 45.90.32.35 и в DNS у Claude Code доступа нет.

## Хеши

- Пути `~/alyans-site` и правки runbook (rsync безусловно, `certbot --redirect`, проверка `ss`) — `6af1c5c340aa0481d721beb5055a4d0ff3099377`. Этот же хеш — `<хеш>` шага 2: vhost `deploy/nginx/dev.alyans-em.ru.conf` взят по нему.

## Шаги

1. **Перенос рабочего каталога** (автор). `~/alyans-site` → `~/alyans-site-archive-clone`, `~/alyans-site-new` → `~/alyans-site`, старый ключ архива удалён. Проверка исполнителем: `origin` — `SeregaCh/alyans-site.git`, `core.sshCommand` — ключ `id_ed25519_alyans-site-v2`, клон архива — `SeregaCh/alyans-site-archive.git`.
2. **Каталог и vhost** (автор). `/var/www/alyans-staging` (`alyans:alyans`, 755), vhost `dev.alyans-em.ru` из репозитория по хешу, `nginx -t`, `reload`.
3. **Первая выкладка** (Claude Code). `npm ci` и `deploy:staging` — код 0; главная по `--resolve` на 80 — `200` и `X-Robots-Tag: noindex, nofollow`; несуществующий путь — `404`; `robots.txt` — `Disallow: /`.
4. **DNS** (автор, со слов Ревизора). A-запись `dev` → `212.108.82.87` в Яндекс 360. `getent hosts dev.alyans-em.ru` на сервере Пульта после `resolvectl flush-caches` — `212.108.82.87`.
5. **Сертификат** (автор, со слов Ревизора). Сертификат `dev.alyans-em.ru` до 2027-01-26; https — `200` с `X-Robots-Tag`; http → `301`; `/health` Пульта — `200`; `renew --dry-run` — успех.
6. **Снятие старого staging на 45.90.32.35** (автор, со слов Ревизора). Ниже.

## Шаг 6: отличия от runbook

1. **`default_server` не было.** Runbook ждал его в `alyans-dev`; `grep` не нашёл его ни в одном файле `sites-enabled`. Неизвестный Host уходил в первый по порядку сайт — `alyans-dev`.
2. **nginx слушает и `[::]:80`, `[::]:443`.** Сток `00-default-drop` поставлен со строками `[::]` на обоих портах — решение Ревизора.

## Шаг 6: переключение и удаление

Переключение (`alyans-dev` → `00-default-drop`), затем удаление: `certbot delete` для `dev.alyans-em.ru`, файл `alyans-dev`, каталоги `staging-dist` и `staging`.

Проверки после каждого `reload`:
- `version.txt` = `current-sha` = `3be222d`;
- сайт `alyans-em.ru` — `200`;
- `nope.invalid` на 80 — `Empty reply from server`, на 443 — `curl: (35) … unrecognized name`;
- `easy-plan.ru` — `200`, `watch.serega-hub.ru` — `401`.

`certbot renew --dry-run` после удаления — `alyans-em.ru`, `easy-plan.ru`, `watch.serega-hub.ru`.

`sites-enabled` на 45.90.32.35 после шага: `00-default-drop`, `alyans-prod`, `easy-plan`, `watch.serega-hub.ru`.

## Наблюдение

По записям 11.09 (`log/2026-09-13-razvertyvanie-staging.md`) заглушка `default_server` ставилась первым блоком `alyans-dev` и проверялась. 28.10 `grep` её не нашёл. Конфиг разошёлся с записями незаметно, причина не установлена. Закрыто стоком в отдельном файле `00-default-drop`, который не зависит ни от одного сайта.

## Итог

`dev.alyans-em.ru` раздаётся nginx сервера Пульта из `/var/www/alyans-staging`, выкладка — `npm run deploy:staging` исполнителем. На 45.90.32.35 остались только прод и сток незаданных хостов на обоих протоколах.
