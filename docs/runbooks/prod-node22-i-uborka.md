# Node 22 для выкладки и снятие старой разработки

Для автора. Всё выполняется на 45.90.32.35 под своим пользователем с sudo, из каталога `/`. Claude Code туда доступа не имеет.

Порядок: А → Б → слияние PR main → prod → В. Результат шага не совпал с «Ожидается» — стоп, следующий шаг не выполняется, сначала откат шага. После любого `reload` nginx — проверка `watch.serega-hub.ru` → `401` (в этом runbook reload нет; если понадобился при откате — проверка обязательна).

Зачем Node 22: `undici@8.10.2` (зависимость `astro` через `unifont`) требует Node ≥ 22.19.0; на системном Node 20 `npm ci` печатает `EBADENGINE`. Версия — **22.23.4**, актуальный LTS ветки 22 (Jod) на 2026-10-28.

EasyPlan снят 2026-10-14: на машине от него только статическая заглушка nginx `easy-plan.ru` («Site closed.»), процессов PM2 нет, системный `/usr/bin/node` никто не обслуживает.

---

## Шаг А. Node 22 для выкладки в /opt

Node 22 ставится отдельным каталогом и виден только службе `alyans-release` — через `Environment=PATH=/opt/node22/bin:…` в её юните (юнит обновляется на шаге Б). Системный `/usr/bin/node` не меняется.

**Где:** 45.90.32.35.

Снимок до:
```
cd /
/usr/bin/node -v
sudo pm2 list
```
**Ожидается:** `v20.x`; `sudo pm2 list` — процессов нет (EasyPlan снят 2026-10-14). Если процесс есть — стоп, вывод Ревизору.

Установка:
```
cd /tmp
curl -fsSLO https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
grep ' node-v22.23.4-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
sudo tar -xJf node-v22.23.4-linux-x64.tar.xz -C /opt
sudo chown -R root:root /opt/node-v22.23.4-linux-x64
sudo ln -sfn /opt/node-v22.23.4-linux-x64 /opt/node22
rm node-v22.23.4-linux-x64.tar.xz SHASUMS256.txt
cd /
```

Проверка:
```
sudo -u alyans-deploy -H env -i PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node -v
sudo -u alyans-deploy -H env -i PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm -v
/usr/bin/node -v
command -v node
sudo pm2 list
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
```
**Ожидается:**
- `sha256sum -c` — `node-v22.23.4-linux-x64.tar.xz: OK`;
- от `alyans-deploy` с этим PATH — `v22.23.4`, `npm -v` печатает версию;
- `/usr/bin/node -v` — тот же `v20.x`, что в снимке;
- `command -v node` — `/usr/bin/node` (системный PATH не изменился);
- `sudo pm2 list` — процессов нет; если процесс есть — стоп, вывод Ревизору;
- `easy-plan.ru` — `200` (заглушка).

**Откат:**
```
sudo rm /opt/node22
sudo rm -r /opt/node-v22.23.4-linux-x64
```
Если шаг Б уже выполнен — сначала откат шага Б.

---

## Шаг Б. Переустановка скриптов и юнитов

**Где:** 45.90.32.35. `<SHA>` — хеш коммита в `main` с финальными `deploy/` и юнитом с PATH на `/opt/node22`, его называет отчёт Claude Code. Единственный плейсхолдер в runbook.

```
cd /
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src fetch origin main
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src merge-base --is-ancestor <SHA> origin/main && echo in-main
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/release.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/release.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/rollback.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/rollback.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/alyans-release.service | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.service
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/alyans-release.timer | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.timer
sudo systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/alyans-release.service /etc/systemd/system/alyans-release.timer
systemctl show alyans-release.service -p Environment
grep -c '^cd /$' /usr/local/lib/alyans-deploy/release.sh
systemctl list-timers --all | grep -i alyans
```

