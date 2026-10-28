# Паспорт: первый выпуск прода по новой схеме

Дата: 2026-10-28. Не openspec-change: капабилити сайта не меняются, меняется способ выкладки. Шаги на 45.90.32.35 выполнял автор по `docs/runbooks/prod-ustanovka.md`; у Claude Code доступа к проду нет, поэтому итоги шагов ниже записаны со слов автора и Ревизора Пульта, без выводов команд.

## Схема

`main` → Actions (`build`: Node, `npm ci`, production-сборка, тесты) → Actions открывает PR main → prod → слияние автором (ruleset: только PR, обязательная проверка `build`) → на проде таймер `alyans-release` от `alyans-deploy` раз в 2 минуты видит новый `origin/prod`, собирает его на месте, кладёт в `/var/www/alyans/prod/releases/<sha>`, атомарно переключает `current` и сверяет `https://alyans-em.ru/version.txt`.

## Хеши

- Скрипты и юниты установлены из `bb8c2f15a672f6911f27e139735b44014c0df188` (`deploy/` в `main`).
- PR #1 main → prod слит 2026-10-28; первый выпущенный коммит `prod` — merge-коммит `5eeec73`. Ожидание runbook «первый релиз — `823f7bd…`» не сбылось: PR слит до шага 7, это не ошибка.
- Проверка ruleset до выпуска: прямой push в `prod` отклонён `GH013` («Changes must be made through a pull request»).

## Шаги

Шаги 1 и 10 — шаги плана архитектора, не команды runbook; остальные — разделы `docs/runbooks/prod-ustanovka.md`.

0. Разведка, только чтение — каталоги, vhost, Node, пользователь, таймеры, `namei`, сертификат и A-запись `www`.
1. Файлы `deploy/` в репозитории — скрипты `release.sh`, `rollback.sh`, юниты systemd, runbook (план архитектора).
2. Пользователь `alyans-deploy`, каталоги `prod` и `prod/releases` (`alyans-deploy:www-data`, 2750), `state/`.
3. Ключ только для чтения `id_ed25519_alyans-site-ro`, добавлен в GitHub без права записи.
4. `known_hosts` из опубликованной строки GitHub, отпечаток сверен; `ssh-keyscan` не использовался.
5. Клон ветки `prod` в `/var/lib/alyans-deploy/src`.
6. Скрипты в `/usr/local/lib/alyans-deploy`, юниты в `/etc/systemd/system`, `daemon-reload`.
7. Первый релиз вручную с `--no-verify` — инцидент 1.
8. Nginx: `root` на `/var/www/alyans/prod/current`, `nginx -t`, `reload` — инцидент 2; проверки по списку runbook.
9. Таймер `alyans-release.timer` включён.
10. Первый выпуск: PR #1 main → prod слит, таймер выложил `5eeec73` (план архитектора).

## Инциденты

1. **`find` из `/root`.** Автор запустил `sudo -u alyans-deploy … release.sh` из `/root`. `find` при выходе пытается вернуться в исходный каталог, а у `alyans-deploy` нет доступа к `/root`: `Failed to restore initial working directory: /root`. Под `set -e` скрипт упал до смены `current`, сайт не тронут, хеш ушёл в `failed-sha`. Исправление: `cd /` первой командой в `release.sh` и `rollback.sh`; в runbook запуск из `/`.
2. **404 сразу после `reload`.** Первая проверка `version.txt` опередила применение `reload` и дала 404; повтор через пару секунд — нормальный ответ. Исправление: `sleep 2` между `reload` и проверками в шаге 8.

## EBADENGINE undici

На проде Node 20, а `undici@8.10.2` (`astro` → `unifont` → `undici`) требует Node ≥ 22.19.0 — `npm ci` печатает `EBADENGINE`. Сборка проходит, но это предупреждение о неподдерживаемой среде. Решение — Node 22.23.4 только для выкладки в `/opt/node22` (`docs/runbooks/prod-node22-i-uborka.md`, вариант А1), системный Node 20 не трогается; `build` в Actions переведён на Node 22.

## Итог

Прод выпускается слиянием PR main → prod, без ручного входа на сервер. Откат — `rollback.sh`. Дальше — Node 22 для выкладки и снятие старой разработки с 45.90.32.35 по второму runbook.

## Вторая часть: Node 22 и снятие старой разработки

Выполнено автором по `docs/runbooks/prod-node22-i-uborka.md` целиком. Как и выше, итоги записаны со слов автора и Ревизора Пульта, без выводов команд.

- **Шаг А.** `pm2` без процессов. Архив `node-v22.23.4-linux-x64.tar.xz` сверен по `SHASUMS256.txt` — OK. От `alyans-deploy` — `v22.23.4`, npm `10.9.9`; `/usr/bin/node` — `v20.20.2`, не тронут; `easy-plan.ru` — 200.
- **Шаг Б.** Установка из `9e56c11`; `systemd-analyze verify` без ошибок; `PATH` службы на `/opt/node22`; `cd /` в скрипте; таймер на месте.
- **Второй выпуск.** PR #2 слит автором; `prod` = `3be222d3719d4030b19fde4dac1d200e2e330d69`; `version.txt` и `current-sha` совпали; `EBADENGINE` — 0.
- **Шаг В.1.** tmux-сессий и процессов `claude` под root нет; порт 4321 свободен; `prod-dist` в `sites-enabled` не встречается; `/root/.ssh/config` нет. В.2 не понадобился.
- **Шаги В.3–В.4.** Удалено 7 путей из 7: `/root/.claude`, `/root/.local/share/claude`, `/root/.local/bin/claude`, `/root/.cache/ms-playwright`, `/var/www/alyans/prod-dist`, оба файла `id_ed25519_alyans-write`. После: `version.txt` = `current-sha` = `3be222d`; `easy-plan.ru` — 200, `dev.alyans-em.ru` — 200, `watch.serega-hub.ru` — 401, `alyans-em.ru` — 200.

Итог второй части: выпуски идут на Node 22 без `EBADENGINE`; на 45.90.32.35 нет ни старой разработки, ни Claude Code.
