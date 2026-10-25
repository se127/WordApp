# WordApp

<p align="right">
  <a href="https://github.com/se127/WordApp/releases/latest"><img src="https://img.shields.io/github/v/release/se127/WordApp?label=release&color=black" alt="آخرین انتشار"></a>
  <img src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078D4" alt="پلتفرم">
  <img src="https://img.shields.io/badge/Electron-2B2E3A?logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/React%2019-087EA4?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/built%20with-Bun-f9f1e1" alt="Bun"></a>
</p>

WordApp یک واژه پرداز فارسی و راست به چپ برای ویندوز است که برای نوشتن، قالب بندی و نگه داری سندها روی رایانه ی خودتان ساخته شده است. همه ی سندها و تصاویر به صورت محلی ذخیره می شوند و برنامه برای کار به اینترنت نیاز ندارد.

این برنامه با Electron، React 19، TypeScript، TipTap و Bun ساخته شده است.

## دانلود

آخرین نسخه ی ویندوز را از [صفحه ی انتشارها](https://github.com/se127/WordApp/releases/latest) دریافت کنید. فایل نصب `WordApp-Setup-<version>-x64.exe` برای ویندوز ۱۰ و ۱۱ (۶۴ بیتی) است و نصب آن با یک کلیک انجام می شود.

## ویژگی ها

### ویرایشگر

- **قالب بندی متن:** توپر، کج، زیرخط، خط خورده، رنگ متن و پس زمینه، اندازه ی قلم، بالا نویس و پایین نویس.
- **ساختار متن:** عنوان های دو تا شش، پاراگراف، تراز متن و جهت راست به چپ یا چپ به راست.
- **بلوک ها:** لیست نقطه ای، لیست شماره دار، نقل قول، خط افقی، جدول و بلوک کد.
- **جدول:** درج جدول با انتخاب تعداد سطر و ستون، افزودن و حذف سطر و ستون، سرستون و تغییر عرض ستون ها.
- **لینک:** درج و ویرایش لینک با پنجره ی اختصاصی و منوی میان بر روی لینک.
- **تصویر:** انتخاب چند فایل هم زمان، کشیدن و رها کردن روی ویرایشگر و کپی و چسباندن تصویر بین سندها.
- **بلوک کد:** هایلایت نحوی با Shiki برای زبان هایی مثل JavaScript، TypeScript، Python، SQL و HTML، همراه با دکمه ی کپی.
- **ایموجی:** انتخاب سریع ایموجی از منوی ابزار.
- **تاریخچه:** برگرداندن و بازگرداندن تغییرات.

### ذخیره سازی

- **ذخیره ی خودکار:** تغییرات عنوان و متن با تاخیر ۵۰۰ میلی ثانیه ذخیره می شوند.
- **ذخیره ی فوری:** `Ctrl+S` ذخیره را بدون تاخیر انجام می دهد.
- **وضعیت ذخیره:** نشانگر «در حال ذخیره...» در نوار بالای صفحه نمایش داده می شود.
- **بازیابی تغییرات:** اگر ذخیره ناموفق باشد، تغییرات در حافظه می مانند و با بازگشت به سند بازیابی می شوند.
- **بستن ایمن:** هنگام بستن پنجره، ذخیره های در جریان کامل می شوند و برنامه بدون از دست رفتن تغییرات بسته می شود.
- **ذخیره ی محلی:** سندها در پایگاه داده ی SQLite و تصاویر در پوشه ی داده ی برنامه روی همان رایانه نگه داری می شوند.

### مدیریت سندها

- **فهرست سندها:** عنوان، تاریخ ایجاد، تاریخ آخرین ویرایش و مرتب سازی جدید به قدیم یا قدیم به جدید.
- **جستجو:** جستجوی زنده بر اساس عنوان سند با تاخیر ۳۰۰ میلی ثانیه.
- **صفحه بندی:** نمایش سندها در صفحه های جداگانه.
- **حذف:** حذف یک سند یا انتخاب گروهی و حذف چند سند با تایید.
- **تاریخ ها:** نمایش نسبی تاریخ ها و نمایش تاریخ کامل در راهنمای ابزار.
- **ادامه از همان جا:** بازگشت به فهرست، صفحه، ترتیب، جستجو و موقعیت پیمایش قبلی را حفظ می کند.

### ظاهر

- **پوسته:** روشن، تاریک و هماهنگ با سیستم.
- **فونت:** وزیرمتن برای متن فارسی و Inter برای متن لاتین.
- **راست به چپ:** کل رابط و ویرایشگر برای فارسی چیده شده اند.

## تکنولوژی ها

<div dir="rtl">

| بخش             | تکنولوژی                            |
| --------------- | ----------------------------------- |
| پوسته ی دسکتاپ  | Electron                            |
| رابط کاربری     | React 19 و TypeScript               |
| ویرایشگر        | TipTap 3 و ProseMirror              |
| استایل          | Tailwind CSS 4 و shadcn/ui          |
| مسیریابی و داده | TanStack Router و TanStack Query    |
| پایگاه داده     | SQLite با `node:sqlite`             |
| هایلایت کد      | Shiki                               |
| ساخت و تست      | Bun، Vite، Vitest و Testing Library |
| کیفیت کد        | Oxlint، Prettier و React Compiler   |

</div>

## ساختار پروژه

```text
WordApp/
├─ electron/       main process, preload, SQLite, image store
├─ src/
│  ├─ components/  app components and vendored shadcn/ui
│  ├─ pages/       home and document pages
│  ├─ lib/         queries, autosave, images, formatting
│  ├─ routes/      TanStack Router routes
│  └─ font/        Vazirmatn font files
├─ scripts/        dev/build runner and quality checks
├─ tests/
│  ├─ dom/         renderer tests in happy-dom
│  └─ node/        main and preload tests
└─ .github/        release workflow
```

## شروع کار

### پیش نیازها

- ویندوز ۱۰ یا ۱۱ (۶۴ بیتی) برای اجرای نسخه ی نهایی.
- [Bun](https://bun.sh) نسخه ی ۱.۴.۴ یا جدیدتر.
- برای توسعه، Node.js لازم نیست و همه ی کارها با Bun انجام می شوند.

### نصب و اجرا

```bash
bun install
bun dev
```

`bun dev` سرور Vite را بالا می آورد و Electron را با داده های توسعه از پوشه ی `dev-data` اجرا می کند.

## اسکریپت ها

<div dir="rtl">

| دستور                          | کار                                                        |
| ------------------------------ | ---------------------------------------------------------- |
| `bun dev`                      | اجرای برنامه در حالت توسعه.                                |
| `bun run build`                | ساخت رابط و بسته ی Electron در `dist` و `dist-electron`.   |
| `bun run dist`                 | ساخت نصب کننده ی ویندوز با electron-builder.               |
| `bun run test`                 | اجرای همه ی تست ها.                                        |
| `bun run test:coverage`        | اجرای تست ها همراه با گزارش پوشش.                          |
| `bun run lint`                 | بررسی کد با Oxlint.                                        |
| `bun run format`               | قالب بندی فایل ها با Prettier.                             |
| `bun run check:react-compiler` | بررسی امکان کامپایل همه ی فایل های رابط با React Compiler. |

</div>

## پرچم های توسعه

فقط `bun dev` این پرچم ها را می پذیرد.

<div dir="rtl">

| پرچم                  | کار                                                                           |
| --------------------- | ----------------------------------------------------------------------------- |
| `--seed=documents,50` | پایگاه داده ی توسعه را بازنشانی و ۵۰ سند نمونه ایجاد می کند.                  |
| `--db-delay=2000ms`   | هر عملیات پایگاه داده را به اندازه ی مشخصی به تاخیر می اندازد.                |
| `--with-db-failure`   | عملیات هایی را که باید شکست بخورند انتخاب می کند تا حالت های خطا آزمایش شوند. |

</div>

نمونه:

```bash
bun dev --seed=documents,100 --db-delay=500ms
```

## داده ها و مسیرها

- در حالت توسعه، پایگاه داده در `dev-data/db.sqlite` و تصاویر در `dev-data/images` نگه داری می شوند.
- در نسخه ی نصب شده، داده ها در پوشه ی `userData` برنامه قرار می گیرند: `db.sqlite`، `images` و `images-trash`.
- هر سند پوشه ی تصویر خودش را دارد: `images/<documentId>/<uuid>.<extension>`.
- تصویرهایی که دیگر در متن سند نیستند به `images-trash` منتقل می شوند و در راه اندازی بعدی برنامه پاک می شوند.
- با حذف یک سند، پوشه ی تصویرها و پوشه ی زباله ی آن هم حذف می شوند.

## تست و کیفیت

- تست های رابط در `tests/dom` با Vitest و happy-dom و Testing Library اجرا می شوند.
- تست های فرایند اصلی و preload در `tests/node` با محیط Node اجرا می شوند.
- React Compiler روی همه ی فایل های `src` اجرا می شود و `bun run check:react-compiler` ناسازگاری ها را پیدا می کند.
- پیش از ارسال تغییرات، این دستورها باید بدون خطا اجرا شوند: `bun run lint`، `bun run format`، `bun run test`، `bun run check:react-compiler` و `bun run build`.
- قواعد کامل پروژه در [AGENTS.md](AGENTS.md) آمده است.

## ساخت نسخه و انتشار

- برای ساخت نصب کننده به صورت محلی `bun run dist` را اجرا کنید.
- انتشار از طریق برچسب `v*` انجام می شود. گردش کار GitHub Actions فقط وقتی بسته را می سازد که تگ با `version` در `package.json` یکی باشد.
- خروجی انتشار شامل `WordApp-Setup-<version>-x64.exe`، `latest.yml` و فایل `.blockmap` است.
- تگ و نسخه را هماهنگ نگه دارید و تگ منتشر شده را جابه جا نکنید.

## مشارکت

- تغییرها را با تست همراه کنید.
- از Bun برای نصب، اجرا و تست استفاده کنید.
- پیش از ارسال درخواست ادغام، مجموعه ی بررسی های بالا را اجرا کنید.
- برای گزارش باگ یا پیشنهاد ویژگی از [Issues](https://github.com/se127/WordApp/issues) استفاده کنید.
