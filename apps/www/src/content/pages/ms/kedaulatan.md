---
title: Teknologi berdaulat untuk laman web kerajaan
description: Siapa yang memegang data, siapa yang memegang kod, siapa yang boleh terus menjalankannya, dan siapa yang menentukan rupanya. Begini cara Laman menjawab setiap soalan itu.
path: /kedaulatan
alternate: /en/sovereignty
heading: "Teknologi berdaulat untuk laman web kerajaan"
lead: "Kedaulatan bermaksud agensi memegang empat perkara: datanya, kodnya, keupayaan untuk terus menjalankan laman web, dan kuasa menentukan rupanya. Laman memastikan keempat-empatnya kekal di tangan agensi."
---

## Data: kekal di pusat data anda

Satu pemasangan ialah satu laman web, di pelayan anda sendiri. Tiada awan kami, tiada pendaftaran, dan tiada data dihantar kepada kami.

- **Tiada sambungan keluar.** Tiada skrip dari CDN, tiada carian ke perkhidmatan luar. Ia berjalan di rangkaian tanpa akses internet.
- **Analitik kekal dengan anda,** dalam fail pangkalan data berasingan di pelayan yang sama. Tiada kuki, tiada alamat IP disimpan, dan tiada pengecam yang kekal lebih sehari.
- **Negara pelawat hanya jika dipilih.** Laman tidak membawa pangkalan data lokasi IP; pasukan ICT anda memasangnya jika perlu.

## Kod: sumber terbuka

Lesen MIT. Baca, audit, jalankan dan ubah setiap baris. Tiada yuran lesen, tiada had pengguna, tiada ciri yang dikunci di sebalik langganan.

## Operasi: mudah dijalankan sendiri

Laman sengaja kecil, supaya pasukan ICT anda boleh menjalankannya tanpa vendor.

- **Satu proses, satu fail.** Satu proses Node, satu fail SQLite untuk kandungan dan satu folder media. Analitik, jika dihidupkan, ialah fail SQLite kedua. Tiada pelayan pangkalan data, baris gilir atau perkhidmatan mikro.
- **Satu imej Docker,** dipasang dengan Docker Compose, dengan Caddy pilihan untuk HTTPS.
- **Laman web statik.** Orang awam menerima fail HTML, CSS dan imej biasa, dihidangkan oleh pembina atau mana-mana pelayan web yang anda sudah gunakan.
- **Sandaran yang boleh dipulihkan.** Setiap hari, sebelum setiap naik taraf, dan apabila diminta. Setiap sandaran diperiksa semasa dibuat, dan pemulihan boleh diuji tanpa menyentuh laman web.
- **Naik taraf yang selamat.** Laman menyalin pangkalan data dahulu. Jika ada yang gagal, salinan itu dikembalikan dan laman web kekal seperti sebelumnya.

## Jika pasukan Laman hilang esok

Tanya soalan ini tentang mana-mana perisian kerajaan. Jawapan Laman:

- **Laman web anda terus berjalan.** Ia fail statik yang boleh dihidangkan oleh mana-mana pelayan web.
- **Kod kekal di tangan anda.** Agensi anda, atau vendor yang dilantik, boleh terus menyelenggaranya.
- **Data anda tidak terkunci.** Kandungan ialah satu fail SQLite dan satu folder media, dalam format terbuka yang didokumenkan.
- **Sandaran ialah fail biasa:** arkib `.tar.gz` yang boleh disalin oleh alat sandaran sedia ada.

Tiada lesen yang tamat, tiada pelayan kami untuk dihubungi, tiada akaun untuk ditutup.

## Reka bentuk: dibina di atas FTDS

Setiap blok ialah komponen FTDS, sistem reka bentuk Malaysia, jadi setiap laman web Laman berkongsi tipografi, warna, fokus papan kekunci dan susun atur yang sama, yang direka untuk kebolehcapaian.

- **Dalam Bahasa Melayu,** daripada kandungan hingga label terbina dalam.
- **Identiti agensi, bukan tema bebas.** Pilih nama, logo dan warna utama anda. Laman menjana tona warna itu dan memastikan kontrasnya memenuhi WCAG AA.

## Kawalan: di tangan pegawai

- **Pegawai menerbitkan sendiri.** Tiada tiket vendor untuk menukar waktu operasi atau menerbitkan notis.
- **Peranan yang jelas.** Editor menyediakan draf, Pengurus Kandungan menerbitkan, Pentadbir mengurus akaun.
- **Siapa buat apa, direkodkan.** Log audit merekodkan log masuk, perubahan akaun dan setiap terbitan. Akaun dinyahaktifkan, bukan dipadam, jadi sejarahnya kekal lengkap.
- **Tiada pelayan e-mel diperlukan.** Pentadbir menyerahkan pautan jemputan dan set semula kata laluan secara terus.

## AI, mengikut syarat anda

Ejen AI dimatikan sehingga Pentadbir membenarkannya untuk seseorang. Ejen log masuk sebagai pegawai itu, hanya boleh melakukan apa yang peranannya benarkan, dan setiap panggilan direkodkan. Ia berfungsi dengan mana-mana klien MCP.

[Ketahui tentang ejen AI](/ejen-ai)
