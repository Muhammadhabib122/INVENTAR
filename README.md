# FarDTU Inventarizatsiya tizimi

Farg'ona davlat texnika universiteti uchun umumiy veb-ilova. Hamkasblar o'z login-paroli bilan telefondan kiradi, buyumlardagi QR yorliqlarni skanerlaydi va bir vaqtda ishlaydi. Internet uzilsa skanlar telefonda saqlanib turadi va internet qaytganda o'zi yuboriladi.

**Tuzilma:** Bino → Bo'lim (bitta yuklangan Excel fayl) → Buyumlar. Har bir Excel fayl alohida bo'lim bo'ladi va bo'limlar hech qachon bir-biriga aralashmaydi.

**Rollar:**
- **Admin**: binolar, foydalanuvchilar va bo'limlarni (Excel) boshqaradi, hamma narsani ko'radi.
- **Komissiya a'zosi**: faqat o'ziga biriktirilgan binolarda skanerlaydi, inventarsiz jihoz qo'shadi va xonani yakunlaydi.
- **Kuzatuvchi**: faqat ko'radi va hisobot yuklab oladi.

---

## 1. Serverga qo'yish

Quyidagi buyruqlar **Ubuntu 22.04 / 24.04** server uchun yozilgan (universitet serveri yoki VPS). Serverga SSH orqali kirib, buyruqlarni birma-bir bering.

### 1.1. Docker o'rnatish (bir marta)

Docker ilovani va bazani tayyor "konteyner"larda ishga tushiradi.

```bash
curl -fsSL https://get.docker.com | sudo sh
```
Bu buyruq Docker'ning rasmiy o'rnatish skriptini yuklab, ishga tushiradi.

```bash
sudo usermod -aG docker $USER
```
Bu buyruq sizga `sudo` yozmasdan Docker ishlatish huquqini beradi. Buyruqdan keyin serverdan chiqib (`exit`), qayta kiring.

### 1.2. Dasturni yuklab olish

```bash
git clone -b yangi-tizim https://github.com/Muhammadhabib122/INVENTAR.git inventar
```
Bu buyruq dastur kodini serverdagi `inventar` papkasiga yuklab oladi.

```bash
cd inventar
```
Bu buyruq shu papkaga o'tadi. Keyingi barcha buyruqlar shu papka ichida beriladi.

### 1.3. Sozlamalar fayli (.env)

```bash
cp .env.example .env
```
Bu buyruq namuna fayldan `.env` sozlamalar faylini yaratadi.

