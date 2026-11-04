---
title: "Laman: pembina laman web agensi, di pelayan anda sendiri"
description: Laman ialah pembina laman web sumber terbuka untuk agensi kerajaan. Pegawai menyusun blok FTDS, menyemak dan menerbitkan laman web statik yang pantas dan mudah diakses, di pelayan agensi sendiri.
path: /
alternate: /en
---

<!-- block: hero -->

# Laman web agensi anda, di pelayan anda, dalam kawalan anda.

Laman ialah pembina laman web sumber terbuka untuk agensi kerajaan. Pegawai menyusun blok FTDS, menyemak, dan menekan Terbit. Laman web yang pantas dan mudah diakses terus ke udara, dari pelayan agensi sendiri.

- [Pasang Laman](/pasang) (utama)
- [Lihat cara ia berfungsi](/ciri)

Gambar: kanvas penyunting, dengan seorang pegawai menyunting tajuk halaman terus pada halaman.

<!-- block: problem (feature grid, 3) -->

## Laman web kerajaan tidak sepatutnya sesukar ini

### Tampalan setiap bulan

Setiap pemalam dan tema ialah satu lagi perisian yang perlu dikemas kini, dan satu lagi pintu untuk diserang. Pasukan ICT anda menjaga laman web, bukan menambah baiknya.

### Tiket untuk setiap perubahan

Waktu operasi berubah, tetapi laman web menunggu vendor. Notis segera diterbitkan lewat, atau sebagai poster yang tidak dapat dibaca oleh semua orang.

### Setiap halaman berbeza rupa

Apabila sesiapa sahaja boleh menggayakan apa sahaja, laman web perlahan-lahan menjadi sukar dibaca, sukar dicari dan sukar digunakan di telefon.

<!-- block: steps -->

## Tiga langkah, tanpa kod

1. **Susun.** Pilih templat atau halaman kosong, kemudian susun blok FTDS di kanvas. Taip teks terus pada halaman, seperti yang akan dilihat pelawat.
2. **Semak.** Sebelum diterbitkan, Laman memeriksa halaman: tajuk utama, teks alt imej, pautan rosak, pautan "klik sini", dan teks contoh yang tertinggal.
3. **Terbit.** Tekan Terbit, atau jadualkan. Laman menulis laman web statik dan menggantikan versi lama sekali gus. Jika ada yang tidak kena, terbitan boleh dibatalkan.

Laman web yang diterbitkan ialah fail HTML statik. Ia terus berfungsi walaupun pembina dimatikan.

<!-- block: sovereignty (feature grid, 5) -->

## Teknologi berdaulat, bukan sekadar slogan

### Data anda kekal di pusat data anda

Kandungan, akaun, sejarah dan statistik pelawat disimpan di pelayan agensi. Laman tidak menghubungi mana-mana perkhidmatan luar, dan berfungsi tanpa akses internet.

### Kod yang boleh anda baca

Laman ialah perisian sumber terbuka. Agensi anda boleh membaca, mengaudit, menjalankan dan mengubahnya.

### Mudah dijalankan sendiri

Satu proses, satu fail pangkalan data, satu imej Docker. Pasukan ICT anda boleh menjalankannya tanpa vendor.

### Reka bentuk Malaysia

Dibina di atas FTDS, sistem reka bentuk Malaysia, dengan Bahasa Melayu sebagai bahasa lalai kandungan. Panel pentadbir boleh digunakan dalam Bahasa Melayu atau Inggeris.

### Pegawai yang memegang kawalan

Pegawai menerbitkan sendiri. Ejen AI boleh membantu, tetapi hanya sebagai pegawai itu, dengan kebenaran pegawai itu, dan setiap tindakannya direkodkan.

[Baca tentang teknologi berdaulat](/kedaulatan)

<!-- block: guardrails (split, screenshot) -->

## Cara yang mudah diakses ialah cara yang paling mudah

Pegawai menyusun blok yang telah diluluskan. Tiada gaya bebas, tiada HTML tersuai dan tiada pemalam, jadi kebolehcapaian FTDS tidak boleh dipintas secara tidak sengaja.

Sebelum halaman diterbitkan, Laman memberitahu apa yang akan menyukarkan pelawat, dan cara membetulkannya. Halaman tanpa tajuk utama tidak boleh diterbitkan langsung.

Laman juga jujur tentang perkara yang tidak dapat diperiksanya, seperti sama ada teks alt itu bermakna atau apa isi kandungan sesuatu PDF. Perkara itu kekal sebagai tanggungjawab pegawai, dan Laman menyatakannya.

Gambar: semakan sebelum menerbitkan, dengan amaran "Imej ini tiada teks alt" dan "Teks pautan seperti 'klik sini' tidak menerangkan ke mana pautan pergi".

<!-- block: officer (feature grid, 4) -->

## Untuk pegawai yang ada kerja lain

### Apa yang anda lihat, itulah yang pelawat dapat

Kanvas, pratonton dan laman web yang diterbitkan dilukis oleh pemapar yang sama.

### Terbit sekarang, atau esok pagi

Jadualkan terbitan, dan pengumuman tapak untuk notis segera seperti penutupan pejabat.

### Setiap kesilapan boleh dibetulkan

Sejarah setiap halaman, pulihkan versi lama, batalkan terbitan, dan halaman yang dipadam boleh dikembalikan.

### Tiada kerja yang hilang

Perubahan yang belum disimpan kekal walaupun tetingkap tertutup atau sesi tamat. Jika orang lain menyimpan halaman yang sama dahulu, Laman bertanya kepada anda, bukan menulis ganti kerja anda secara senyap.

<!-- block: compare teaser (table, 4 rows) -->

## Laman berbanding WordPress, Joomla dan Drupal

|                                         | Laman                               | WordPress, Joomla, Drupal       |
| --------------------------------------- | ----------------------------------- | ------------------------------- |
| Apa yang dicapai oleh orang awam        | Fail HTML statik                    | Aplikasi PHP dan pangkalan data |
| Memanjangkan fungsi                     | Tiada pemalam, mengikut reka bentuk | Pemalam, sambungan atau modul   |
| Laman web berfungsi jika pentadbir mati | Ya                                  | Tidak                           |
| Analitik pelawat tanpa kuki             | Terbina dalam                       | Pemalam atau pihak ketiga       |

[Lihat perbandingan penuh](/banding)

<!-- block: runs on (code) -->

## Satu proses Node. Satu fail SQLite. Satu imej Docker.

```sh
cp .env.example .env    # isi tetapan
docker compose --profile https up -d --build
```

Selepas mengklon repositori, dua arahan ini menjalankan pembina bersama HTTPS. Sandaran berjalan setiap hari dengan sendirinya.

[Panduan pemasangan](/pasang)

<!-- block: cta band -->

## Cuba Laman di agensi anda

Pasang di pelayan anda sendiri dari GitHub, atau hubungi pasukan kami untuk taklimat.

- [Pasang Laman](/pasang) (utama)
- [Hubungi pasukan](/hubungi)
