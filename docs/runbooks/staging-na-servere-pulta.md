# Переезд staging dev.alyans-em.ru на сервер Пульта

Для автора и исполнителя (Claude Code). Сервер Пульта — 212.108.82.87; прод — 45.90.32.35. Claude Code на серверах ничего не выполняет, кроме шага 3 (выкладка в `/var/www/alyans-staging` от пользователя `alyans`).

Что получится: `dev.alyans-em.ru` раздаётся nginx сервера Пульта из `/var/www/alyans-staging`, закрыт от индексации заголовком `X-Robots-Tag` и `robots.txt` staging-сборки; выкладка — `npm run deploy:staging` исполнителем после каждой завершённой работы. Старый staging на 45.90.32.35 снимается, его роль стока незаданных хостов переходит отдельному файлу `00-default-drop`.

Правило на весь runbook: результат шага не совпал с «Ожидается» — стоп, следующий шаг не выполняется, сначала откат шага. После любого `reload` nginx на 45.90.32.35 — проверка `watch.serega-hub.ru` → `401`.

Единственный плейсхолдер — `<хеш>` в шаге 2: полный хеш коммита в `main`, в котором лежит `deploy/nginx/dev.alyans-em.ru.conf`; его называет отчёт Claude Code.

---

## Шаг 1. Перенос рабочего каталога

**Где:** сервер Пульта, автор под `alyans`.

1. В Claude Code — `/exit`. Сессия tmux остаётся.
2. В той же сессии tmux:
```
mv ~/alyans-site ~/alyans-site-archive-clone
mv ~/alyans-site-new ~/alyans-site
rm ~/.ssh/id_ed25519_alyans-site ~/.ssh/id_ed25519_alyans-site.pub
git -C ~/alyans-site remote -v
git -C ~/alyans-site config core.sshCommand
git -C ~/alyans-site-archive-clone remote -v
cd ~/alyans-site && claude
```
Первый `mv` — сначала: старый клон архива занимает имя `~/alyans-site`, без него второй `mv` упрётся в существующий каталог. Старый ключ `id_ed25519_alyans-site` был привязан к архиву, с архива ключи сняты. Внутри Claude Code, если сбросился режим экрана, — `/tui fullscreen`.

**Ожидается:**
- `git -C ~/alyans-site remote -v` — `git@github.com:SeregaCh/alyans-site.git`;
- `core.sshCommand` — `ssh -i ~/.ssh/id_ed25519_alyans-site-v2 -o IdentitiesOnly=yes`;
- `~/alyans-site-archive-clone` смотрит на `SeregaCh/alyans-site-archive.git`;
- Claude Code стартует в `~/alyans-site`.

После перезапуска исполнитель правит пути в `CLAUDE.md` и `PROJECT.md` (`~/alyans-site-new` → `~/alyans-site`), коммит, push.

**Откат:**
```
mv ~/alyans-site ~/alyans-site-new
mv ~/alyans-site-archive-clone ~/alyans-site
```
Удаление старого ключа не откатывается — он уже нигде не действует.

---

## Шаг 2. Каталог и vhost на сервере Пульта

**Где:** сервер Пульта, автор под `serega`, через sudo. Только `nginx -t` и `reload`, никогда `restart`.

Проверка перед правкой:
```
command -v rsync || echo "rsync нет"
ls -l /etc/nginx/sites-enabled/
curl -sS -H "Host: nope.invalid" http://127.0.0.1/
```
**Ожидается:** `rsync` найден (если `rsync нет` — установить `sudo apt-get install -y rsync` с согласия Ревизора Пульта: без него шаг 3 упадёт); файла `dev.alyans-em.ru` в `sites-enabled` нет; запрос с чужим Host — `Empty reply from server` (сток Пульта на месте).

