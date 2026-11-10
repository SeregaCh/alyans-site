# Восстановление прода alyans-em.ru на prod-ru1

Для автора. Сервер prod-ru1 — 137.22.148.13 (AdminVPS, Москва; Ubuntu 24.04, 2 vCPU / 4 ГБ / 60 ГБ, часы Etc/UTC). Вход: `ssh -i $env:USERPROFILE\.ssh\prod_ru1 serega@137.22.148.13`, дальше — `sudo`. Claude Code туда доступа не имеет.

Повод: прод на 45.90.32.35 уничтожен 2026-11-02 вместе с облаком Beget. У сайта нет данных — всё в репозитории, поэтому восстановление = прогон этого runbook-а.

Что получится — та же схема, что была на 45.90.32.35: таймер `alyans-release` раз в 2 минуты смотрит ветку `prod` в GitHub; новый коммит собирается в чистом каталоге на Node 22 из `/opt/node22`, кладётся в `/var/www/alyans/prod/releases/` под своим хешем, ссылка `current` переключается атомарно и проверяется по `https://alyans-em.ru/version.txt`. Nginx раздаёт `/var/www/alyans/prod/current`.

Что уже стоит на машине (от Ревизора Пульта): ufw — входящие 22/80/443; fail2ban; автообновления; nginx со стоком `00-default-drop` (неизвестный Host — 444, неизвестный SNI — отказ рукопожатия); certbot; Docker.

**Соседи — не трогать:** сайт `watch.serega-hub.ru` (nginx) и контейнер Gatus `pult-observer` на `127.0.0.1:8080`. Nginx общий — только `nginx -t` и `reload`, никогда `restart`; чужие vhost не правятся.

Правила на весь runbook:
- результат шага не совпал с «Ожидается» — стоп, следующий шаг не выполняется, сначала откат шага;
- все команды — из каталога `/`;
- после каждого `reload` nginx — **сверка соседей** (шаг 1) с эталоном шага 1;
- `alyans-deploy` не входит ни в `sudo`, ни в `docker`, ни в `adm`: группа `docker` на этой машине равна root.

Единственный плейсхолдер на весь файл — `<хеш>` в шагах 7 и 9: полный хеш коммита в `main`, в котором лежат и `deploy/`, и `deploy/nginx/alyans-em.ru.conf`; его называет отчёт Claude Code.

---

## Шаг 1. Разведка — только чтение

**Где:** prod-ru1, автор под `serega`.

```
cd /
ls -l /etc/nginx/sites-enabled/
sudo nginx -T 2>/dev/null | grep -E 'server_name|listen'
sudo ss -tlnp
id alyans-deploy
ls /opt
ls -la /var/www
git --version
df -h /
```

**Сверка соседей** — эти же четыре строки повторяются после каждого `reload` nginx:
```
curl -sS -o /dev/null -w '%{http_code}\n' https://watch.serega-hub.ru/
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
curl -sS -H 'Host: nope.invalid' http://127.0.0.1/
curl -sS --resolve nope.invalid:443:127.0.0.1 https://nope.invalid/
```

**Ожидается — эталон «до», записать фактом:**
- `watch.serega-hub.ru` — `401`;
- `127.0.0.1:8080` — `200`;
- `nope.invalid` на 80 — `curl: (52) Empty reply from server`;
- `nope.invalid` на 443 — `curl: (35) …` (отказ рукопожатия: `unrecognized name` или `handshake failure`);
- в `nginx -T` нет `server_name alyans-em.ru` и `server_name www.alyans-em.ru`;
- `id alyans-deploy` — `no such user`;
- в `/opt` нет `node22` и `node-v22.*`;
- в `/var/www` нет `alyans`;
- `git --version` печатает версию.

Иначе — стоп, ничего не менять, вывод Ревизору.

**Откат:** не нужен, шаг ничего не меняет.

---

## Шаг 2. Пользователь alyans-deploy и каталоги

**Где:** prod-ru1.

