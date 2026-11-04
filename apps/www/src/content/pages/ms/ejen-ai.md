---
title: Ejen AI dalam Laman
description: Pegawai boleh meminta ejen AI membina dan mengubah laman web dengan alat Laman sendiri, sebagai pegawai itu, dengan kebenaran pegawai itu, dan setiap tindakan direkodkan.
path: /ejen-ai
alternate: /en/agents
heading: "Ejen AI, sebagai pegawai, bukan sebagai vendor"
lead: "Pegawai boleh meminta ejen AI membina dan mengubah laman web menggunakan alat Laman sendiri. Ejen itu hanya boleh melakukan apa yang pegawai itu boleh lakukan, dan setiap tindakannya direkodkan."
---

## Apa yang boleh dilakukan

Laman mempunyai pelayan Model Context Protocol (MCP) terbina dalam. Klien MCP seperti Claude Desktop atau Codex boleh disambungkan kepadanya, dan ejen itu mendapat kira-kira 80 alat: membaca halaman, menyusun blok, mengemas kini navigasi dan pengumuman, memuat naik media, dan, jika peranan pegawai membenarkan, menerbitkan.

Contoh permintaan (ilustrasi):

> Tambah pengumuman di atas setiap halaman: pejabat ditutup esok kerana banjir, dan urusan kaunter di cawangan Seksyen 9.

Ejen itu menulis draf pengumuman melalui API Laman. Seorang Editor menyemaknya dan meminta Pengurus Kandungan menerbitkannya, sama seperti kerja yang dibuat dengan tangan.

## Mengapa ia selamat

- **Dimatikan untuk semua orang** sehingga Pentadbir menghidupkan akses MCP untuk seseorang.
- **Log masuk sebagai pegawai itu**, dengan OAuth. Ejen hanya mendapat alat yang dibenarkan oleh peranan pegawai, disemak semula pada setiap panggilan. Ejen seorang Editor tidak pernah melihat alat untuk menerbitkan.
- **Melalui laluan yang sama.** Setiap alat memanggil API Laman sendiri, jadi semakan kebenaran, pengesahan, perlindungan draf dan log audit yang sama terpakai.
- **Setiap panggilan direkodkan** dalam log audit: alat, sasaran, keputusan dan tempoh.
- **Boleh diputuskan pada bila-bila masa.** Pentadbir melihat setiap sambungan dan boleh membatalkannya. Sambungan tamat sendiri 7 hari selepas dibenarkan.
- **Tiada muat turun bagi pihak ejen.** Pelayan Laman tidak pernah mengambil fail dari alamat yang diberikan oleh ejen. Fail datang dari komputer pegawai sahaja.

## Tidak terikat kepada satu vendor AI

Laman menggunakan protokol terbuka, jadi agensi boleh memilih klien MCP yang sesuai dengan dasarnya sendiri, atau tidak menggunakan ejen langsung. Tiada apa dalam Laman yang bergantung pada mana-mana perkhidmatan AI.