**Ожидается:**
- `in-main`;
- `systemd-analyze verify` без ошибок;
- `Environment=PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;
- `grep -c` — `1`;
- таймер на месте, следующий запуск в пределах 2 минут.

Затем — слияние PR main → prod в GitHub. Через 2–4 минуты:
```
journalctl -u alyans-release --since -15min --no-pager | grep -c EBADENGINE
journalctl -u alyans-release -n 5 --no-pager
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
sudo cat /var/lib/alyans-deploy/state/current-sha
```
**Ожидается:** `EBADENGINE` — `0`; последняя строка журнала — `alyans-release: готово: <хеш prod>`; `version.txt` и `current-sha` совпадают с хешем `prod` в GitHub.

**Откат:** то же самое из хеша `bb8c2f15a672f6911f27e139735b44014c0df188` (прежние скрипты и юниты, без PATH на Node 22):
```
cd /
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show bb8c2f15a672f6911f27e139735b44014c0df188:deploy/release.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/release.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show bb8c2f15a672f6911f27e139735b44014c0df188:deploy/rollback.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/rollback.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show bb8c2f15a672f6911f27e139735b44014c0df188:deploy/alyans-release.service | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.service
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show bb8c2f15a672f6911f27e139735b44014c0df188:deploy/alyans-release.timer | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.timer
sudo systemctl daemon-reload
```

---

## Шаг В. Снятие старой разработки

**Не трогать staging:** `dev.alyans-em.ru`, `/var/www/alyans/staging-dist`, `/var/www/alyans/staging`, vhost `alyans-dev` — они уходят только с переездом staging. Около 70 системных пакетов, поставленных Playwright, тоже не трогать.

Claude Code под root снимается целиком: EasyPlan его больше не использует.

### В.1. Проверка перед снятием — только чтение

**Где:** 45.90.32.35.

```
cd /
sudo ls -la /root/.claude /root/.local/share/claude /root/.local/bin/claude /root/.cache/ms-playwright /var/www/alyans/prod-dist
sudo sh -c 'ls -la /root/.ssh/id_ed25519_alyans-write*'
sudo tmux ls
pgrep -a -u root claude
sudo ss -tlnp | grep 4321
grep -rn prod-dist /etc/nginx/sites-enabled/
sudo grep -rn alyans-write /root/.ssh/config
```

**Ожидается:**
- перечисленные пути существуют (какого-то нет — уже снят, просто пропустить его в В.3);
- `sudo tmux ls` — сессии root; **если среди них есть что-то кроме `alyans` и `work` — стоп, вывод Ревизору**;
- `pgrep -a -u root claude` — процессы Claude Code под root (вывод сохранить для В.2);
- `grep prod-dist` по `sites-enabled` — пусто: nginx раздаёт `/var/www/alyans/prod/current`;
- `grep alyans-write` по `/root/.ssh/config` — пусто (или файла нет).

Вывод `tmux ls` и `pgrep` — Ревизору: он называет сессии, которые остаются (если такие есть). Без его ответа к В.2 не переходить.

**Откат:** не нужен, шаг ничего не меняет.

### В.2. Остановка Claude Code и сессий root

Завершаются все процессы `claude` под root и все tmux-сессии root, кроме названных Ревизором по выводу В.1. Если Ревизор не назвал ни одной — все сессии:
```
sudo pkill -u root -f 'astro preview' || echo "preview не запущен"
sudo pkill -u root claude || echo "claude не запущен"
sudo tmux kill-server || echo "tmux root не запущен"
```
Если Ревизор назвал сессии, которые остаются, — вместо `kill-server` по одной строке на каждую уходящую сессию из вывода `tmux ls`: `sudo tmux kill-session -t alyans`, `sudo tmux kill-session -t work`.

Проверка:
```
pgrep -a -u root claude || echo "claude нет"
sudo tmux ls || echo "сессий root нет"
sudo ss -tlnp | grep 4321 || echo "4321 свободен"
```
**Ожидается:** `claude нет`; в `tmux ls` — только сессии, названные Ревизором (или `сессий root нет`); `4321 свободен`.

**Откат:** не требуется — разработка на этой машине больше не ведётся.

### В.3. Удаление

```
sudo rm -rf /root/.claude /root/.local/share/claude /root/.local/bin/claude /root/.cache/ms-playwright /var/www/alyans/prod-dist
sudo rm -f /root/.ssh/id_ed25519_alyans-write /root/.ssh/id_ed25519_alyans-write.pub
sudo ls -la /root/.claude /root/.local/share/claude /root/.local/bin/claude /root/.cache/ms-playwright /var/www/alyans/prod-dist /root/.ssh/id_ed25519_alyans-write /root/.ssh/id_ed25519_alyans-write.pub 2>&1 | grep -c 'No such file'
```
`/root/.claude` — там учётные данные подписки Claude. Deploy-ключ `alyans-write` на GitHub уже снят с архива.

**Ожидается:** счётчик `No such file` — `7`.

**Откат:** нет — удаление необратимо. Поэтому В.1 обязателен.

### В.4. Проверка после

```
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
sudo cat /var/lib/alyans-deploy/state/current-sha
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
curl -sS -o /dev/null -w '%{http_code}\n' https://dev.alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code}\n' https://watch.serega-hub.ru/
sudo pm2 list
```
**Ожидается:** `version.txt` равен `current-sha` (текущий prod); `easy-plan.ru` — `200` (заглушка); `dev.alyans-em.ru` — `200`; `watch.serega-hub.ru` — `401`; `sudo pm2 list` — процессов нет (если процесс есть — стоп, вывод Ревизору).
