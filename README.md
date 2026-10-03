# Inventarizatsiya (QR skaner)

Alohida ishlaydigan veb-ilova. Claude'ga bog'liq emas, serverga ma'lumot yubormaydi.
Ma'lumotlar har bir telefonning brauzerida (IndexedDB) saqlanadi.

## GitHub Pages'ga qo'yish
1. github.com'da yangi repozitoriy oching (masalan, `inventar`).
2. Shu papkadagi **hamma fayllarni** (index.html, sw.js, manifest.webmanifest, icon-*.png, vendor papkasi) repozitoriyga yuklang.
3. Repozitoriyda: Settings -> Pages -> Source: `Deploy from a branch` -> Branch: `main`, papka `/ (root)` -> Save.
4. 1-2 daqiqadan keyin havola chiqadi: `https://FOYDALANUVCHI.github.io/inventar/`
5. Havolani telefonda **Safari**'da oching -> Ulashish (↑) -> **Bosh ekranga qo'shish**.

Kamera faqat HTTPS orqali ishlaydi. GitHub Pages HTTPS beradi.

## MUHIM: Excel fayllarni GitHub'ga yuklamang
Repozitoriy ochiq bo'ladi. Excel fayllarda moddiy javobgar shaxslarning ismlari bor.
Faylni faqat ilovaning ichida (Fayllar -> fayl tanlash) yuklang. U telefondan chiqmaydi.

## Ishlatish
1. **Fayllar**: Excel faylni tanlang. Har bir fayl alohida inventarizatsiya. Tugatgach **Yakunlash**.
2. **Yorliq**: butun fayl uchun QR-yorliqlar varaq-varaq chiqadi. Chop eting va yopishtiring.
3. **Skaner**: bino va xonani kiriting, QR'ni skanerlang (kamera yoki "Rasmga olib skanerlash").
4. **Hisobot**: topildi / topilmadi / ortiqcha, xonalar bo'yicha. CSV yuklab oling.

## Bir nechta telefon bilan ishlash
Ma'lumot telefonlar o'rtasida o'zi sinxronlanmaydi. Birlashtirish uchun:
1. Hamma telefonga **bir xil** Excel faylni yuklang.
2. Har kim o'z qismini skanerlaydi, so'ng **Fayllar -> Zaxira nusxa olish** bilan JSON fayl oladi.
3. Asosiy telefonda **Zaxirani qo'shish** orqali boshqalarning fayllarini tanlang. Natijalar birlashadi.

Doimiy umumiy baza kerak bo'lsa (hamma real vaqtda bitta bazaga yozishi), Firebase yoki Supabase ulash kerak.

## Eslatma
- Brauzer ma'lumotlarini (saytlar tarixi/cookie) tozalash ilova ma'lumotlarini ham o'chirishi mumkin. Vaqti-vaqti bilan zaxira nusxa oling.
- Safari'da "Shaxsiy" (Private) rejimda ma'lumot saqlanmaydi.
- Yangilash: fayllarni repozitoriyda almashtiring, ilovani 2 marta yangilang.
