import { describe, expect, it } from 'vitest';
import { copyableValueField, NAPRAVLENIYA_IDS } from '../src/content/shared';

describe('NAPRAVLENIYA_IDS', () => {
  it('содержит ровно четыре идентификатора', () => {
    expect(NAPRAVLENIYA_IDS).toHaveLength(4);
  });
});

describe('copyableValueField', () => {
  it('inn: валидное значение (10 цифр) проходит', () => {
    expect(copyableValueField('inn').safeParse('7701234567').success).toBe(true);
  });
  it('inn: 9 цифр отклоняется', () => {
    expect(copyableValueField('inn').safeParse('770123456').success).toBe(false);
  });
  it('inn: буквы отклоняются', () => {
    expect(copyableValueField('inn').safeParse('770123456A').success).toBe(false);
  });

  it('kpp: валидное значение (9 цифр) проходит', () => {
    expect(copyableValueField('kpp').safeParse('770101001').success).toBe(true);
  });
  it('kpp: 10 цифр отклоняется', () => {
    expect(copyableValueField('kpp').safeParse('7701010011').success).toBe(false);
  });

  it('ogrn: валидное значение (13 цифр) проходит', () => {
    expect(copyableValueField('ogrn').safeParse('1027700132195').success).toBe(true);
  });
  it('ogrn: 12 цифр отклоняется', () => {
    expect(copyableValueField('ogrn').safeParse('102770013219').success).toBe(false);
  });

  it('okpo: валидное значение из 8 цифр проходит', () => {
    expect(copyableValueField('okpo').safeParse('12345678').success).toBe(true);
  });
  it('okpo: валидное значение из 10 цифр проходит', () => {
    expect(copyableValueField('okpo').safeParse('1234567890').success).toBe(true);
  });
  it('okpo: 9 цифр отклоняется', () => {
    expect(copyableValueField('okpo').safeParse('123456789').success).toBe(false);
  });

  it('phone: валидное значение проходит', () => {
    expect(copyableValueField('phone').safeParse('+7 495 123-45-67').success).toBe(true);
  });
  it('phone: неразрывный пробел (U+00A0) отклоняется', () => {
    expect(copyableValueField('phone').safeParse('+7 495 123-45-67').success).toBe(false);
  });
  it('phone: буквы отклоняются', () => {
    expect(copyableValueField('phone').safeParse('+7 495 CALL-ME').success).toBe(false);
  });

  it('email: валидный адрес проходит', () => {
    expect(copyableValueField('email').safeParse('info@alyans-em.ru').success).toBe(true);
  });
  it('email: значение без @ отклоняется', () => {
    expect(copyableValueField('email').safeParse('info-alyans-em.ru').success).toBe(false);
  });

  describe('registryNumber', () => {
    it('валидное кириллическое значение (СРО) проходит', () => {
      expect(copyableValueField('registryNumber').safeParse('3165').success).toBe(true);
    });
    it('валидное значение с кириллическим словом и цифрами проходит', () => {
      expect(
        copyableValueField('registryNumber').safeParse('П-182-006674362047-4571').success,
      ).toBe(true);
    });
    it('валидное значение с латинским словом проходит', () => {
      expect(copyableValueField('registryNumber').safeParse('SRO-12345').success).toBe(true);
    });

    it('неразрывный дефис U+2011 отклоняется (вне allow-list)', () => {
      expect(copyableValueField('registryNumber').safeParse('П‑182').success).toBe(false);
    });

    it('дефис U+2010 отклоняется (вне allow-list, старый денай-лист это пропускал)', () => {
      expect(copyableValueField('registryNumber').safeParse('П‐182').success).toBe(false);
    });

    it('кириллический омоглиф внутри латинского слова отклоняется', () => {
      // "SRO" с подменённой латинской "S" на кириллическую "Ѕ" не похожую... возьмём наглядный случай:
      // слово должно было быть чисто латинским "SRO", но одна буква — кириллическая "О" (U+041E) вместо латинской "O".
      const withCyrillicHomoglyph = 'SRО-12345'; // S, R (латиница) + О (кириллица U+041E) в одном слове
      expect(copyableValueField('registryNumber').safeParse(withCyrillicHomoglyph).success).toBe(false);
    });

    it('смешение латиницы и кириллицы в одном слове отклоняется и в обратную сторону', () => {
      // слово должно было быть чисто кириллическим "ССК", но буква "C" — латинская (U+0043) вместо кириллической "С".
      const withLatinInsideCyrillic = 'CСК УрСиб';
      expect(
        copyableValueField('registryNumber').safeParse(withLatinInsideCyrillic).success,
      ).toBe(false);
    });

    it('символ вне allow-list (например, «*») отклоняется', () => {
      expect(copyableValueField('registryNumber').safeParse('П-182*4571').success).toBe(false);
    });
  });
});
