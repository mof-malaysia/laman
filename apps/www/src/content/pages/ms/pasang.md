---
title: Pasang Laman
description: Pasang Laman di pelayan agensi anda dengan Docker Compose. Keperluan, langkah pemasangan, sandaran, pemulihan dan naik taraf.
path: /pasang
alternate: /en/install
heading: "Pasang Laman"
lead: "Laman berjalan sebagai satu bekas Docker: pembina, panel pentadbir di `/admin` dan laman web yang diterbitkan di `/`, dari satu port. Halaman ini untuk pasukan ICT yang akan memasangnya."
---

## Apa yang anda perlukan

- Pelayan Linux dengan Docker Engine 24 atau lebih baharu, dan pemalam Compose (`docker compose version`).
- Nama hos untuk laman web (contohnya `www.agensi.gov.my`) yang menghala ke pelayan, jika Caddy akan mendapatkan sijil HTTPS. Jika tidak, proksi HTTPS anda sendiri seperti nginx atau pengimbang beban.
- Folder untuk sandaran, sebaik-baiknya di cakera lain atau yang disalin keluar dari mesin.

Kami mengesyorkan pembina diletakkan di rangkaian dalaman atau di belakang VPN. Laman web yang diterbitkan boleh dihidangkan kepada orang awam secara berasingan.

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

   Dalam `.env`, isi akaun pertama (`SUPER_ADMIN_USERNAME` dan `SUPER_ADMIN_PASSWORD`, sekurang-kurangnya 12 aksara), alamat laman web (`SITE_URL`), dan folder sandaran di hos (`BACKUP_PATH`). Fail itu menerangkan setiap baris.

3. **Mulakan.** Dengan Caddy, yang mendapatkan dan memperbaharui sijil HTTPS sendiri (port 80 dan 443 mesti terbuka):

   ```sh
   docker compose --profile https up -d --build
   ```

   Atau di belakang proksi anda sendiri, yang mendengar di `127.0.0.1:8080`:

   ```sh
   docker compose up -d --build
   ```

   Binaan pertama mengambil beberapa minit. `docker compose ps` menunjukkan `healthy` apabila ia sedia.

4. **Log masuk.** Buka `https://<laman anda>/admin`, log masuk dengan akaun pertama, dan pilih kata laluan baharu. Selepas itu, buang `SUPER_ADMIN_PASSWORD` dari `.env`.

5. **Wajibkan dua faktor.** Sebagai Pentadbir utama, hidupkan **Wajibkan log masuk dua faktor untuk semua orang** dalam Tetapan, supaya setiap akaun mendaftar aplikasi pengesah pada log masuk seterusnya.

6. **Jemput pasukan anda.** Pilih **Jemput seseorang**, tetapkan peranan yang sesuai (Editor, Pengurus Kandungan atau Pentadbir), dan serahkan pautan sekali guna itu terus kepada orang tersebut. Tiada pelayan e-mel diperlukan.

## Menghidangkan laman web awam

Cara paling mudah: biarkan Laman menghidangkannya sendiri. Jika agensi mahu nginx atau Caddy sedia ada menghidangkan fail statik itu terus, folder laman web yang diterbitkan boleh dihidangkan dengan tiga peraturan: fail yang telah dimampatkan, alamat tanpa garis condong di hujung, dan halaman 404. Hanya `/_v` (analitik) yang perlu diteruskan ke pembina.

Konfigurasi contoh untuk nginx ada dalam [dokumentasi di GitHub](https://github.com/mof-malaysia/laman/blob/main/docs/site-builder.md).

## Sandaran

Laman membuat sandaran sendiri setiap hari pada pukul 2:00 pagi waktu Malaysia, sebelum setiap naik taraf, dan apabila Pentadbir menekan **Sandarkan sekarang** dalam Tetapan. Arkib disimpan dalam `BACKUP_PATH` di hos.

```sh
docker compose exec site-builder site-builder backup                      # buat satu sekarang
docker compose exec site-builder site-builder backups                     # senaraikan
docker compose exec site-builder site-builder backup --verify <arkib>     # uji pemulihan
```

Sandaran di cakera yang sama tidak terselamat jika cakera itu rosak. Salin `BACKUP_PATH` keluar dari mesin dengan alat yang agensi sudah gunakan. Jangan sekali-kali menyalin volum data semasa bekas berjalan; gunakan arkib.

## Pemulihan

Hentikan pembina dahulu; pemulihan menolak untuk berjalan jika tidak.

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

Versi baharu membuat sandaran pangkalan data, kemudian mengemas kininya semasa bermula. Jika ada yang gagal, pangkalan data dikembalikan seperti sebelumnya dan sebabnya ditulis dalam log.
