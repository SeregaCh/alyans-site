import { z } from 'astro/zod';

export const NAPRAVLENIYA_IDS = ['inzhenernye-seti', 'aeronavigatsiya', 'pokrytiya', 'monolit'] as const;

const DIGITS_10 = /^\d{10}$/;
const DIGITS_9 = /^\d{9}$/;
const DIGITS_13 = /^\d{13}$/;
const DIGITS_8_OR_10 = /^(\d{8}|\d{10})$/;
const PHONE = /^[0-9+\-() ]+$/;
const REGISTRY_NUMBER = /^[0-9A-Za-zА-Яа-яЁё\-./ ]+$/;
const LETTER_RUN = /[A-Za-zА-Яа-яЁё]+/g;
const LATIN_LETTER = /[A-Za-z]/;
const CYRILLIC_LETTER = /[А-Яа-яЁё]/;

function hasMixedScriptWord(value: string): boolean {
  const runs = value.match(LETTER_RUN) ?? [];
  return runs.some((run) => LATIN_LETTER.test(run) && CYRILLIC_LETTER.test(run));
}

export type CopyableValueKind = 'inn' | 'kpp' | 'ogrn' | 'okpo' | 'phone' | 'email' | 'registryNumber';

/**
 * Allow-list по виду значения (design.md, решение 3): перечисляет разрешённое,
 * не пытается перечислить всё запрещённое. registryNumber дополнительно отклоняет
 * смешение латиницы и кириллицы внутри одного слова — типичный след омоглифа.
 */
export function copyableValueField(kind: CopyableValueKind) {
  switch (kind) {
    case 'inn':
      return z.string().regex(DIGITS_10, 'ИНН — ровно 10 цифр, ничего кроме цифр');
    case 'kpp':
      return z.string().regex(DIGITS_9, 'КПП — ровно 9 цифр, ничего кроме цифр');
    case 'ogrn':
      return z.string().regex(DIGITS_13, 'ОГРН — ровно 13 цифр, ничего кроме цифр');
    case 'okpo':
      return z.string().regex(DIGITS_8_OR_10, 'ОКПО — 8 или 10 цифр, ничего кроме цифр');
    case 'phone':
      return z.string().regex(PHONE, 'Телефон — только цифры, +, пробел, дефис U+002D, круглые скобки');
    case 'email':
      return z.string().email('Не похоже на адрес электронной почты');
    case 'registryNumber':
      return z
        .string()
        .regex(
          REGISTRY_NUMBER,
          'Реестровый номер — только цифры, латиница, кириллица, дефис U+002D, точка, косая черта, пробел',
        )
        .refine((value) => !hasMixedScriptWord(value), {
          message: 'В одном слове одновременно латиница и кириллица — похоже на омоглиф',
        });
    default: {
      const exhaustive: never = kind;
      throw new Error(`Неизвестный kind у copyableValueField: ${String(exhaustive)}`);
    }
  }
}