```
cd /
sudo adduser --system --group --home /var/lib/alyans-deploy --shell /usr/sbin/nologin alyans-deploy
sudo install -d -o alyans-deploy -g alyans-deploy -m 700 /var/lib/alyans-deploy/.ssh /var/lib/alyans-deploy/state
sudo install -d -o root -g root -m 755 /var/www/alyans
sudo install -d -o alyans-deploy -g www-data -m 2750 /var/www/alyans/prod /var/www/alyans/prod/releases
sudo ls -la /var/lib/alyans-deploy /var/www/alyans /var/www/alyans/prod
id alyans-deploy
id -nG alyans-deploy | tr ' ' '\n' | grep -xE 'sudo|docker|adm' || echo "чужих групп нет"
```

**Ожидается:**
- `.ssh` и `state` — `drwx------ alyans-deploy alyans-deploy`;
- `/var/www/alyans` — `drwxr-xr-x root root`;
- `prod` и `prod/releases` — `drwxr-s--- alyans-deploy www-data`;
- `id alyans-deploy` — только группа `alyans-deploy`;
- последняя строка — `чужих групп нет`. **Если напечатано `sudo`, `docker` или `adm` — стоп и откат шага:** группа `docker` равна root.

**Откат:**
```
sudo rm -r /var/www/alyans
sudo deluser --system alyans-deploy
sudo rm -r /var/lib/alyans-deploy
```

---

## Шаг 3. Ключ только для чтения

**Где:** prod-ru1, затем GitHub в браузере.

```
cd /
sudo -u alyans-deploy ssh-keygen -t ed25519 -N "" -C "alyans-site ro (prod-ru1 137.22.148.13)" -f /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro
sudo cat /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro.pub
```

Открытую половину — в `SeregaCh/alyans-site` → Settings → Deploy keys → Add deploy key. Заголовок: `alyans-site ro (prod-ru1 137.22.148.13)`. Галочку **«Allow write access» не ставить**.

Там же удалить старый ключ `alyans-site prod read (45.90)` — его сервера больше нет.

**Ожидается:** в Deploy keys новый ключ с пометкой `Read-only`; ключа `alyans-site prod read (45.90)` в списке нет.

**Откат:** удалить новый ключ в Deploy keys; `sudo rm /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro.pub`. Старый ключ не возвращается — он ни к чему не привязан.

---

## Шаг 4. known_hosts из опубликованной строки GitHub

**Где:** prod-ru1. `ssh-keyscan` не используется: он берёт ключ у того, кто ответил, а не у GitHub.

```
cd /
echo 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' | sudo -u alyans-deploy tee /var/lib/alyans-deploy/.ssh/known_hosts >/dev/null
sudo chmod 600 /var/lib/alyans-deploy/.ssh/known_hosts
sudo -u alyans-deploy ssh-keygen -lf /var/lib/alyans-deploy/.ssh/known_hosts
```

**Ожидается:** `256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)`.

**Откат:** `sudo rm /var/lib/alyans-deploy/.ssh/known_hosts`.

---

## Шаг 5. Клон ветки prod

**Где:** prod-ru1.

```
cd /
sudo -u alyans-deploy -H git -c core.sshCommand="ssh -i /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/var/lib/alyans-deploy/.ssh/known_hosts" clone --branch prod git@github.com:SeregaCh/alyans-site.git /var/lib/alyans-deploy/src
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src config core.sshCommand "ssh -i /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/var/lib/alyans-deploy/.ssh/known_hosts"
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src log -1 --format='%H %s' origin/prod
```

**Ожидается:** клон без вопроса о ключе хоста; последний коммит `origin/prod` — `3be222d3719d4030b19fde4dac1d200e2e330d69`, пока открытый PR main → prod не слит (его сливают только на шаге 13). Этот хеш дальше называется «хеш prod».

**Откат:** `sudo rm -r /var/lib/alyans-deploy/src`.

---

## Шаг 6. Node 22.23.4 в /opt/node22