```bash
nano .env
```
Bu buyruq faylni tahrirlash uchun ochadi. Quyidagilarni o'zgartiring:
- `POSTGRES_PASSWORD`: baza paroli. Uzun, tasodifiy parol yozing (masalan, 24 ta harf va raqam).
- `ADMIN_USERNAME` va `ADMIN_PASSWORD`: birinchi admin login-paroli (parol kamida 10 belgi bo'lsin).
- `DOMAIN`: sayt manzili, masalan `inventar.fdtu.uz` (2-bo'limga qarang).
- `COOKIE_SECURE`: HTTPS ulangan bo'lsa `true` qoldiring.

Saqlash uchun `Ctrl+O`, keyin `Enter` bosing. Chiqish uchun `Ctrl+X` bosing.

> `.env` faylida maxfiy parollar bor. U git'ga qo'shilmaydi (`.gitignore` da yozilgan). Uni hech kimga yubormang.

### 1.4. Ishga tushirish

```bash
docker compose --profile https up -d --build
```
Bu buyruq dasturni yig'adi (birinchi marta 3-5 daqiqa) va to'rtta xizmatni fonda ishga tushiradi:
- `db`: PostgreSQL baza;
- `app`: ilovaning o'zi;
- `backup`: har kuni zaxira nusxa oluvchi xizmat;
- `caddy`: HTTPS ulovchi xizmat.

Har ishga tushganda baza tuzilmasi avtomatik yangilanadi.

```bash
docker compose ps
```
Bu buyruq xizmatlar holatini ko'rsatadi. Hammasida `running` (yoki `healthy`) yozuvi turishi kerak.

### 1.5. Birinchi adminni yaratish

```bash
docker compose exec app node prisma/seed.mjs
```
Bu buyruq `.env` dagi `ADMIN_USERNAME` va `ADMIN_PASSWORD` bilan admin yaratadi. Parolni unutib qo'ysangiz, `.env` da yangi parol yozib, shu buyruqni qayta bering: parol yangilanadi.

Shundan keyin brauzerda `https://DOMEN` ni oching va admin bilan kiring. Keyin:
1. **Ko'proq → Binolar**: binolarni qo'shing.
2. **Ko'proq → Foydalanuvchilar**: hamkasblarga login yarating, rolini tanlang va binolarga biriktiring.
3. **Ko'proq → Bo'limlar**: binoni tanlab, Excel faylni yuklang.

---

## 2. HTTPS ulash

Telefon kamerasi faqat **HTTPS** orqali ishlaydi. Shuning uchun HTTPS majburiy.

### 2.1. Domen bo'lsa (tavsiya etiladi)

1. Universitet IT bo'limidan subdomen so'rang, masalan `inventar.fdtu.uz`. Uning **A yozuvi** serveringiz IP manziliga yo'naltirilishi kerak.
2. Serverda 80 va 443 portlar ochiq bo'lsin:
   ```bash
   sudo ufw allow 80,443/tcp
   ```
   Bu buyruq server xavfsizlik devorida (firewall) shu portlarni ochadi.
3. `.env` da `DOMAIN=inventar.fdtu.uz` deb yozing va qayta ishga tushiring:
   ```bash
   docker compose --profile https up -d
   ```
   Caddy Let's Encrypt'dan bepul sertifikatni o'zi oladi va muddati tugashidan oldin o'zi yangilaydi.

### 2.2. Universitetda allaqachon nginx/Apache bo'lsa

Caddy'siz ishga tushiring:
```bash
docker compose up -d --build
```
Bu buyruq Caddy'siz ishga tushiradi. Ilova serverning o'zida `http://127.0.0.1:3000` manzilida ishlaydi. Mavjud nginx'da HTTPS va proksini sozlang. Namuna:
```
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
    client_max_body_size 30m;
}
```

### 2.3. Telefonga o'rnatish

- **iPhone**: Safari'da saytni oching → «Ulashish» (↑) → «Bosh ekranga qo'shish».
- **Android**: Chrome'da saytni oching → ⋮ menyu → «Bosh ekranga qo'shish» yoki «Ilovani o'rnatish».

---

## 3. Zaxira nusxa

### 3.1. Avtomatik zaxira

`backup` xizmati har kuni soat **02:30** da (Toshkent vaqti) bazaning to'liq nusxasini `backups/` papkasiga yozadi. Fayl nomi `inventar-2026-11-23_0230.dump` ko'rinishida bo'ladi. 30 kundan eski nusxalar o'chiriladi (`.env` da `BACKUP_KEEP_DAYS` bilan o'zgartirish mumkin).

### 3.2. Qo'lda zaxira olish

```bash
docker compose exec backup sh /backup.sh
```
Bu buyruq hoziroq zaxira nusxa oladi. Uni katta o'zgarishlardan oldin bering, masalan, yangilashdan oldin.

```bash
ls -lh backups/
```
Bu buyruq mavjud zaxira fayllarini ko'rsatadi.

> **Muhim:** zaxira faqat shu serverda tursa, server buzilganda u ham yo'qoladi. Vaqti-vaqti bilan `backups/` papkasini boshqa kompyuterga yoki fleshkaga ko'chiring. Masalan, o'z kompyuteringizdan:
> ```bash
> scp -r foydalanuvchi@SERVER_IP:~/inventar/backups ./inventar-zaxira
> ```
> Bu buyruq serverdagi zaxiralarni kompyuteringizdagi `inventar-zaxira` papkasiga yuklab oladi.

### 3.3. Zaxiradan tiklash

```bash
sh scripts/restore.sh backups/inventar-2026-11-23_0230.dump
```
Bu buyruq ilovani to'xtatadi, bazani tanlangan zaxira holatiga qaytaradi va ilovani qayta ishga tushiradi.

**Diqqat:** zaxiradan keyin kiritilgan ma'lumotlar o'chadi. Shuning uchun tiklashdan oldin hozirgi holatni ham zaxiralab qo'ying (3.2).

---

## 4. Yangilash

Dasturning yangi versiyasi chiqqanda:
```bash
docker compose exec backup sh /backup.sh
```
Bu buyruq avval zaxira nusxa oladi.

```bash
git pull
```
Bu buyruq yangi kodni yuklab oladi.

```bash
docker compose --profile https up -d --build
```
Bu buyruq dasturni qayta yig'adi va ishga tushiradi. Baza tuzilmasi avtomatik yangilanadi, ma'lumotlar saqlanib qoladi.

Foydalanuvchilarga ilovani bir-ikki marta yangilashni (sahifani pastga tortish) ayting.

---

## 5. Foydali buyruqlar

| Buyruq | Nima qiladi |
|---|---|
| `docker compose ps` | xizmatlar holati |
| `docker compose logs -f app` | ilova jurnali (chiqish: `Ctrl+C`) |
| `docker compose restart app` | ilovani qayta ishga tushirish |
| `docker compose down` | hammasini to'xtatish (ma'lumotlar o'chmaydi) |
| `docker compose exec app node prisma/seed.mjs` | admin yaratish yoki uning parolini tiklash |

> `docker compose down -v` buyrug'ini **bermang**: `-v` bazani butunlay o'chiradi.

---

## 6. Eski ilovalardan ma'lumot ko'chirish

Har bir eski ilovaning Hisobot bo'limida «CSV tayyorlash» tugmasi bor. Ko'chirish tartibi:
1. Asl Excel faylni yangi tizimga yuklang (**Bo'limlar → Excel yuklash**). Bo'lim yaratiladi.
2. Shu bo'limda **Amallar → Eski ilovadan CSV yuklash** ni bosing va eski CSV faylni tanlang.
3. Tizim nima qo'shilishini ko'rsatadi (topilganlar, ortiqchalar, inventarsizlar, xonalar). Tekshirib, **Tasdiqlash va yozish** ni bosing. Xonalar «jarayonda» holatida tushadi.

CSV faqat tanlangan bo'limga yoziladi, boshqa bo'limlarga ta'sir qilmaydi. Bir faylni ikki marta yuklasangiz, takroriy yozuvlar qo'shilmaydi.

---

## 7. Xavfsizlik

- Parollar bcrypt bilan xeshlangan holda saqlanadi. 15 daqiqada 5 marta noto'g'ri kiritilsa, login vaqtincha bloklanadi.
- Kirish sessiya (httpOnly cookie) orqali, sessiya muddati 30 kun.
- Ma'lumotlarni, jumladan MOL ism-familiyalarini, faqat tizimga kirgan foydalanuvchilar ko'radi. Sahifalar qidiruv tizimlariga yopiq (`noindex`, `robots.txt`).
- Har bir amal kim tomonidan va qachon qilingani **Amallar jurnali**ga yoziladi.
- Hech narsa butunlay o'chmaydi: o'chirilganlar **Savat**ga tushadi va admin ularni tiklay oladi.
- Haqiqiy Excel/CSV fayllarni git'ga qo'shmang (`.gitignore` buni bloklaydi).

---

## 8. Dasturchilar uchun

Texnologiyalar: Next.js 15 (App Router, TypeScript), PostgreSQL 16, Prisma 6, SheetJS (`@e965/xlsx`, rasmiy SheetJS 0.20.3 ning npm nusxasi), jsQR + BarcodeDetector, qrcode-generator.

Lokal ishga tushirish (Node 22 va PostgreSQL kerak):
```bash
npm install
cp .env.example .env    # DATABASE_URL ni lokal bazaga moslang
npx prisma migrate dev
npm run db:seed
npm run dev
```

Testlar (alohida test bazasi kerak, sukut bo'yicha `inventar_test`; `TEST_DATABASE_URL` bilan o'zgartiriladi):
```bash
npm test
```

Kirill matnlar: barcha interfeys matnlari `src/lib/i18n.ts` faylida. Yangi matnni `lat` qismiga qo'shib, `npm run i18n` buyrug'ini bersangiz, kirill qismi avtomatik to'ldiriladi. Qo'lda tuzatilgan kirill matnlar saqlanib qoladi.

Asosiy fayllar:
- `prisma/schema.prisma`: baza tuzilmasi (bo'limga tegishli har bir jadvalda `sectionId` majburiy, unikal cheklov `(sectionId, inv)` bo'yicha);
- `src/server/excel.ts`: Excel o'qish qoidalari;
- `src/server/sections.ts`: bo'limlar (import, yangilash, tozalash, o'chirish);
- `src/server/ops.ts`: skanlar va telefondan keladigan barcha amallar;
- `src/lib/sync.tsx`: offline navbat;
- `reference/eski-ilova/`: eski bir sahifali ilova (namuna sifatida).
