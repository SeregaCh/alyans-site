#!/usr/bin/env bash
# Выкладка alyans-em.ru с ветки prod. Запуск — от alyans-deploy (таймер alyans-release).
# Флаг --no-verify — только для первого релиза: пропускает проверку version.txt по https.
set -euo pipefail
# Не зависеть от каталога запуска: из /root под sudo -u find падает на возврате в исходный каталог.
cd /
umask 027

HOME_DIR=/var/lib/alyans-deploy
SRC=$HOME_DIR/src
STATE=$HOME_DIR/state
LOCK=$HOME_DIR/release.lock
PROD=/var/www/alyans/prod
RELEASES=$PROD/releases
KEEP=5
URL=https://alyans-em.ru/version.txt

log() { echo "alyans-release: $*"; }
err() { echo "alyans-release: ОШИБКА: $*" >&2; }

NO_VERIFY=0
case "${1:-}" in
  "") ;;
  --no-verify) NO_VERIFY=1 ;;
  *) err "неизвестный аргумент: $1"; exit 2 ;;
esac

exec 9>"$LOCK"
if ! flock -n 9; then
  log "другая выкладка уже идёт — выход"
  exit 0
fi

if [ "$NO_VERIFY" -eq 1 ]; then
  if [ -e "$PROD/current" ] || [ -L "$PROD/current" ] || [ -n "$(ls -A "$RELEASES")" ]; then
    err "--no-verify разрешён только для первого релиза"
    exit 2
  fi
fi

git -C "$SRC" fetch --quiet origin prod
SHA=$(git -C "$SRC" rev-parse origin/prod)
CURRENT_SHA=$(cat "$STATE/current-sha" 2>/dev/null || true)
FAILED_SHA=$(cat "$STATE/failed-sha" 2>/dev/null || true)

if [ "$SHA" = "$CURRENT_SHA" ]; then
  log "prod не изменился ($SHA) — выход"
  exit 0
fi
if [ "$SHA" = "$FAILED_SHA" ]; then
  log "$SHA уже проваливался — ждём новый коммит в prod"
  exit 0
fi

log "выкладка $SHA (было: ${CURRENT_SHA:-нет})"

BUILD=$(mktemp -d)
STAGE=$RELEASES/.$SHA.tmp
SWITCHED=0
on_exit() {
  rc=$?
  rm -rf "$BUILD" "$STAGE"
  if [ "$rc" -ne 0 ]; then
    echo "$SHA" > "$STATE/failed-sha"
    if [ "$SWITCHED" -eq 0 ]; then
      err "провал до смены current — сайт не тронут; $SHA записан в failed-sha"
    fi
  fi
}
trap on_exit EXIT

# Сборка из чистого дерева коммита.
git -C "$SRC" archive "$SHA" | tar -x -C "$BUILD"
(
  cd "$BUILD"
  npm ci --no-audit --no-fund
  SITE_ENV=production npm run build
)
echo "$SHA" > "$BUILD/dist/version.txt"

# Проверка сборки.
if [ ! -f "$BUILD/dist/index.html" ]; then
  err "в сборке нет dist/index.html"
  exit 1
fi
if ! grep -qx 'Allow: /' "$BUILD/dist/robots.txt"; then
  err "dist/robots.txt не содержит «Allow: /» — сборка не production"
  exit 1
fi

# Копия релиза: каталоги 2750, файлы 640, группа www-data (наследуется от setgid-каталога).
rm -rf "$STAGE"
cp -r "$BUILD/dist" "$STAGE"
find "$STAGE" -type d -exec chmod 2750 {} +
find "$STAGE" -type f -exec chmod 640 {} +
if [ -n "$(find "$STAGE" ! -group www-data -print -quit)" ]; then
  err "в релизе есть файлы не с группой www-data"
  exit 1
fi
rm -rf "${RELEASES:?}/$SHA"
mv -T "$STAGE" "$RELEASES/$SHA"

# Атомарная смена current.
PREV=$(readlink "$PROD/current" 2>/dev/null || true)
cd "$PROD"
ln -sfn "releases/$SHA" current.tmp && mv -T current.tmp current
SWITCHED=1
log "current → releases/$SHA"

if [ "$NO_VERIFY" -eq 1 ]; then
  log "проверка version.txt пропущена (--no-verify, первый релиз)"
else
  GOT=$(curl -fsS --max-time 20 --resolve alyans-em.ru:443:127.0.0.1 "$URL" || true)
  if [ "$GOT" != "$SHA" ]; then
    err "version.txt отдаёт «$GOT», ожидалось $SHA"
    if [ -n "$PREV" ]; then
      ln -sfn "$PREV" current.tmp && mv -T current.tmp current
      err "current возвращён на $PREV"
    else
      rm -f current
      err "прежнего релиза нет — current снят"
    fi
    # Проваленный релиз не хранится: rollback.sh не должен выбрать его «предыдущим».
    rm -rf "${RELEASES:?}/$SHA"
    exit 1
  fi
  log "version.txt = $SHA"
fi

echo "$SHA" > "$STATE/current-sha"
rm -f "$STATE/failed-sha"

# Храним $KEEP последних релизов; текущий не удаляется никогда.
find "$RELEASES" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%T@ %f\n' \
  | sort -rn | tail -n +$((KEEP + 1)) | while read -r _ old; do
  [ "$old" = "$SHA" ] && continue
  rm -rf "${RELEASES:?}/$old"
  log "удалён старый релиз $old"
done

log "готово: $SHA"
