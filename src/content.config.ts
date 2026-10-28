import { defineCollection } from 'astro/content/config';
import { z } from 'astro/zod';
import { copyableValueField, NAPRAVLENIYA_IDS } from './content/shared';

const napravleniya = defineCollection({
  type: 'data',
  schema: z.object({
    nazvanie: z.string().min(1),
    opisanie: z.string().min(1),
    rabotyi: z.array(z.string().min(1)).min(1),
  }),
});

const obekty = defineCollection({
  type: 'data',
  schema: z.object({
    naimenovanie: z.string().min(1),
    zakazchik: z.array(z.string().min(1)).min(1),
    god: z.string().min(1),
    // Для расчёта «последних трёх» на главной, не для сортировки перечня объектов.
    godSortirovki: z.number().int(),
    // Ручной порядок перечня на странице «Объекты» — не сдвигается при добавлении новых записей.
    poryadok: z.number().int(),
    vSostaveGruppyKompaniy: z.boolean().default(false),
    napravlenie: z.enum(NAPRAVLENIYA_IDS),
    sostav: z.array(z.string().min(1)).min(1).optional(),
  }),
});

const DOPUSK_TYPES_S_NOMEROM = ['sro-stroitelstvo', 'sro-proektirovanie', 'litsenziya'] as const;

const dopuski = defineCollection({
  type: 'data',
  schema: z
    .object({
      tip: z.enum(['sro-stroitelstvo', 'sro-proektirovanie', 'litsenziya', 'strakhovanie']),
      kemVydan: z.string().min(1),
      reestrovyiNomer: copyableValueField('registryNumber').optional(),
      regionalnyiNomer: copyableValueField('registryNumber').optional(),
      data: z.string().min(1),
      urlReestra: z.string().url().optional(),
    })
    .superRefine((value, ctx) => {
      const trebuetNomer = (DOPUSK_TYPES_S_NOMEROM as readonly string[]).includes(value.tip);
      if (trebuetNomer) {
        if (value.reestrovyiNomer === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reestrovyiNomer'],
            message: `Для типа "${value.tip}" reestrovyiNomer обязателен`,
          });
        }
        if (value.urlReestra === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['urlReestra'],
            message: `Для типа "${value.tip}" urlReestra обязателен`,
          });
        }
      } else {
        if (value.reestrovyiNomer !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['reestrovyiNomer'],
            message: 'Для strakhovanie reestrovyiNomer запрещён — реестрового номера у страхования не существует, выдумывать нельзя',
          });
        }
        if (value.regionalnyiNomer !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['regionalnyiNomer'],
            message: 'Для strakhovanie regionalnyiNomer запрещён — у страхования нет ни одного номера',
          });
        }
        if (value.urlReestra !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['urlReestra'],
            message: 'Для strakhovanie urlReestra запрещён — страницы проверки не существует',
          });
        }
      }
    }),
});

const dokumenty = defineCollection({
  type: 'data',
  schema: z.object({
    nazvanie: z.string().min(1),
    fail: z.string().min(1),
    dataAktualizatsii: z.string().min(1),
  }),
});

const rekvizity = defineCollection({
  type: 'data',
  schema: z.object({
    naimenovaniePolnoe: z.string().min(1),
    naimenovanieKratkoe: z.string().min(1),
    inn: copyableValueField('inn'),
    kpp: copyableValueField('kpp'),
    ogrn: copyableValueField('ogrn'),
    okpo: copyableValueField('okpo'),
    okved: z.string().min(1),
    yuridicheskiyAdres: z.string().min(1),
    telefon: copyableValueField('phone'),
    pochta: copyableValueField('email'),
    rukovoditel: z.string().min(1),
  }),
});

export const collections = { napravleniya, obekty, dopuski, dokumenty, rekvizity };