Правка:
```
sudo install -d -o alyans -g alyans -m 755 /var/www/alyans-staging
sudo curl -fsSL https://raw.githubusercontent.com/SeregaCh/alyans-site/<хеш>/deploy/nginx/dev.alyans-em.ru.conf -o /etc/nginx/sites-available/dev.alyans-em.ru
sudo grep -c 'server_name dev.alyans-em.ru;' /etc/nginx/sites-available/dev.alyans-em.ru
sudo grep -c 'default_server' /etc/nginx/sites-available/dev.alyans-em.ru
sudo ln -s /etc/nginx/sites-available/dev.alyans-em.ru /etc/nginx/sites-enabled/dev.alyans-em.ru
sudo nginx -t && sudo systemctl reload nginx
sleep 2
```
Проверки:
```
curl -sS -o /dev/null -w '%{http_code}\n' https://serega-hub.ru/health
curl -sS -o /dev/null -w '%{http_code}\n' https://dev.serega-hub.ru/health
curl -sS -H "Host: nope.invalid" http://127.0.0.1/
ls -ld /var/www/alyans-staging
```
**Ожидается:** `grep -c` — `1` и `0`; `nginx -t` — `syntax is ok`, `test is successful`; оба `/health` — `200`; чужой Host — `Empty reply from server`; каталог `drwxr-xr-x alyans alyans`.

**Откат:**
```
sudo rm /etc/nginx/sites-enabled/dev.alyans-em.ru
sudo nginx -t && sudo systemctl reload nginx
```

---

## Шаг 3. Первая выкладка

**Где:** сервер Пульта, исполнитель (Claude Code) под `alyans`, в `~/alyans-site`.

```
npm ci
npm run deploy:staging
curl -sSI --resolve dev.alyans-em.ru:80:127.0.0.1 http://dev.alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code}\n' --resolve dev.alyans-em.ru:80:127.0.0.1 http://dev.alyans-em.ru/net-takoy-stranitsy/
curl -sS --resolve dev.alyans-em.ru:80:127.0.0.1 http://dev.alyans-em.ru/robots.txt
```
**Ожидается:** `deploy:staging` — код 0; главная — `HTTP/1.1 200` и `X-Robots-Tag: noindex, nofollow`; несуществующий путь — `404`; `robots.txt` — `Disallow: /`.

**Откат:** не требуется — `dev.alyans-em.ru` ещё не смотрит на этот сервер. Повтор — та же команда.

---

## Шаг 4. DNS

**Где:** Яндекс 360 — кабинет организации → Домены → `alyans-em.ru` → Управлять DNS-записями. Делает автор.

- **Изменить** существующую A-запись `dev`: значение `45.90.32.35` → `212.108.82.87`, TTL `600`. **Не добавлять вторую** A-запись — две записи будут раздаваться по очереди.
- Почтовые записи (MX, TXT, CNAME `mail`) не трогать.
- NS у Beget не трогать — уронит почту.

Проверка на сервере Пульта:
```
getent hosts dev.alyans-em.ru
```
**Ожидается:** `212.108.82.87`. Если отдаёт старый адрес — подождать TTL и повторить.

**Окно:** пока на новом сервере нет сертификата, `https://dev.alyans-em.ru` у тех, кто уже получил новый адрес, не откроется — сток отвергает рукопожатие. Шаг 5 — сразу после шага 4.

**Откат:** вернуть значение A-записи `dev` на `45.90.32.35`.

---

## Шаг 5. Сертификат

**Где:** сервер Пульта, автор под `serega`.

```
sudo cp -p /etc/nginx/sites-available/dev.alyans-em.ru /root/dev.alyans-em.ru.before-certbot
sudo certbot --nginx -d dev.alyans-em.ru
sudo nginx -t
curl -sSI https://dev.alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' http://dev.alyans-em.ru/
sudo certbot renew --dry-run
curl -sS -o /dev/null -w '%{http_code}\n' https://serega-hub.ru/health
curl -sS -o /dev/null -w '%{http_code}\n' https://dev.serega-hub.ru/health
```
**Ожидается:** certbot выпустил сертификат и дописал 443 в `dev.alyans-em.ru`; `https://dev.alyans-em.ru/` — `200` и `X-Robots-Tag: noindex, nofollow`; `http` — `301 https://dev.alyans-em.ru/`; `renew --dry-run` — успех; оба `/health` — `200`.

С этого шага действует правило CLAUDE.md: после каждой завершённой работы, меняющей сайт, — `npm run deploy:staging` и проверка `https://dev.alyans-em.ru/` по `--resolve`.

