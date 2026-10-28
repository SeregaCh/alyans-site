# Установка автовыкладки на прод 45.90.32.35

Для автора. Всё выполняется на 45.90.32.35 под своим пользователем с sudo. Claude Code туда доступа не имеет.

Что получится: таймер `alyans-release` раз в 2 минуты смотрит ветку `prod` в GitHub; новый коммит собирается в чистом каталоге, кладётся в `/var/www/alyans/prod/releases/<sha>`, ссылка `current` переключается атомарно и проверяется по `https://alyans-em.ru/version.txt`. Nginx раздаёт `/var/www/alyans/prod/current`.

Правило на весь runbook: результат шага не совпал с «Ожидается» — стоп, следующий шаг не выполняется, сначала откат шага.

---

## Шаг 0. Разведка — только чтение

**Где:** 45.90.32.35.

```
ls -la /var/www/alyans /var/www/alyans/prod
sudo cat /etc/nginx/sites-available/alyans-prod
ls -l /etc/nginx/sites-enabled/
node -v
npm -v
id alyans-deploy
systemctl list-timers --all | grep -i alyans
namei -l /var/www/alyans/prod
```

**Ожидается:**
- `/var/www/alyans/prod` пустой;
- в `alyans-prod` есть строка `root /var/www/alyans/prod-dist;`;
- `node -v` — `v20.x`;
- `id alyans-deploy` — `no such user`;
- таймеров alyans нет;
- `namei -l`: у каждого каталога пути есть `x` для «прочих» или для группы `www-data` — www-data проходит до `prod`.

Иначе — стоп, ничего не менять, вывод — в чат.

**Откат:** не нужен, шаг ничего не меняет.

---

## Шаг 2. Пользователь alyans-deploy и каталоги

**Где:** 45.90.32.35.

```
stat -c '%U:%G %a' /var/www/alyans/prod | sudo tee /root/alyans-prod-dir.before
sudo useradd --system --home-dir /var/lib/alyans-deploy --create-home --shell /usr/sbin/nologin alyans-deploy
sudo install -d -o alyans-deploy -g alyans-deploy -m 700 /var/lib/alyans-deploy/.ssh /var/lib/alyans-deploy/state
sudo chown alyans-deploy:www-data /var/www/alyans/prod
sudo chmod 2750 /var/www/alyans/prod
sudo install -d -o alyans-deploy -g www-data -m 2750 /var/www/alyans/prod/releases
sudo ls -la /var/lib/alyans-deploy /var/www/alyans/prod
```

**Ожидается:** `.ssh` и `state` — `drwx------ alyans-deploy alyans-deploy`; `prod` и `prod/releases` — `drwxr-s--- alyans-deploy www-data`.

**Откат:**
```
sudo rmdir /var/www/alyans/prod/releases
sudo chown "$(sudo cut -d' ' -f1 /root/alyans-prod-dir.before)" /var/www/alyans/prod
sudo chmod "$(sudo cut -d' ' -f2 /root/alyans-prod-dir.before)" /var/www/alyans/prod
sudo userdel -r alyans-deploy
```
(прежние владелец и права `prod` сохранены первой командой шага в `/root/alyans-prod-dir.before`).

---

## Шаг 3. Ключ только для чтения

**Где:** 45.90.32.35, затем GitHub в браузере.

```
sudo -u alyans-deploy ssh-keygen -t ed25519 -N "" -C "alyans-site ro (prod 45.90.32.35)" -f /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro
sudo cat /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro.pub
```

Открытую половину — в `SeregaCh/alyans-site` → Settings → Deploy keys → Add deploy key. Заголовок: `alyans-site ro (prod 45.90.32.35)`. Галочку **«Allow write access» не ставить**.

**Ожидается:** ключ в списке Deploy keys с пометкой `Read-only`.

**Откат:** удалить ключ в Deploy keys; `sudo rm /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro.pub`.

---

## Шаг 4. known_hosts из опубликованной строки GitHub

**Где:** 45.90.32.35. `ssh-keyscan` не используется: он берёт ключ у того, кто ответил, а не у GitHub.

```
echo 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' | sudo -u alyans-deploy tee /var/lib/alyans-deploy/.ssh/known_hosts >/dev/null
sudo chmod 600 /var/lib/alyans-deploy/.ssh/known_hosts
sudo -u alyans-deploy ssh-keygen -lf /var/lib/alyans-deploy/.ssh/known_hosts
```