Node ставится отдельным каталогом и виден только службе `alyans-release` — через `Environment=PATH=/opt/node22/bin:…` в её юните. Системный Node не ставится.

**Где:** prod-ru1.

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
sudo -u alyans-deploy -H env -i HOME=/var/lib/alyans-deploy PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin node -v
sudo -u alyans-deploy -H env -i HOME=/var/lib/alyans-deploy PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin npm -v
command -v node || echo "системного node нет"
```

**Ожидается:**
- `sha256sum -c` — `node-v22.23.4-linux-x64.tar.xz: OK`;
- от `alyans-deploy` с PATH службы — `v22.23.4`, `npm -v` печатает версию;
- последняя строка — `системного node нет`.

**Откат:**
```
sudo rm /opt/node22
sudo rm -r /opt/node-v22.23.4-linux-x64
```

---

## Шаг 7. Скрипты и юниты

**Где:** prod-ru1. Скрипты и юниты — из коммита `<хеш>`.

```
cd /
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src fetch origin main
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src merge-base --is-ancestor <хеш> origin/main && echo in-main
sudo install -d -o root -g root -m 755 /usr/local/lib/alyans-deploy
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <хеш>:deploy/release.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/release.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <хеш>:deploy/rollback.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/rollback.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <хеш>:deploy/alyans-release.service | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.service
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <хеш>:deploy/alyans-release.timer | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.timer
sudo systemctl daemon-reload
ls -l /usr/local/lib/alyans-deploy /etc/systemd/system/alyans-release.*
systemd-analyze verify /etc/systemd/system/alyans-release.service /etc/systemd/system/alyans-release.timer
systemctl show alyans-release.service -p Environment
systemctl list-timers --all | grep -i alyans || echo "таймер не включён"
```

**Ожидается:**
- `in-main`;
- два скрипта `-rwxr-xr-x root root`, два юнита `-rw-r--r-- root root`;
- `systemd-analyze verify` без ошибок;
- `Environment=PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`;
- последняя строка — `таймер не включён`. **Таймер на этом шаге не включается.**

**Откат:**
```
sudo rm -r /usr/local/lib/alyans-deploy
sudo rm /etc/systemd/system/alyans-release.service /etc/systemd/system/alyans-release.timer
sudo systemctl daemon-reload
```

---

## Шаг 8. Первый релиз вручную, с --no-verify

**Где:** prod-ru1, из каталога `/`. Запуск напрямую от `alyans-deploy`, не через service. Системного Node нет, поэтому PATH и HOME задаются как у службы: без `/opt/node22/bin` в PATH скрипт не найдёт `npm`. Проверка по https здесь невозможна — vhost ещё нет. Поэтому `--no-verify`; скрипт принимает его только при пустом `releases/` и без `current`. Вывод на экране — журнал этого прогона.

```
cd /
sudo -u alyans-deploy -H env -i HOME=/var/lib/alyans-deploy PATH=/opt/node22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin /usr/local/lib/alyans-deploy/release.sh --no-verify; echo "exit=$?"
sudo ls -l /var/www/alyans/prod /var/www/alyans/prod/releases
sudo cat /var/lib/alyans-deploy/state/current-sha
sudo cat /var/www/alyans/prod/current/version.txt
```

**Ожидается:**
- последняя строка вывода — `alyans-release: готово: ` и хеш prod из шага 5, `exit=0`;
- в `releases/` есть каталог с хешем prod, `current` указывает на него;
- `current-sha` и `version.txt` — тот же хеш.

**Откат:**
```
sudo rm /var/www/alyans/prod/current
sudo rm -r /var/www/alyans/prod/releases/3be222d3719d4030b19fde4dac1d200e2e330d69
sudo rm -f /var/lib/alyans-deploy/state/current-sha /var/lib/alyans-deploy/state/failed-sha
```
(если хеш prod на шаге 5 был другим — в `rm -r` подставить его; `ls /var/www/alyans/prod/releases` его покажет).

---

## Шаг 9. Nginx: vhost alyans-em.ru

**Где:** prod-ru1. Vhost — из коммита `<хеш>`: два server-блока на 80 (`alyans-em.ru` и `www.alyans-em.ru` → 301), без `default_server`, без 443 — его добавит certbot на шаге 11.

```
cd /
sudo curl -fsSL https://raw.githubusercontent.com/SeregaCh/alyans-site/<хеш>/deploy/nginx/alyans-em.ru.conf -o /etc/nginx/sites-available/alyans-em.ru
sudo grep -c 'server_name' /etc/nginx/sites-available/alyans-em.ru
sudo grep -c 'default_server' /etc/nginx/sites-available/alyans-em.ru
```
**Ожидается:** `2` и `0`. Иначе — стоп, `sudo rm /etc/nginx/sites-available/alyans-em.ru`.

Включение (пауза — reload применяется не мгновенно):
```
sudo ln -s /etc/nginx/sites-available/alyans-em.ru /etc/nginx/sites-enabled/alyans-em.ru
sudo nginx -t && sudo systemctl reload nginx
sleep 2
```

Проверки:
```
curl -fsS --resolve alyans-em.ru:80:127.0.0.1 http://alyans-em.ru/version.txt
sudo cat /var/lib/alyans-deploy/state/current-sha
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve www.alyans-em.ru:80:127.0.0.1 http://www.alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code}\n' --resolve alyans-em.ru:80:127.0.0.1 http://alyans-em.ru/net-takoy-stranitsy/
```
и сверка соседей (шаг 1).

**Ожидается:**
- `nginx -t` — `syntax is ok`, `test is successful`;
- `version.txt` равен `current-sha`;
- `www` — `301 https://alyans-em.ru/`;
- несуществующий путь — `404`;
- соседи — как в эталоне шага 1.

