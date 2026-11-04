---
title: Pasang Laman
description: Pasang Laman di pelayan agensi anda dengan Docker Compose. Keperluan, langkah pemasangan, sandaran, pemulihan dan naik taraf.
path: /pasang
alternate: /en/install
heading: "Pasang Laman"
lead: "Laman berjalan sebagai satu bekas Docker, menghidangkan panel pentadbir di `/admin` dan laman web di `/` dari satu port. Panduan ini untuk pasukan ICT."
---

## Apa yang anda perlukan

- Pelayan Linux dengan Docker Engine 24 atau lebih baharu, dan pemalam Compose (`docker compose version`).
- Untuk HTTPS, sama ada nama hos (contohnya `www.agensi.gov.my`) yang menghala ke pelayan, supaya Caddy boleh mendapatkan sijil, atau proksi anda sendiri seperti nginx atau pengimbang beban.
- Folder sandaran, sebaik-baiknya di cakera lain atau disalin keluar dari mesin.

Letakkan pembina di rangkaian dalaman atau di belakang VPN. Laman web yang diterbitkan boleh dihidangkan kepada orang awam secara berasingan.

## Langkah pemasangan

1. **Dapatkan kod.** Belum ada imej yang diterbitkan; imej dibina dari repositori.

   ```sh
   git clone https://github.com/mof-malaysia/laman.git
   cd laman
   ```

2. **Isi tetapan.**

   ```sh
   cp .env.example .env
   chmod 600 .env
   ```

   Dalam `.env`, tetapkan akaun pertama (`SUPER_ADMIN_USERNAME`, dan `SUPER_ADMIN_PASSWORD` sekurang-kurangnya 12 aksara), alamat laman web (`SITE_URL`) dan folder sandaran di hos (`BACKUP_PATH`). Fail itu menerangkan setiap baris.

3. **Mulakan.** Dengan Caddy, yang mengurus sijil HTTPS (port 80 dan 443 mesti terbuka):

   ```sh
   docker compose --profile https up -d --build
   ```

   Atau di belakang proksi anda sendiri, di `127.0.0.1:8080`:

   ```sh
   docker compose up -d --build
   ```

   Binaan pertama mengambil beberapa minit. Ia sedia apabila `docker compose ps` menunjukkan `healthy`.

4. **Log masuk** di `https://<laman anda>/admin` dengan akaun pertama, dan pilih kata laluan baharu. Kemudian buang `SUPER_ADMIN_PASSWORD` dari `.env`.

5. **Wajibkan dua faktor.** Dalam Tetapan, hidupkan **Wajibkan log masuk dua faktor untuk semua orang**. Setiap akaun mendaftar aplikasi pengesah pada log masuk seterusnya.

6. **Jemput pasukan anda.** Pilih **Jemput seseorang**, tetapkan peranan (Editor, Pengurus Kandungan atau Pentadbir), dan serahkan pautan sekali guna terus kepada orang itu. Tiada pelayan e-mel diperlukan.

## Menghidangkan laman web awam

Laman boleh menghidangkannya sendiri. Untuk menghidangkan fail statik dari nginx atau Caddy sedia ada, anda perlukan tiga peraturan: fail yang telah dimampatkan, alamat tanpa garis condong di hujung, dan halaman 404. Teruskan hanya `/_v` (analitik) ke pembina. Konfigurasi contoh untuk nginx ada dalam [dokumentasi di GitHub](https://github.com/mof-malaysia/laman/blob/main/docs/site-builder.md).

## Sandaran

Laman membuat sandaran setiap hari pada 2:00 pagi waktu Malaysia, sebelum setiap naik taraf, dan apabila Pentadbir menekan **Sandarkan sekarang** dalam Tetapan. Arkib disimpan dalam `BACKUP_PATH` di hos.

```sh
docker compose exec site-builder site-builder backup                      # buat satu sekarang
docker compose exec site-builder site-builder backups                     # senaraikan
docker compose exec site-builder site-builder backup --verify <arkib>     # uji pemulihan
```

Sandaran di cakera yang sama hilang bersama cakera itu, jadi salin `BACKUP_PATH` keluar dari mesin dengan alat sedia ada. Jangan salin volum data semasa bekas berjalan; gunakan arkib.

## Pemulihan

Hentikan pembina dahulu; pemulihan tidak akan berjalan jika tidak.

```sh
docker compose stop site-builder
docker compose run --rm --no-deps site-builder site-builder restore <arkib>
docker compose start site-builder
```

Akaun dan kata laluan kembali seperti dalam sandaran, semua orang dilog keluar, dan laman web diterbitkan semula. Apa yang digantikan disimpan, bukan dipadam.

## Naik taraf

```sh
git pull
docker compose up -d --build
```

Versi baharu membuat sandaran pangkalan data, kemudian mengemas kininya semasa bermula. Jika gagal, pangkalan data dikembalikan dan sebabnya ditulis dalam log.