**Ожидается:** `256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)`.

**Откат:** `sudo rm /var/lib/alyans-deploy/.ssh/known_hosts`.

---

## Шаг 5. Клон ветки prod

**Где:** 45.90.32.35.

```
sudo -u alyans-deploy -H git -c core.sshCommand="ssh -i /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/var/lib/alyans-deploy/.ssh/known_hosts" clone --branch prod git@github.com:SeregaCh/alyans-site.git /var/lib/alyans-deploy/src
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src config core.sshCommand "ssh -i /var/lib/alyans-deploy/.ssh/id_ed25519_alyans-site-ro -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/var/lib/alyans-deploy/.ssh/known_hosts"
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src log -1 --format='%H %s' origin/prod
```

**Ожидается:** клон без вопроса о ключе хоста; последний коммит `origin/prod` — `823f7bdd362f7113bf35cb3500d9f0a4e23aadc4` (если PR main → prod к этому моменту не слит).

**Откат:** `sudo rm -rf /var/lib/alyans-deploy/src`.

---

## Шаг 6. Установка скриптов и юнитов

**Где:** 45.90.32.35. `<SHA>` — хеш коммита в `main` с каталогом `deploy/`, его называет отчёт Claude Code. Это единственный плейсхолдер в runbook.

```
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src fetch origin main
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src cat-file -e <SHA>^{commit} && echo commit-ok
sudo install -d -o root -g root -m 755 /usr/local/lib/alyans-deploy
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/release.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/release.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/rollback.sh | sudo install -o root -g root -m 755 /dev/stdin /usr/local/lib/alyans-deploy/rollback.sh
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/alyans-release.service | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.service
sudo -u alyans-deploy -H git -C /var/lib/alyans-deploy/src show <SHA>:deploy/alyans-release.timer | sudo install -o root -g root -m 644 /dev/stdin /etc/systemd/system/alyans-release.timer
sudo systemctl daemon-reload
ls -l /usr/local/lib/alyans-deploy /etc/systemd/system/alyans-release.*
systemd-analyze verify /etc/systemd/system/alyans-release.service /etc/systemd/system/alyans-release.timer
```

**Ожидается:** `commit-ok`; два скрипта `-rwxr-xr-x root root`, два юнита `-rw-r--r-- root root`; `systemd-analyze verify` без ошибок. Таймер ещё не включён.

**Откат:**
```
sudo rm -r /usr/local/lib/alyans-deploy
sudo rm /etc/systemd/system/alyans-release.service /etc/systemd/system/alyans-release.timer
sudo systemctl daemon-reload
```

---

## Шаг 7. Первый релиз вручную, с --no-verify

**Где:** 45.90.32.35. Запуск напрямую от `alyans-deploy`, не через service. Проверка по https здесь невозможна: nginx ещё смотрит в `prod-dist`. Поэтому `--no-verify`, а скрипт принимает его только при пустом `releases/` и без `current`. Вывод на экране — журнал этого прогона.

```
sudo -u alyans-deploy -H /usr/local/lib/alyans-deploy/release.sh --no-verify; echo "exit=$?"
sudo ls -l /var/www/alyans/prod /var/www/alyans/prod/releases
sudo cat /var/lib/alyans-deploy/state/current-sha
sudo cat /var/www/alyans/prod/current/version.txt
```

**Ожидается:**
- последняя строка вывода — `alyans-release: готово: 823f7bdd362f7113bf35cb3500d9f0a4e23aadc4`, `exit=0`;
- есть `releases/823f7bdd362f7113bf35cb3500d9f0a4e23aadc4` и `current -> releases/823f7bdd362f7113bf35cb3500d9f0a4e23aadc4`;
- `current-sha` и `version.txt` — тот же хеш.

Сайт пока не изменился: nginx раздаёт `prod-dist`.

**Откат:**
```
sudo rm /var/www/alyans/prod/current
sudo rm -r /var/www/alyans/prod/releases/823f7bdd362f7113bf35cb3500d9f0a4e23aadc4
sudo rm -f /var/lib/alyans-deploy/state/current-sha /var/lib/alyans-deploy/state/failed-sha
```

---

## Шаг 8. Nginx: root на current

**Где:** 45.90.32.35. Общий nginx с EasyPlan — только `nginx -t` и `reload`, никогда `restart`.