**Откат:**
```
sudo rm /etc/nginx/sites-enabled/alyans-em.ru
sudo nginx -t && sudo systemctl reload nginx
sleep 2
```
и сверка соседей с эталоном шага 1.

---

## Шаг 10. DNS

**Где:** Яндекс 360 — кабинет организации → Домены → `alyans-em.ru` → Управлять DNS-записями. Делает автор.

- **Изменить** существующую A-запись `@`: `45.90.32.35` → `137.22.148.13`.
- **Изменить** существующую A-запись `www`: `45.90.32.35` → `137.22.148.13`.
- **Вторые A-записи не добавлять** — две записи будут раздаваться по очереди.
- MX, TXT, CNAME `mail`, A `dev` — не трогать. NS у Beget не трогать — уронит почту.

Проверка на prod-ru1 (`systemd-resolved` здесь нет — сброс кэша не нужен, `getent` спрашивает DNS напрямую):
```
getent hosts alyans-em.ru
getent hosts www.alyans-em.ru
```

**Ожидается:** оба — `137.22.148.13`. Если отдаёт старый адрес — подождать TTL, повторить. Затем — **проверка почты отправкой и получением письма** на адрес домена: без неё шаг не закрыт.

**Откат:** вернуть прежнее значение A-записей `@` и `www` (сайт и так лежит).

---

## Шаг 11. Сертификат

**Где:** prod-ru1.

```
cd /
sudo cp -p /etc/nginx/sites-available/alyans-em.ru /root/alyans-em.ru.before-certbot
sudo certbot --nginx --redirect -d alyans-em.ru -d www.alyans-em.ru
sudo nginx -t
sleep 2
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
sudo cat /var/lib/alyans-deploy/state/current-sha
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve alyans-em.ru:80:127.0.0.1 http://alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve www.alyans-em.ru:443:127.0.0.1 https://www.alyans-em.ru/
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/robots.txt
sudo certbot renew --dry-run
```
и сверка соседей (шаг 1).

