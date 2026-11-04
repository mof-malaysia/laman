---
title: Teknologi berdaulat untuk laman web kerajaan
description: Siapa yang memegang data, siapa yang memegang kod, siapa yang boleh terus menjalankannya, dan siapa yang menentukan rupanya. Begini cara Laman menjawab setiap soalan itu.
path: /kedaulatan
alternate: /en/sovereignty
heading: "Teknologi berdaulat untuk laman web kerajaan"
lead: "Laman web agensi ialah pintu hadapan perkhidmatan awam. Kedaulatan bermaksud agensi sendiri yang memegang empat perkara: data di sebaliknya, kod yang menjalankannya, keupayaan untuk terus menjalankannya, dan kuasa menentukan rupanya. Laman dibina supaya keempat-empatnya kekal di tangan agensi."
---

## Data: kekal di pusat data anda

Satu pemasangan Laman ialah satu laman web, di pelayan agensi sendiri. Tiada awan yang kami kendalikan, tiada akaun untuk didaftarkan, dan tiada data yang dihantar kepada kami.

- **Tiada sambungan keluar.** Laman tidak memuatkan skrip dari CDN dan tidak membuat carian kepada perkhidmatan luar. Ia boleh dipasang di rangkaian dalaman tanpa akses internet.
- **Analitik di pangkalan data anda sendiri.** Statistik pelawat disimpan dalam fail pangkalan data berasingan di pelayan yang sama. Tiada kuki, tiada alamat IP disimpan, dan tiada pengecam yang kekal lebih daripada sehari.
- **Negara pelawat hanya jika anda mahu.** Laman tidak membawa pangkalan data lokasi IP. Jika agensi mahu melihat negara pelawat, pasukan ICT memasang fail itu sendiri.

## Kod: sumber terbuka

Laman ialah perisian sumber terbuka di bawah lesen MIT. Agensi anda boleh membaca setiap baris, mengauditnya sendiri atau melalui pihak ketiga, menjalankannya, dan mengubahnya mengikut keperluan.

Tiada yuran lesen, tiada had bilangan pengguna, dan tiada ciri yang dikunci di sebalik langganan.

## Operasi: mudah dijalankan sendiri

Laman sengaja dibina kecil, supaya pasukan ICT agensi boleh menjalankannya tanpa vendor.

- **Satu proses, satu fail.** Pembina ialah satu proses Node, dengan satu fail SQLite untuk semua kandungan dan satu folder media. Analitik, jika dihidupkan, disimpan dalam fail SQLite kedua. Tiada pelayan pangkalan data, tiada baris gilir luaran, tiada perkhidmatan mikro.
- **Satu imej Docker.** Dipasang dengan Docker Compose, dengan Caddy pilihan untuk HTTPS.
- **Laman web statik.** Apa yang dicapai orang awam ialah fail HTML, CSS dan imej biasa. Ia boleh dihidangkan oleh pembina sendiri, atau oleh nginx, Caddy atau mana-mana pelayan web yang agensi sudah gunakan.
- **Sandaran yang boleh dipulihkan.** Laman membuat sandaran setiap hari, sebelum setiap naik taraf, dan apabila diminta. Setiap sandaran diperiksa semasa dibuat, dan pemulihan boleh diuji tanpa menyentuh laman web.
- **Naik taraf yang selamat.** Sebelum naik taraf mengubah pangkalan data, Laman menyimpan salinannya. Jika ada yang gagal, salinan itu dikembalikan dan laman web kekal seperti sebelumnya.

## Jika pasukan Laman hilang esok

Ini soalan yang patut ditanya tentang mana-mana perisian kerajaan. Jawapan Laman:

- **Laman web anda terus berjalan.** Ia fail statik. Pelayan web mana-mana boleh terus menghidangkannya, walaupun pembina dimatikan.
- **Kod kekal di tangan anda.** Ia sumber terbuka. Agensi anda, atau mana-mana vendor yang dilantik, boleh terus menyelenggara dan menambah baiknya.
- **Data anda tidak terkunci.** Semua kandungan ada dalam satu fail SQLite dan satu folder media, format yang terbuka dan didokumenkan.
- **Sandaran ialah fail biasa.** Arkib `.tar.gz` di folder yang anda pilih, yang boleh disalin oleh alat sandaran yang agensi sudah gunakan.

Tiada lesen yang tamat tempoh, tiada pelayan kami yang perlu dihubungi, dan tiada akaun yang boleh ditutup.

## Reka bentuk: dibina di atas FTDS

Laman dibina di atas FTDS, sistem reka bentuk Malaysia. Setiap blok ialah komponen FTDS, jadi setiap laman web Laman mewarisi tipografi, warna, fokus papan kekunci dan susun atur yang sama, yang direka untuk kebolehcapaian.

- **Bahasa Melayu dahulu.** Kandungan laman web dalam Bahasa Melayu secara lalai, dengan bahasa Inggeris sebagai bahasa kedua.
- **Identiti agensi, bukan tema bebas.** Agensi memilih nama, logo dan warna utamanya sendiri. Laman menjana tona warna itu dan memastikan kontrasnya memenuhi WCAG AA, jadi warna agensi tidak pernah menjadikan teks sukar dibaca.

## Kawalan: di tangan pegawai

Kedaulatan juga bermaksud agensi tidak bergantung kepada pihak luar untuk mengemas kini laman webnya sendiri.

- **Pegawai menerbitkan sendiri.** Tiada tiket vendor untuk menukar waktu operasi atau menerbitkan notis.
- **Peranan yang jelas.** Editor menyediakan draf. Pengurus Kandungan menerbitkan. Pentadbir menguruskan akaun. Garisannya mudah: adakah perubahan ini mengubah laman web secara langsung?
- **Siapa buat apa, direkodkan.** Log audit merekodkan log masuk, perubahan akaun dan setiap terbitan. Akaun dinyahaktifkan, bukan dipadam, supaya sejarah sentiasa tahu siapa yang melakukannya.
- **Tiada pelayan e-mel diperlukan.** Pautan jemputan dan set semula kata laluan diserahkan terus oleh Pentadbir.

## AI, mengikut syarat anda

Pegawai boleh meminta ejen AI membina dan mengubah laman web menggunakan alat Laman sendiri, melalui Model Context Protocol (MCP). Ejen itu bukan akaun perkhidmatan vendor:

- Ia **dimatikan** untuk semua orang sehingga Pentadbir membenarkannya untuk seseorang.
- Ia log masuk **sebagai pegawai itu**, dan hanya boleh melakukan apa yang peranan pegawai itu benarkan.
- **Setiap panggilan alat direkodkan** dalam log audit, dan sambungan boleh diputuskan pada bila-bila masa.
- Pelayan Laman **tidak pernah memuat turun alamat** bagi pihak ejen. Fail datang dari komputer pegawai sahaja.
- Ia berfungsi dengan **mana-mana klien MCP**, bukan satu vendor AI sahaja.

[Ketahui tentang ejen AI](/ejen-ai)
