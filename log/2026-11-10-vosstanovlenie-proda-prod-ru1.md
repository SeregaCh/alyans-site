# Паспорт: восстановление прода на prod-ru1

Дата: 2026-11-10. Не openspec-change: капабилити сайта не меняются, меняется машина прода. Шаги 1–13 `docs/runbooks/prod-ru1.md` (из `6815ed6043fb4bf887a1aa9de69ccc0e01756000`) выполнял автор на prod-ru1 (137.22.148.13); у Claude Code доступа туда нет, поэтому итоги ниже записаны **со слов Ревизора Пульта, без выводов команд**.

## Повод

Прод на 45.90.32.35 уничтожен 2026-11-02 вместе с облаком Beget. У сайта нет данных — восстановление = прогон runbook-а из GitHub (`DECISIONS.md`, 2026-11-10).

## Эталон соседей (шаг 1)

- `watch.serega-hub.ru` — `401`;
- `127.0.0.1:8080` (Gatus `pult-observer`) — `200`;
- неизвестный Host на 80 — `curl: (52) Empty reply from server`;
- неизвестный SNI на 443 — `curl: (35) … unrecognized name`;
- в `/opt` — скрипты хостера `disk.sh`, `scan.sh` (не наши); Node не было.

## Итоги шагов

- **Шаг 2.** `alyans-deploy` — uid 110 / gid 112, без чужих групп (`sudo`, `docker`, `adm` нет).
- **Шаг 3.** Ключ только для чтения `id_ed25519_alyans-site-ro`, отпечаток `SHA256:83RArODYOBcREzReA4cO0JseG6gyxUgzUBhGWWbTOyw`, добавлен в Deploy keys без права записи. Старого ключа `alyans-site prod read (45.90)` в GitHub к этому моменту уже не было.
- **Шаги 4, 5, 7.** Отдельных итогов в отчёте Ревизора нет; следующие шаги опираются на них и прошли.
- **Шаг 6.** Node `v22.23.4`, npm `10.9.9` из `/opt/node22`; системного node нет.
- **Шаг 8.** Первый релиз `3be222d` с `--no-verify` — `exit 0`.
- **Шаг 9.** Vhost `alyans-em.ru` из `6815ed6`: `version.txt` = `current-sha`, `www` → `301`, несуществующий путь → `404`, соседи = эталон.
- **Шаг 10.** DNS в Яндекс 360: A `@` и A `www` → `137.22.148.13`, остальные записи не тронуты. `getent` — новый адрес без сброса кэша: `systemd-resolved` на prod-ru1 нет, `resolvectl flush-caches` отвечает `Unit dbus-org.freedesktop.resolve1.service not found`. **Проверку почты автор не делал** — MX и TXT не менялись.
- **Шаг 11.** Сертификат `alyans-em.ru` + `www.alyans-em.ru` до 2027-02-08; `renew --dry-run` — успех для обоих сертификатов машины.
- **Шаг 12.** Таймер `alyans-release` работает.
- **Шаг 13.** Выпуск через PR main → prod: 18:07:20 UTC — `alyans-release: готово: 8e142bb209f5896eb05bef2b32b8ec139be33af4`; `version.txt` и `current-sha` совпали.

## Отличия от runbook

1. `resolvectl flush-caches` в шаге 10 не работает — `systemd-resolved` нет; `getent` обходится без сброса. Строка убрана из runbook.
2. `journalctl` под `serega` без `sudo` показывает пустой журнал. В runbook — `sudo journalctl`.

## Итог

`alyans-em.ru` снова живой — на prod-ru1, выпускается слиянием PR main → prod; текущий `prod` — `8e142bb`.
