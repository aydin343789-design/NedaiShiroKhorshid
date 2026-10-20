# ندای شیروخورشید — شاخهٔ آزمایشی MOSS

این شاخهٔ مستقل برای سنجش جایگزینی موتورهای گفتار با **MOSS-TTS-Nano** ساخته شده است. در این آزمایش، مسیر آنلاین از Space عمومی OpenMOSS استفاده می‌کند و مسیر آفلاین، ONNX را با ONNX Runtime Android روی دستگاه اجرا می‌کند. این تغییرات هنوز با `main` ادغام نشده‌اند.

## حالت آنلاین

متن فارسی از طریق API عمومی Space رسمی OpenMOSS به سرویس Hugging Face فرستاده می‌شود و خروجی WAV دریافت و به MP3 تبدیل می‌شود. این مسیر نیازمند اینترنت است؛ صف، محدودیت مصرف، خواب‌بودن Space یا تغییر API می‌تواند باعث توقف آن شود. چون متن به سرویس شخص ثالث ارسال می‌شود، از متن حساس استفاده نکنید.

## حالت آفلاین Android

با نخستین انتخاب حالت آفلاین، برنامه مجموعهٔ لازم ONNX را از مخزن‌های رسمی Hugging Face دریافت و در فضای خصوصی برنامه ذخیره می‌کند. حجم دانلود حدود **۷۶۳ مگابایت** است؛ بهتر است دست‌کم **۱٫۸ گیگابایت فضای خالی** برای دانلود، فایل‌های موقت و اجرای مدل وجود داشته باشد. وزن‌ها داخل APK قرار ندارند و برای دانلود اولیه اینترنت لازم است؛ پس از آماده‌شدن مدل، متن و تولید صدا روی گوشی انجام می‌شود.

این آداپتر از نمونهٔ رسمی Android در مخزن [OpenMOSS/MOSS-TTS-Nano](https://github.com/OpenMOSS/MOSS-TTS-Nano/tree/main/examples/android_onnx_runtime) استفاده می‌کند و SentencePiece را در JavaScript به‌صورت محلی اجرا می‌کند. وزن‌ها از [مخزن ONNX مدل](https://huggingface.co/OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX) و [مخزن ONNX صوت‌ساز](https://huggingface.co/OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX) دریافت می‌شوند؛ metadata هر دو مخزن مجوز Apache-2.0 را اعلام می‌کند. فایل وزن‌ها به revision ثابت pin شده‌اند. مجوز و اعلان منبع کد در `native/moss-native/LICENSE-MOSS-TTS-Nano.txt` ثبت شده است.

مسیر آنلاین به [MOSS-TTS-Nano Space](https://huggingface.co/spaces/OpenMOSS-Team/MOSS-TTS-Nano) متصل می‌شود. نسخهٔ [Wan2GP Desktop Tauri](https://github.com/GKartist75/Wan2GP-Desktop-Tauri/releases/tag/v0.10.12) یک برنامهٔ دسکتاپ است و کد آن در مسیر Android/WebView این اپ لازم نیست؛ برای همین به‌عنوان runtime یا dependency این آزمایش وارد نشده است.

### محدودیت مهم صدای فارسی آفلاین

مخزن ONNX فعلاً صدای مرجع فارسی آماده برای حالت آفلاین ندارد؛ نمونهٔ Android چند صدای مرجع چندزبانه از زبان‌های دیگر دارد. این شاخه از آن صداها برای متن فارسی استفاده می‌کند تا اجرای ONNX و کیفیت خروجی قابل آزمایش باشد. بنابراین ممکن است تلفظ فارسی، لهجه و جنس صدا با نمونهٔ آنلاین فرق کند. کنترل لحن و سرعت فعلی نیز به‌طور کامل در موتور رسمی Android پیاده‌سازی نشده است. متن آفلاین در این نسخه به حداکثر ۱۰۰ token محدود است.

## ساخت و دریافت APK آزمایشی

```bash
npm ci
npm run lint
npm run build
npm run android:apk
```

`android:sync`، فایل‌های Kotlin/ONNX را در پروژهٔ Android تولیدشده نصب و وابستگی‌ها را اضافه می‌کند. شاخهٔ `test/moss-tts-nano` نیز به گردش‌کار GitHub Actions متصل است؛ Push روی این شاخه APK آزمایشی را به‌صورت Artifact می‌سازد. فایل APK برای تست است و خروجی Debug خواهد بود، مگر آنکه کلید امضای Release مخفی در GitHub تنظیم شده باشد.

## فایل‌های مرتبط با تغییر MOSS

- `src/utils/onlinePersianTts.ts` — اتصال آنلاین به Gradio API
- `src/utils/mossOfflineTts.ts` — SentencePiece و هماهنگی اجرای محلی
- `native/moss-native/MossOfflineTtsPlugin.kt` — دانلود مدل، ONNX و تبدیل WAV در Android
- `native/moss-native/MossOnnxDemoEngine.kt` — محرك inference رسمی OpenMOSS با سازگارسازی package
- `scripts/sync-android.mjs` — آماده‌سازی Capacitor و نصب plugin
- `.github/workflows/android-apk.yml` — ساخت خودکار APK برای شاخهٔ تست

شاخهٔ مورد استفادهٔ آزمایش جداست؛ تا زمان تأیید نتیجه، هیچ تغییری به `main` ارسال نمی‌شود.