Сначала — ответ dev до правки, чтобы сравнить после:
```
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve dev.alyans-em.ru:443:127.0.0.1 https://dev.alyans-em.ru/
```

Копия и подсчёт до правки:
```
sudo cp -p /etc/nginx/sites-available/alyans-prod /root/alyans-prod.bak
sudo grep -cxE '\s*root /var/www/alyans/prod-dist;' /etc/nginx/sites-available/alyans-prod
sudo grep -cxE '\s*root /var/www/alyans/prod/current;' /etc/nginx/sites-available/alyans-prod
```
**Ожидается:** `1` и `0`. Иначе — стоп.

Правка одной командой и подсчёт после:
```
sudo sed -i -E 's|^(\s*)root /var/www/alyans/prod-dist;$|\1root /var/www/alyans/prod/current;|' /etc/nginx/sites-available/alyans-prod
sudo grep -cxE '\s*root /var/www/alyans/prod-dist;' /etc/nginx/sites-available/alyans-prod
sudo grep -cxE '\s*root /var/www/alyans/prod/current;' /etc/nginx/sites-available/alyans-prod
```
**Ожидается:** `0` и `1`.

Применение:
```
sudo nginx -t && sudo systemctl reload nginx
```

Проверки:
```
curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve alyans-em.ru:80:127.0.0.1 http://alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve www.alyans-em.ru:443:127.0.0.1 https://www.alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' --resolve dev.alyans-em.ru:443:127.0.0.1 https://dev.alyans-em.ru/
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
curl -sS -o /dev/null -w '%{http_code}\n' https://watch.serega-hub.ru/
```
**Ожидается:**
- `version.txt` — `823f7bdd362f7113bf35cb3500d9f0a4e23aadc4`;
- `http://alyans-em.ru/` — `301` на `https://alyans-em.ru/`;
- `https://www.alyans-em.ru/` — `301 https://alyans-em.ru/`. Проверка сохранена — см. отчёт архитектора: A-запись www есть (добавлена 14.09), сертификат покрывает оба домена;
- `dev.alyans-em.ru` — тот же ответ, что до правки;
- `easy-plan.ru` — `200`;
- `watch.serega-hub.ru` — `401`.

**Откат:**
```
sudo cp -p /root/alyans-prod.bak /etc/nginx/sites-available/alyans-prod
sudo nginx -t && sudo systemctl reload nginx
curl -sS -o /dev/null -w '%{http_code}\n' https://easy-plan.ru/
```

---

## Шаг 9. Таймер

**Где:** 45.90.32.35.

```
sudo systemctl enable --now alyans-release.timer
systemctl list-timers --all | grep -i alyans
```
Через 2–3 минуты:
```
journalctl -u alyans-release -n 20 --no-pager
```

**Ожидается:** таймер `alyans-release.timer` в списке со следующим запуском в пределах 2 минут; в журнале — `alyans-release: prod не изменился (823f7bdd362f7113bf35cb3500d9f0a4e23aadc4) — выход`.

С этого момента выкладка — слияние PR main → prod в GitHub; через 2–4 минуты новый коммит на сайте. Журнал: `journalctl -u alyans-release`.

**Откат:** `sudo systemctl disable --now alyans-release.timer`.

---

## Аварийный откат

**Где:** 45.90.32.35. На релиз, предшествующий текущему по времени:
```
sudo -u alyans-deploy -H /usr/local/lib/alyans-deploy/rollback.sh
```
На конкретный релиз (полный хеш из `ls /var/www/alyans/prod/releases`):
```
sudo -u alyans-deploy -H /usr/local/lib/alyans-deploy/rollback.sh 823f7bdd362f7113bf35cb3500d9f0a4e23aadc4
```

**Что увидеть после:**
- последняя строка — `alyans-rollback: аварийный откат на <хеш> — version.txt совпал`;
- `curl -fsS --resolve alyans-em.ru:443:127.0.0.1 https://alyans-em.ru/version.txt` — тот же хеш;
- `journalctl -t alyans-release -n 5 --no-pager` — строка `аварийный откат на <хеш>`.

`current-sha` откат не меняет, поэтому таймер откатанный релиз не вернёт: он ждёт новый коммит в `prod`. Следующее слияние в `prod` выложится как обычно — исправление идёт через `main` → PR → `prod`.