**Откат:**
```
sudo cp -p /root/dev.alyans-em.ru.before-certbot /etc/nginx/sites-available/dev.alyans-em.ru
sudo nginx -t && sudo systemctl reload nginx
sudo certbot delete --cert-name dev.alyans-em.ru
curl -sS -o /dev/null -w '%{http_code}\n' https://serega-hub.ru/health
```
Vhost возвращается к виду до certbot (только 80), сертификат удаляется. DNS при этом остаётся на 212.108.82.87 — если staging нужен по https немедленно, вместе с этим откатить шаг 4.

---

## Шаг 6. Снятие старого staging на 45.90.32.35

**Где:** 45.90.32.35, автор под root. **Только после шага 5.**

**Внимание:** сток `default_server` (`listen 80 default_server; return 444`) сейчас живёт внутри файла `alyans-dev`. Удалить файл — и незаданные хосты на 80 уйдут сайту прода, а на 443 первым по алфавиту станет `alyans-prod`. Поэтому сначала отдельный сток на обоих портах, и переключение одной командой.

Проверка перед правкой:
```
ls -l /etc/nginx/sites-enabled/
grep -rn default_server /etc/nginx/sites-enabled/
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
cat /var/lib/alyans-deploy/state/current-sha
```
**Ожидается:** в `sites-enabled` есть `alyans-dev`; `default_server` встречается только в `alyans-dev`; `version.txt` равен `current-sha`. Иначе — стоп.

Файл стока:
```
cat > /etc/nginx/sites-available/00-default-drop <<'EOF'
# Сток незаданных хостов: 80 — закрыть соединение без ответа, 443 — отвергнуть рукопожатие.
server {
    listen 80 default_server;
    server_name _;
    return 444;
}
server {
    listen 443 ssl default_server;
    server_name _;
    ssl_reject_handshake on;
}
EOF
```

Переключение одной командой, затем проверка конфигурации:
```
rm /etc/nginx/sites-enabled/alyans-dev && ln -s /etc/nginx/sites-available/00-default-drop /etc/nginx/sites-enabled/00-default-drop
nginx -t
```
Если `nginx -t` с ошибкой — вернуть симлинки и не перезагружать:
```
rm /etc/nginx/sites-enabled/00-default-drop && ln -s /etc/nginx/sites-available/alyans-dev /etc/nginx/sites-enabled/alyans-dev && nginx -t
```
Если без ошибки:
```
systemctl reload nginx
sleep 2
```

Проверки:
```
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
cat /var/lib/alyans-deploy/state/current-sha
curl -sS -H "Host: nope.invalid" http://127.0.0.1/
curl -sS --resolve nope.invalid:443:127.0.0.1 https://nope.invalid/
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
curl -sS -o /dev/null -w '%{http_code}\n' https://watch.serega-hub.ru/
```
**Ожидается:** `version.txt` равен `current-sha`; Host `nope.invalid` на 80 — `Empty reply from server`; на 443 — ошибка рукопожатия (`curl: (35) … unrecognized name` или `handshake failure`); `easy-plan.ru` — `200`; `watch.serega-hub.ru` — `401`.

Удаление старого staging:
```
certbot delete --cert-name dev.alyans-em.ru
rm /etc/nginx/sites-available/alyans-dev
rm -r /var/www/alyans/staging-dist /var/www/alyans/staging
nginx -t && systemctl reload nginx
sleep 2
```
После всех удалений — те же проверки ещё раз:
```
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
cat /var/lib/alyans-deploy/state/current-sha
curl -sS -H "Host: nope.invalid" http://127.0.0.1/
curl -sS --resolve nope.invalid:443:127.0.0.1 https://nope.invalid/
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
curl -sS -o /dev/null -w '%{http_code}\n' https://watch.serega-hub.ru/
```
**Ожидается:** то же, что выше.

**Откат** — только до удаления файлов (после `certbot delete` и `rm` старый staging не восстановить; он и не нужен — `dev.alyans-em.ru` уже на сервере Пульта):
```
rm /etc/nginx/sites-enabled/00-default-drop && ln -s /etc/nginx/sites-available/alyans-dev /etc/nginx/sites-enabled/alyans-dev
nginx -t && systemctl reload nginx
curl -sS -o /dev/null -w '%{http_code}\n' https://watch.serega-hub.ru/
```
