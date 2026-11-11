/**
 * BM for the text the block registry and the page templates carry in English
 * (`packages/blocks`): block names and descriptions, field labels and help,
 * select options, template names. Keyed by the English, which stays the
 * registry's one source; `rt()` in `../registry.ts` looks a string up here
 * when the admin is in BM. `test/registry-i18n.test.ts` fails on any registry
 * string missing from this list, so a new block or field brings its BM with it.
 */
export const registryMs: Record<string, string> = {
  // Hero
  Hero: "Hero",
  "The opening of a home or campaign page, with its only h1, up to two actions and an optional picture.":
    "Pembuka halaman utama atau kempen, dengan satu-satunya h1 halaman, sehingga dua tindakan dan gambar pilihan.",
  Eyebrow: "Label kecil",
  Title: "Tajuk",
  Description: "Penerangan",
  "Line under the actions": "Ayat di bawah butang",
  Picture: "Gambar",
  "The text sits on a panel, so it stays readable on any photo. Leave the alt text empty if the picture is only decoration.":
    "Teks diletakkan pada panel, jadi ia kekal mudah dibaca di atas apa-apa foto. Biarkan teks alt kosong jika gambar itu hanya hiasan.",
  "Primary action": "Tindakan utama",
  Label: "Label",
  Link: "Pautan",
  "Secondary action": "Tindakan kedua",
  Layout: "Susun atur",
  "Text only": "Teks sahaja",
  "Text beside a picture": "Teks di sebelah gambar",
  "Picture behind the text": "Gambar di belakang teks",
  Alignment: "Penjajaran",
  Left: "Kiri",
  Centred: "Tengah",
  "Picture side": "Kedudukan gambar",
  Right: "Kanan",
  Background: "Latar",
  Paper: "Kertas",
  Well: "Kelabu",
  "Primary wash": "Biru lembut",

  // Page intro
  "Page intro": "Pengenalan halaman",
  "The opening of an inner page: the breadcrumb, the page's only h1 and a short description.":
    "Pembuka halaman dalaman: laluan navigasi, satu-satunya h1 halaman dan penerangan ringkas.",
  Width: "Lebar",
  "Text column sets the page like an article: blocks that follow the page take it too.":
    "Lajur teks menyusun halaman seperti artikel: blok yang mengikut halaman turut menggunakannya.",
  Wide: "Luas",
  "Text column": "Lajur teks",

  // Text
  Text: "Teks",
  "Long-form text: headings, paragraphs, lists, links and quotes.":
    "Teks panjang: tajuk, perenggan, senarai, pautan dan petikan.",
  "Follow page lines the block up with the page's title.":
    "Ikut halaman menjajarkan blok dengan tajuk halaman.",
  "Follow page": "Ikut halaman",

  // Inset text
  "Inset text": "Teks serlahan",
  "A deadline, requirement or quote set apart from the text around it.":
    "Tarikh akhir, syarat atau petikan yang diasingkan daripada teks di sekelilingnya.",
  "Who said it (makes it a quote)": "Siapa yang berkata (menjadikannya petikan)",

  // Details
  Details: "Butiran",
  "Short help behind a link, for what only some people need.":
    "Bantuan ringkas di sebalik pautan, untuk perkara yang hanya diperlukan oleh sesetengah orang.",
  "Link text, as the reader's question": "Teks pautan, sebagai soalan pembaca",
  Help: "Bantuan",

  // Image
  Image: "Imej",
  "A picture from the media library, with a caption and its credit.":
    "Gambar daripada pustaka media, dengan kapsyen dan penghargaannya.",
  Caption: "Kapsyen",
  "Full width": "Lebar penuh",

  // Feature grid
  "Feature grid": "Grid ciri",
  "A section title and a grid of features, each with an icon, text and a link.":
    "Tajuk bahagian dan grid ciri, setiap satu dengan ikon, teks dan pautan.",
  Columns: "Lajur",
  Two: "Dua",
  Three: "Tiga",
  Cards: "Kad",
  "No card": "Tanpa kad",
  Card: "Kad",
  Features: "Ciri",
  Icon: "Ikon",
  Money: "Wang",
  Document: "Dokumen",
  Calendar: "Kalendar",
  People: "Orang",
  "Government office": "Pejabat kerajaan",
  Globe: "Glob",
  Shield: "Perisai",
  Bell: "Loceng",
  Home: "Rumah",
  Clock: "Jam",
  Tick: "Tanda semak",
  Announcement: "Pengumuman",
  Search: "Carian",
  Chat: "Sembang",
  Location: "Lokasi",
  "Places and people": "Tempat dan orang",
  "Documents and files": "Dokumen dan fail",
  "Time and events": "Masa dan acara",
  "Services and security": "Perkhidmatan dan keselamatan",
  "Notices and status": "Notis dan status",
  "Contact and social": "Hubungi dan media sosial",
  Putrajaya: "Putrajaya",
  Map: "Peta",
  Directions: "Arah",
  Person: "Individu",
  Organisation: "Organisasi",
  Accessibility: "Kebolehcapaian",
  "New document": "Dokumen baharu",
  Form: "Borang",
  Folder: "Folder",
  Book: "Buku",
  PDF: "PDF",
  Attachment: "Lampiran",
  Download: "Muat turun",
  Upload: "Muat naik",
  Print: "Cetak",
  "QR code": "Kod QR",
  Table: "Jadual",
  Video: "Video",
  Play: "Main",
  Award: "Anugerah",
  Flag: "Bendera",
  Star: "Bintang",
  Heart: "Hati",
  Lock: "Kunci",
  Settings: "Tetapan",
  Energy: "Tenaga",
  Computer: "Komputer",
  Mobile: "Telefon bimbit",
  "Thumbs up": "Ibu jari ke atas",
  Share: "Kongsi",
  WhatsApp: "WhatsApp",
  Telegram: "Telegram",
  Facebook: "Facebook",
  Instagram: "Instagram",
  X: "X",
  YouTube: "YouTube",
  TikTok: "TikTok",
  LinkedIn: "LinkedIn",
  RSS: "RSS",

  // Services
  Services: "Perkhidmatan",
  "Cards that each lead to a service, with one sentence and short facts.":
    "Kad yang setiap satunya membawa ke satu perkhidmatan, dengan satu ayat dan fakta ringkas.",
  Heading: "Tajuk",
  Introduction: "Pengenalan",
  Service: "Perkhidmatan",
  "One sentence": "Satu ayat",
  "Facts, e.g. Dalam talian, 10 minit, Percuma": "Fakta, contohnya Dalam talian, 10 minit, Percuma",
  Fact: "Fakta",
  "Tag beside the name, e.g. Baharu": "Tag di sebelah nama, contohnya Baharu",

  // Steps
  Steps: "Langkah",
  "How to apply, register or claim, in numbered steps, with a link on each.":
    "Cara memohon, mendaftar atau menuntut, dalam langkah bernombor, dengan pautan pada setiap satu.",
  "What to do": "Apa yang perlu dibuat",
  "Action under the steps": "Tindakan di bawah langkah",

  // Eligibility
  Eligibility: "Kelayakan",
  "Who can apply, as a checklist, and optionally who can't.":
    "Siapa yang boleh memohon, sebagai senarai semak, dan jika perlu, siapa yang tidak boleh.",
  "Heading of who can apply": "Tajuk siapa yang boleh memohon",
  "Who can apply (finish the heading's sentence)": "Siapa yang boleh memohon (sambung ayat tajuk)",
  Criterion: "Syarat",
  "Heading of who can't": "Tajuk siapa yang tidak boleh",
  "Who can't apply": "Siapa yang tidak boleh memohon",
  "Note: exceptions, or where to ask": "Nota: pengecualian, atau tempat untuk bertanya",

  // Links and downloads
  Links: "Pautan",
  "A heading and links to related pages, services and other websites.":
    "Tajuk dan pautan ke halaman, perkhidmatan dan laman web lain yang berkaitan.",
  Style: "Gaya",
  List: "Senarai",
  Downloads: "Muat turun",
  "Forms, guides and reports to download, with each file's type and size.":
    "Borang, panduan dan laporan untuk dimuat turun, dengan jenis dan saiz setiap fail.",
  Files: "Fail",
  File: "Fail",
  "Title (the file's name if empty)": "Tajuk (nama fail jika kosong)",

  // People
  "Leadership or a team: a photo, name and position for each person.":
    "Kepimpinan atau pasukan: foto, nama dan jawatan setiap orang.",
  Name: "Nama",
  Position: "Jawatan",
  Photo: "Foto",
  "Short bio": "Biodata ringkas",
  "Profile page": "Halaman profil",
  "Larger cards": "Kad lebih besar",
  None: "Tiada",
  "The first person": "Orang pertama",
  "The first two": "Dua orang pertama",

  // Partners and logos
  Partners: "Rakan kerjasama",
  "The agencies or partners behind a service: logo, name, what each does, and a link.":
    "Agensi atau rakan kerjasama di sebalik sesuatu perkhidmatan: logo, nama, peranan setiap satu, dan pautan.",
  "Tag line above the name, e.g. an acronym": "Baris kecil di atas nama, contohnya singkatan",
  "What it does here": "Peranannya di sini",
  Logo: "Logo",
  Four: "Empat",
  Logos: "Logo",
  "A quiet row of the logos of agencies or partners that use a service.":
    "Sebaris logo agensi atau rakan kerjasama yang menggunakan sesuatu perkhidmatan.",
  "Organisation (the logo's alt text)": "Organisasi (teks alt logo)",
  "Grey until hovered": "Kelabu sehingga dihalakan tetikus",

  // Event details
  "Event details": "Butiran acara",
  "An event's date, time, venue, fee and registration, beside what it's about and its programme.":
    "Tarikh, masa, tempat, yuran dan pendaftaran acara, di sebelah perihal acara dan aturcaranya.",
  "Date as people read it, e.g. Khamis, 12 November 2026":
    "Tarikh seperti yang dibaca orang, contohnya Khamis, 12 November 2026",
  Time: "Masa",
  Venue: "Tempat",
  Fee: "Yuran",
  "Map link": "Pautan peta",
  Registration: "Pendaftaran",
  "Line under registration, e.g. when it closes":
    "Ayat di bawah pendaftaran, contohnya bila ia ditutup",
  "About the event": "Tentang acara",
  Programme: "Aturcara",
  "Time, e.g. 9.00 pagi": "Masa, contohnya 9.00 pagi",
  Session: "Sesi",
  "Speaker or detail": "Penceramah atau butiran",

  // Figures
  Figures: "Angka",
  "Two to four headline figures, with the source they share.":
    "Dua hingga empat angka utama, dengan sumber yang dikongsi.",
  "Figure, e.g. RM 4.2 bil": "Angka, contohnya RM 4.2 bil",
  "What it counts": "Apa yang dikira",
  Footnote: "Nota kaki",
  "Source and date": "Sumber dan tarikh",
  "Impact figures": "Angka impak",
  "What a programme has achieved: each figure with its period and source.":
    "Pencapaian sesuatu program: setiap angka dengan tempoh dan sumbernya.",
  Figure: "Angka",
  "Period it covers": "Tempoh yang diliputi",
  Source: "Sumber",
  "Link to the source": "Pautan ke sumber",

  // FAQ
  FAQ: "Soalan lazim",
  "Common questions with answers that open one at a time.":
    "Soalan lazim dengan jawapan yang dibuka satu demi satu.",
  "Still need help? line": "Ayat “Masih perlukan bantuan?”",
  "Under the introduction, with the link after it, e.g. Masih perlukan bantuan?":
    "Di bawah pengenalan, diikuti pautan, contohnya Masih perlukan bantuan?",
  "Still need help? link": "Pautan “Masih perlukan bantuan?”",
  Questions: "Soalan",
  Question: "Soalan",
  Answer: "Jawapan",
  "Open the first answer": "Buka jawapan pertama",
  "Let several answers stay open": "Benarkan beberapa jawapan kekal terbuka",

  // Callout
  Callout: "Makluman",
  "A short message with an icon: information, success, a warning or a problem.":
    "Mesej ringkas dengan ikon: maklumat, kejayaan, amaran atau masalah.",
  Kind: "Jenis",
  Information: "Maklumat",
  Success: "Berjaya",
  Warning: "Amaran",
  Problem: "Masalah",
  "Link under the message": "Pautan di bawah mesej",

  // Contact
  Contact: "Hubungi",
  "Phone, email, office hours and the office address, from the site settings.":
    "Telefon, e-mel, waktu pejabat dan alamat pejabat, daripada tetapan laman web.",
  "Office name": "Nama pejabat",
  "Instead of the site settings": "Menggantikan tetapan laman web",
  Address: "Alamat",
  Phone: "Telefon",
  Email: "E-mel",
  "Office hours": "Waktu pejabat",

  // Calls to action
  "Call to action": "Seruan tindakan",
  "The closing call to action of a page: a title, short text and one or two actions.":
    "Seruan tindakan penutup halaman: tajuk, teks ringkas dan satu atau dua tindakan.",
  "Ways to do it": "Cara-cara melakukannya",
  "Two or three ways to do the same thing, such as online, at a counter or by post.":
    "Dua atau tiga cara melakukan perkara yang sama, seperti dalam talian, di kaunter atau melalui pos.",
  Ways: "Cara",
  Way: "Cara",
  "Who it suits": "Sesuai untuk siapa",
  Action: "Tindakan",
  "Recommended: the one most people should take":
    "Disyorkan: cara yang patut diambil oleh kebanyakan orang",
  "Call to action with picture": "Seruan tindakan bergambar",
  "A call to action with a picture and up to four reasons, for the middle of a page.":
    "Seruan tindakan dengan gambar dan sehingga empat sebab, untuk bahagian tengah halaman.",
  Reasons: "Sebab",
  Reason: "Sebab",
  "Leave the alt text empty if the picture is only decoration.":
    "Biarkan teks alt kosong jika gambar itu hanya hiasan.",

  // Entry list and latest entries
  "Entry list": "Senarai entri",
  "This listing's entries, newest first, in pages, with a category filter.":
    "Entri senarai ini, yang terbaharu dahulu, dalam beberapa halaman, dengan penapis kategori.",
  "Cards with a cover image": "Kad dengan imej muka",
  "Compact list": "Senarai padat",
  "Entries per page": "Entri setiap halaman",
  "6": "6",
  "12": "12",
  "24": "24",
  "Show the category filter": "Tunjukkan penapis kategori",
  "Show the summary": "Tunjukkan ringkasan",
  "Show the date": "Tunjukkan tarikh",
  "Text when there are no entries yet": "Teks apabila belum ada entri",
  "Latest entries": "Entri terkini",
  "The newest entries of a listing page, with a link to see them all.":
    "Entri terbaharu sesuatu halaman senarai, dengan pautan untuk melihat semuanya.",
  "Listing page": "Halaman senarai",
  "How many": "Berapa banyak",
  "3": "3",
  "4": "4",
  "5": "5",
  "8": "8",
  "9": "9",
  "Show a “Show more” button": "Tunjukkan butang “Lihat lagi”",
  "Show more button text": "Teks butang Lihat lagi",
  "Used when Show more is on. “Lihat lagi” if left empty.":
    "Digunakan apabila Lihat lagi dihidupkan. “Lihat lagi” jika dibiarkan kosong.",
  "Headlines only": "Tajuk sahaja",
  "Only this category (its address, e.g. siaran-media)":
    "Kategori ini sahaja (alamatnya, contohnya siaran-media)",
  "See all link text": "Teks pautan Lihat semua",

  // Templates
  Blank: "Kosong",
  "A title and a text block.": "Tajuk dan satu blok teks.",
  Utama: "Utama",
  "The home page.": "Halaman utama.",
  Perkhidmatan: "Perkhidmatan",
  "One service: who can apply, how, and the forms.":
    "Satu perkhidmatan: siapa yang boleh memohon, caranya, dan borangnya.",
  Hubungi: "Hubungi",
  "How to reach the agency.": "Cara menghubungi agensi.",
  "Blank collection": "Koleksi kosong",
  "Entries, newest first. For circulars, publications, vacancies.":
    "Entri, yang terbaharu dahulu. Untuk pekeliling, penerbitan, kekosongan jawatan.",
  Berita: "Berita",
  "News and press statements.": "Berita dan kenyataan media.",
  Pengumuman: "Pengumuman",
  "Closures, service changes, reminders.": "Penutupan, perubahan perkhidmatan, peringatan.",
  "Tender dan sebut harga": "Tender dan sebut harga",
  "Open tenders and quotations, with documents.":
    "Tender dan sebut harga yang dibuka, dengan dokumennya.",
  Acara: "Acara",
  "Briefings, workshops, open days, with date and venue.":
    "Taklimat, bengkel, hari terbuka, dengan tarikh dan tempat.",
};
