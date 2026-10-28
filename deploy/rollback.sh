#!/usr/bin/env bash
# Аварийный откат alyans-em.ru. Запуск — от alyans-deploy.
# Без аргумента — на релиз, предшествующий текущему по времени; с аргументом — на указанный sha.
# current-sha не меняется: таймер увидит, что prod не изменился, и откат не перезапишет.
set -euo pipefail
cd /

PROD=/var/www/alyans/prod
RELEASES=$PROD/releases
LOCK=/var/lib/alyans-deploy/release.lock
URL=https://alyans-em.ru/version.txt

err() { echo "alyans-rollback: ОШИБКА: $*" >&2; }

exec 9>"$LOCK"
if ! flock -n 9; then
  err "идёт выкладка — повтори позже"
  exit 1
fi

CUR=$(basename "$(readlink "$PROD/current")")

if [ $# -gt 1 ]; then
  err "использование: rollback.sh [sha]"
  exit 2
elif [ $# -eq 1 ]; then
  TARGET=$1
  if ! [[ $TARGET =~ ^[0-9a-f]{40}$ ]] || [ ! -d "$RELEASES/$TARGET" ]; then
    err "нет релиза $TARGET в $RELEASES"
    exit 2
  fi
else
  # Релизы от старых к новым; берём стоящий перед текущим.
  TARGET=""
  prev=""
  while read -r r; do
    if [ "$r" = "$CUR" ]; then TARGET=$prev; break; fi
    prev=$r
  done < <(ls -1tr "$RELEASES")
  if [ -z "$TARGET" ]; then
    err "нет релиза старше текущего ($CUR)"
    exit 1
  fi
fi

if [ "$TARGET" = "$CUR" ]; then
  err "$TARGET уже текущий"
  exit 1
fi

cd "$PROD"
ln -sfn "releases/$TARGET" current.tmp && mv -T current.tmp current
echo "alyans-rollback: current → releases/$TARGET (было: $CUR)"

GOT=$(curl -fsS --max-time 20 --resolve alyans-em.ru:443:127.0.0.1 "$URL" || true)
if [ "$GOT" != "$TARGET" ]; then
  err "version.txt отдаёт «$GOT», ожидалось $TARGET"
  ln -sfn "releases/$CUR" current.tmp && mv -T current.tmp current
  err "current возвращён на $CUR"
  exit 1
fi

logger -t alyans-release "аварийный откат на $TARGET"
echo "alyans-rollback: аварийный откат на $TARGET — version.txt совпал"