**Ожидается:**
- certbot выпустил сертификат на оба домена и дописал 443 в `alyans-em.ru`; `nginx -t` — `test is successful`;
- `version.txt` по https равен `current-sha`;
- `http://alyans-em.ru/` — `301 https://alyans-em.ru/`;
- `https://www.alyans-em.ru/` — `301 https://alyans-em.ru/`;
- в `robots.txt` есть строка `Allow: /`;
- `renew --dry-run` — успех по всем сертификатам машины;
- соседи — как в эталоне шага 1.

**Откат:**
```
sudo cp -p /root/alyans-em.ru.before-certbot /etc/nginx/sites-available/alyans-em.ru
sudo nginx -t && sudo systemctl reload nginx
sleep 2
sudo certbot delete --cert-name alyans-em.ru
```
и сверка соседей с эталоном шага 1. Vhost возвращается к виду шага 9 (только 80).

---

## Шаг 12. Таймер

**Где:** prod-ru1.

```
sudo systemctl enable --now alyans-release.timer
systemctl list-timers --all | grep -i alyans
```
Через 2–3 минуты:
```
sudo journalctl -u alyans-release -n 20 --no-pager
```

**Ожидается:** таймер `alyans-release.timer` в списке, следующий запуск в пределах 2 минут; в журнале — `alyans-release: prod не изменился (…) — выход`, в скобках хеш prod из шага 5.

**Откат:** `sudo systemctl disable --now alyans-release.timer`.

---

## Шаг 13. Проверка цепочки

**Где:** GitHub в браузере, затем prod-ru1.

Автор сливает открытый PR main → prod (в нём документы). Через 2–4 минуты:
```
curl -fsS https://alyans-em.ru/version.txt
sudo journalctl -u alyans-release -n 5 --no-pager
sudo cat /var/lib/alyans-deploy/state/current-sha
```

**Ожидается:** `version.txt` равен новому хешу `prod` в GitHub (merge-коммит PR); последняя строка журнала — `alyans-release: готово: ` и тот же новый хеш; `current-sha` — тот же хеш.

С этого момента выкладка — слияние PR main → prod в GitHub; журнал — `sudo journalctl -u alyans-release`.

**Откат:** аварийный откат ниже — на предыдущий релиз.

---

## Выкладка застряла на failed-sha

**Где:** prod-ru1. Упавший хеш таймер больше не собирает — ждёт новый коммит в `prod`. Если провал был случайным (сеть, реестр npm), тот же хеш можно выложить повторно.

**Как увидеть:**
```
sudo journalctl -u alyans-release -n 30 --no-pager
```
В журнале на каждом запуске — строка `alyans-release: … уже проваливался — ждём новый коммит в prod`; выше по журналу — причина провала (строки `ОШИБКА`).

**Повтор того же хеша** — убедиться, что причина случайная, затем:
```
sudo -u alyans-deploy -H rm /var/lib/alyans-deploy/state/failed-sha
```
Следующий запуск таймера (до 2 минут) соберёт хеш заново; итог — в `sudo journalctl -u alyans-release`.

Если причина в самом коммите — `failed-sha` не трогать: исправление идёт через `main` → PR → `prod`.

---

## Аварийный откат

**Где:** prod-ru1, из каталога `/`. На релиз, предшествующий текущему по времени:
```
sudo -u alyans-deploy -H /usr/local/lib/alyans-deploy/rollback.sh
```
На конкретный релиз (полный хеш из `ls /var/www/alyans/prod/releases`):
```
sudo -u alyans-deploy -H /usr/local/lib/alyans-deploy/rollback.sh 3be222d3719d4030b19fde4dac1d200e2e330d69
```

**Что увидеть после:**
- последняя строка — `alyans-rollback: аварийный откат на … — version.txt совпал`, на месте `…` хеш релиза;
- `curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt` — тот же хеш;
- `sudo journalctl -t alyans-release -n 5 --no-pager` — строка `аварийный откат на` с тем же хешем.

`current-sha` откат не меняет, поэтому таймер откатанный релиз не вернёт: он ждёт новый коммит в `prod`. Следующее слияние в `prod` выложится как обычно — исправление идёт через `main` → PR → `prod`.
