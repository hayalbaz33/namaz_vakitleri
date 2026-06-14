# Namaz Vakti TV

GitHub Pages için hazırlanmış premium, animasyonlu namaz vakti ekranı.

## Kurulum

1. Bu klasördeki dosyaları GitHub repo ana dizinine yükle.
2. Repository > Settings > Pages bölümünden GitHub Pages'i aktif et.
3. Siteyi TV/Apple TV/iPad ekranına yansıt.

## Konum Ayarı

`script.js` dosyasının en üstündeki CONFIG alanından değiştirilebilir:

```js
const CONFIG = {
  city: "Mersin",
  country: "Turkey",
  method: 13,
  school: 1,
  warningMinutes: 10,
  includeSunriseInCountdown: false,
};
```

`method: 13` AlAdhan tarafında Türkiye / Diyanet metodudur.
