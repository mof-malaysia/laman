---
title: Ejen AI dalam Laman
description: Pegawai boleh meminta ejen AI membina dan mengubah laman web dengan alat Laman sendiri, sebagai pegawai itu, dengan kebenaran pegawai itu, dan setiap tindakan direkodkan.
path: /ejen-ai
alternate: /en/agents
heading: "Ejen AI, sebagai pegawai, bukan sebagai vendor"
lead: "Pegawai boleh meminta ejen AI membina dan mengubah laman web dengan alat Laman sendiri. Ejen hanya boleh melakukan apa yang pegawai itu boleh, dan setiap tindakan direkodkan."
---

## Apa yang boleh dilakukan

Laman mempunyai pelayan Model Context Protocol (MCP) terbina dalam. Klien seperti Claude Desktop atau Codex disambungkan kepadanya dan mendapat kira-kira 80 alat: membaca halaman, menyusun blok, mengemas kini navigasi dan pengumuman, memuat naik media dan, jika peranan pegawai membenarkan, menerbitkan.

Contoh permintaan:

> Tambah pengumuman di atas setiap halaman: pejabat ditutup esok kerana banjir, dan urusan kaunter di cawangan Seksyen 9.

Ejen menyediakan draf pengumuman. Editor menyemaknya dan Pengurus Kandungan menerbitkannya, sama seperti kerja yang dibuat dengan tangan.

## Mengapa ia selamat

- **Dimatikan untuk semua orang** sehingga Pentadbir menghidupkan akses MCP untuk seseorang.
- **Log masuk sebagai pegawai itu,** dengan OAuth, dan hanya mendapat alat yang dibenarkan peranannya, disemak pada setiap panggilan. Ejen seorang Editor tidak pernah melihat alat untuk menerbitkan.
- **Laluan yang sama dengan panel pentadbir.** Setiap alat melalui API Laman sendiri, dengan semakan kebenaran, pengesahan, perlindungan draf dan log audit yang sama.
- **Setiap panggilan direkodkan:** alat, sasaran, keputusan dan tempoh.
- **Boleh diputuskan pada bila-bila masa.** Pentadbir melihat dan membatalkan sambungan, dan setiap satu tamat sendiri selepas 7 hari.
- **Tiada muat turun.** Laman tidak pernah mengambil fail dari alamat yang diberikan ejen. Fail datang dari komputer pegawai sahaja.

## Tidak terikat kepada satu vendor AI

MCP ialah protokol terbuka, jadi agensi memilih klien yang sesuai dengan dasarnya, atau tidak menggunakan ejen langsung. Tiada apa dalam Laman yang bergantung pada perkhidmatan AI.
