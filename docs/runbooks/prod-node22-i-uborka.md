# Node 22 для выкладки и снятие старой разработки

Для автора. Всё выполняется на 45.90.32.35 под своим пользователем с sudo, из каталога `/`. Claude Code туда доступа не имеет.

Порядок: А → Б → слияние PR main → prod → В. Результат шага не совпал с «Ожидается» — стоп, следующий шаг не выполняется, сначала откат шага. После любого `reload` nginx — проверка `watch.serega-hub.ru` → `401` (в этом runbook reload нет; если понадобился при откате — проверка обязательна).

Зачем Node 22: `undici@8.10.2` (зависимость `astro` через `unifont`) требует Node ≥ 22.19.0; на системном Node 20 `npm ci` печатает `EBADENGINE`. Версия — **22.23.4**, актуальный LTS ветки 22 (Jod) на 2026-10-28.

---

## Шаг А. Node 22 для выкладки

Системный Node на 45.90.32.35 общий с EasyPlan: его PM2-процесс работает на `/usr/bin/node`. Поэтому два варианта; **выбран А1**, А2 описан на случай, если EasyPlan сам переходит на 22.

Перед любым вариантом — снимок, чтобы сравнить после:
```
cd /
/usr/bin/node -v
sudo pm2 list
```
**Ожидается:** `v20.x`; в `pm2 list` — `easy-plan` в статусе `online`, запомнить его `uptime` и `↺` (число рестартов). Если `pm2 list` пуст — EasyPlan запущен под другим пользователем: стоп, вопрос архитектору Пульта.

### А1 (рекомендуемый): Node 22 только для выкладки, в /opt

`/usr/bin/node` и EasyPlan не трогаются. Node 22 видит только служба `alyans-release` — через `Environment=PATH=/opt/node22/bin:…` в её юните (юнит обновляется на шаге Б).

**Где:** 45.90.32.35.

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
```
**Ожидается:**
- `sha256sum -c` — `node-v22.23.4-linux-x64.tar.xz: OK`;
- от `alyans-deploy` с этим PATH — `v22.23.4`, `npm -v` печатает версию;
- `/usr/bin/node -v` — тот же `v20.x`, что в снимке;
- `command -v node` — `/usr/bin/node` (системный PATH не изменился);
- `pm2 list` — `easy-plan` `online`, `uptime` не сброшен, `↺` тот же.

**Откат:**
```
sudo rm /opt/node22
sudo rm -r /opt/node-v22.23.4-linux-x64
```
Если шаг Б уже выполнен — сначала откат шага Б (юнит ссылается на `/opt/node22`; без каталога PATH просто проваливается на `/usr/bin`, но делать так намеренно не надо).

### А2: системно через NodeSource 22.x — только с подтверждением

**Обязательное условие до начала:** совместимость EasyPlan с Node 22 подтверждает архитектор Пульта. Без подтверждения — не выполнять.

**Где:** 45.90.32.35.

```
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup_22.sh
less nodesource_setup_22.sh
sudo bash nodesource_setup_22.sh
sudo apt-get install -y nodejs
/usr/bin/node -v
sudo pm2 list
sudo pm2 restart all
sleep 5
sudo pm2 list
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
cd /
```
`pm2 restart all` — только если в `pm2 list` один процесс, `easy-plan`; если процессов больше — стоп, вопрос архитектору Пульта.

**Ожидается:** `/usr/bin/node -v` — `v22.x`; после рестарта `easy-plan` `online`; `easy-plan.ru` — `200`.

**Откат:**
```
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_20.x -o nodesource_setup_20.sh
sudo bash nodesource_setup_20.sh
sudo apt-get install -y --allow-downgrades nodejs="$(apt-cache madison nodejs | awk '$3 ~ /^20\./ {print $3; exit}')"
/usr/bin/node -v
sudo pm2 restart all
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
cd /
```

---

## Шаг Б. Переустановка скриптов и юнитов

**Где:** 45.90.32.35. `<SHA>` — хеш коммита в `main` с этим runbook, его называет отчёт Claude Code. Единственный плейсхолдер в runbook.

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

### В.1. Проверка перед снятием — только чтение

**Где:** 45.90.32.35.

```
cd /
sudo ls -la /root/.claude /root/.local/share/claude /root/.local/bin/claude /root/.cache/ms-playwright /var/www/alyans/prod-dist
sudo sh -c 'ls -la /root/.ssh/id_ed25519_alyans-write*'
sudo tmux ls
sudo tmux list-panes -a -F '#{session_name} #{pane_pid} #{pane_current_command}'
ps -eo user,pid,etime,cmd | grep -i '[c]laude'
sudo ss -tlnp | grep 4321
grep -rn prod-dist /etc/nginx/sites-enabled/
sudo grep -rn alyans-write /root/.ssh/config
```

**Ожидается:**
- перечисленные пути существуют (какого-то нет — уже снят, просто пропустить его в В.3);
- `grep prod-dist` по `sites-enabled` — пусто: nginx раздаёт `/var/www/alyans/prod/current`;
- `grep alyans-write` по `/root/.ssh/config` — пусто (или файла нет);
- **Claude Code работает только в сессии `alyans`.** Если `claude` виден в сессии `work` (EasyPlan) или вне tmux — стоп: `/root/.claude`, `/root/.local/share/claude` и `/root/.local/bin/claude` общие для всех сессий root, их удаление выбьет и чужую. Вопрос архитектору Пульта.

**Откат:** не нужен, шаг ничего не меняет.

### В.2. Остановка старой сессии

```
sudo pkill -f 'astro preview' || echo "preview не запущен"
sudo tmux kill-session -t alyans || echo "сессии alyans нет"
sudo ss -tlnp | grep 4321 || echo "4321 свободен"
sudo tmux ls
```
**Ожидается:** `4321 свободен`; в `tmux ls` нет `alyans`, сессия `work` на месте.

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
**Ожидается:** `version.txt` равен `current-sha` (текущий prod); `easy-plan.ru` — `200`; `dev.alyans-em.ru` — `200`; `watch.serega-hub.ru` — `401`; `easy-plan` `online`.
