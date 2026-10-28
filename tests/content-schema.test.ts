import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SchemaContext } from 'astro/content/config';
import type { ZodTypeAny } from 'astro/zod';
import { describe, expect, it } from 'vitest';
import { collections } from '../src/content.config';
import { NAPRAVLENIYA_IDS } from '../src/content/shared';

const contentDir = fileURLToPath(new URL('../src/content/', import.meta.url));

function asSchema(schema: ZodTypeAny | ((context: SchemaContext) => ZodTypeAny)): ZodTypeAny {
  if (typeof schema === 'function') {
    throw new Error('Схема задана функцией контекста — этот тест такого не ожидает');
  }
  return schema;
}

describe('src/content.config.ts — регистрация коллекций', () => {
  it('ровно пять коллекций с ожидаемыми именами (ТЗ §8)', () => {
    expect(Object.keys(collections).sort()).toEqual(
      ['dokumenty', 'dopuski', 'napravleniya', 'obekty', 'rekvizity'].sort(),
    );
  });
});

describe('содержание валит сборку схемы (заведомо неверные записи)', () => {
  it('obekty: направление не из NAPRAVLENIYA_IDS отклоняется', () => {
    const schema = asSchema(collections.obekty.schema!);
    const result = schema.safeParse({
      naimenovanie: 'Тестовый объект',
      zakazchik: ['Тестовый заказчик'],
      god: '2025',
      napravlenie: 'ne-suschestvuyuschee-napravlenie',
    });
    expect(result.success).toBe(false);
  });

  it('napravleniya: пустое обязательное поле (nazvanie) отклоняется', () => {
    const schema = asSchema(collections.napravleniya.schema!);
    const result = schema.safeParse({
      opisanie: 'Описание без названия',
      rabotyi: ['работа 1'],
    });
    expect(result.success).toBe(false);
  });

  const dopuskiValidBase = {
    tip: 'sro-stroitelstvo' as const,
    kemVydan: 'Ассоциация «ССК УрСиб»',
    data: '04.03.2025',
    urlReestra: 'https://example.org/reestr/3165',
  };

  it('dopuski: неразрывный дефис U+2011 в reestrovyiNomer отклоняется', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({ ...dopuskiValidBase, reestrovyiNomer: 'П‑182' });
    expect(result.success).toBe(false);
  });

  it('dopuski: дефис U+2010 в reestrovyiNomer отклоняется', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({ ...dopuskiValidBase, reestrovyiNomer: 'П‐182' });
    expect(result.success).toBe(false);
  });

  it('dopuski: кириллический омоглиф внутри латинского слова в reestrovyiNomer отклоняется', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({ ...dopuskiValidBase, reestrovyiNomer: 'SRО-12345' });
    expect(result.success).toBe(false);
  });

  it('rekvizity: неразрывный пробел U+00A0 в telefon отклоняется', () => {
    const schema = asSchema(collections.rekvizity.schema!);
    const result = schema.safeParse({
      naimenovaniePolnoe: 'Общество с ограниченной ответственностью «Альянс»',
      naimenovanieKratkoe: 'ООО «Альянс»',
      inn: '7701234567',
      kpp: '770101001',
      ogrn: '1027700132195',
      okpo: '12345678',
      okved: '43.29',
      yuridicheskiyAdres: '454000, г. Челябинск, ул. Примерная, д. 1',
      telefon: '+7 495 123-45-67',  // U+00A0 после "+7"
      pochta: 'info@alyans-em.ru',
      rukovoditel: 'Иванов Иван Иванович',
    });
    expect(result.success).toBe(false);
  });
});

describe('dopuski: superRefine по типу допуска (реестровый номер обязателен не для всех типов)', () => {
  const dopuskiBaseBezNomera = {
    kemVydan: 'СПАО «Ингосстрах»',
    data: 'действует',
  };

  it('strakhovanie без reestrovyiNomer и urlReestra проходит', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({ ...dopuskiBaseBezNomera, tip: 'strakhovanie' });
    expect(result.success).toBe(true);
  });

  it('strakhovanie с reestrovyiNomer отклоняется (номера для страхования не существует)', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({
      ...dopuskiBaseBezNomera,
      tip: 'strakhovanie',
      reestrovyiNomer: '12345',
    });
    expect(result.success).toBe(false);
  });

  it('litsenziya без reestrovyiNomer и urlReestra отклоняется', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({
      kemVydan: 'МЧС России',
      data: '28.04.2025',
      tip: 'litsenziya',
    });
    expect(result.success).toBe(false);
  });

  it('sro-stroitelstvo без reestrovyiNomer отклоняется', () => {
    const schema = asSchema(collections.dopuski.schema!);
    const result = schema.safeParse({
      kemVydan: 'ССК УрСиб',
      data: '04.03.2025',
      tip: 'sro-stroitelstvo',
      urlReestra: 'https://example.org/reestr/3165',
    });
    expect(result.success).toBe(false);
  });
});

describe('регрессия: napravleniya не может содержать id вне NAPRAVLENIYA_IDS (design.md, решение 4)', () => {
  function actualNapravleniyaIds(): string[] {
    const dir = path.join(contentDir, 'napravleniya');
    return readdirSync(dir)
      .filter((name) => !name.startsWith('.') && !name.startsWith('_'))
      .filter((name) => /\.(json|yaml|yml|toml)$/i.test(name))
      .map((name) => name.replace(/\.(json|yaml|yml|toml)$/i, ''));
  }

  it('все реальные id направлений (4 файла, рез 2) входят в NAPRAVLENIYA_IDS', () => {
    const ids = actualNapravleniyaIds();
    expect(ids.sort()).toEqual([...NAPRAVLENIYA_IDS].sort());
    const invalid = ids.filter((id) => !NAPRAVLENIYA_IDS.includes(id as (typeof NAPRAVLENIYA_IDS)[number]));
    expect(invalid).toEqual([]);
  });

  it('посторонний id ловится проверкой (доказательство, что проверка не пустая)', () => {
    const badFile = path.join(contentDir, 'napravleniya', 'test-invalid-id.yaml');
    writeFileSync(badFile, 'nazvanie: x\nopisanie: x\nrabotyi:\n  - x\n', 'utf-8');
    try {
      const ids = actualNapravleniyaIds();
      const invalid = ids.filter((id) => !NAPRAVLENIYA_IDS.includes(id as (typeof NAPRAVLENIYA_IDS)[number]));
      expect(invalid).toContain('test-invalid-id');
    } finally {
      rmSync(badFile);
    }
  });
});
