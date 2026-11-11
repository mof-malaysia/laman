/** The FTDS icons a feature, service or navbar link may use, by the registry's names. */
import type { featureIcons } from "@fiscal-sb/blocks";
import Accessible from "@/components/ui/icons/accessible.astro";
import Attachment from "@/components/ui/icons/attachment.astro";
import Bell from "@/components/ui/icons/bell.astro";
import Bolt from "@/components/ui/icons/bolt.astro";
import Book from "@/components/ui/icons/book.astro";
import Calendar from "@/components/ui/icons/calendar.astro";
import ChatBubble from "@/components/ui/icons/chat-bubble.astro";
import CheckCircle from "@/components/ui/icons/check-circle.astro";
import CheckShield from "@/components/ui/icons/check-shield.astro";
import Clock from "@/components/ui/icons/clock.astro";
import Desktop from "@/components/ui/icons/desktop.astro";
import Direction from "@/components/ui/icons/direction.astro";
import Document from "@/components/ui/icons/document.astro";
import DocumentAdd from "@/components/ui/icons/document-add.astro";
import Download from "@/components/ui/icons/download.astro";
import Email from "@/components/ui/icons/email.astro";
import Facebook from "@/components/ui/icons/facebook.astro";
import Flag from "@/components/ui/icons/flag.astro";
import Folder from "@/components/ui/icons/folder.astro";
import Forms from "@/components/ui/icons/forms.astro";
import Globe from "@/components/ui/icons/globe.astro";
import GovtOffice from "@/components/ui/icons/govt-office.astro";
import Heart from "@/components/ui/icons/heart.astro";
import Home from "@/components/ui/icons/home.astro";
import Info from "@/components/ui/icons/info.astro";
import Instagram from "@/components/ui/icons/instagram.astro";
import Link from "@/components/ui/icons/link.astro";
import Linkedin from "@/components/ui/icons/linkedin.astro";
import Lock from "@/components/ui/icons/lock.astro";
import Map from "@/components/ui/icons/map.astro";
import Megaphone from "@/components/ui/icons/megaphone.astro";
import Mobile from "@/components/ui/icons/mobile.astro";
import Money from "@/components/ui/icons/money.astro";
import OrgChart from "@/components/ui/icons/org-chart.astro";
import Pdf from "@/components/ui/icons/pdf.astro";
import Phone from "@/components/ui/icons/phone.astro";
import Pin from "@/components/ui/icons/pin.astro";
import Play from "@/components/ui/icons/play.astro";
import Printer from "@/components/ui/icons/printer.astro";
import Putrajaya from "@/components/ui/icons/putrajaya.astro";
import QrCode from "@/components/ui/icons/qr-code.astro";
import QuestionCircle from "@/components/ui/icons/question-circle.astro";
import Rss from "@/components/ui/icons/rss.astro";
import Search from "@/components/ui/icons/search.astro";
import Setting from "@/components/ui/icons/setting.astro";
import Share from "@/components/ui/icons/share.astro";
import Star from "@/components/ui/icons/star.astro";
import Table from "@/components/ui/icons/table.astro";
import Telegram from "@/components/ui/icons/telegram.astro";
import ThumbsUp from "@/components/ui/icons/thumbs-up.astro";
import Tiktok from "@/components/ui/icons/tiktok.astro";
import Trophy from "@/components/ui/icons/trophy.astro";
import TwitterX from "@/components/ui/icons/twitter-x.astro";
import Upload from "@/components/ui/icons/upload.astro";
import User from "@/components/ui/icons/user.astro";
import UserGroup from "@/components/ui/icons/user-group.astro";
import Video from "@/components/ui/icons/video.astro";
import Warning from "@/components/ui/icons/warning.astro";
import Whatsapp from "@/components/ui/icons/whatsapp.astro";
import Youtube from "@/components/ui/icons/youtube.astro";

export const featureIconComponents: Record<(typeof featureIcons)[number], typeof Bell> = {
  home: Home,
  "govt-office": GovtOffice,
  putrajaya: Putrajaya,
  map: Map,
  pin: Pin,
  direction: Direction,
  globe: Globe,
  user: User,
  "user-group": UserGroup,
  "org-chart": OrgChart,
  accessible: Accessible,
  document: Document,
  "document-add": DocumentAdd,
  forms: Forms,
  folder: Folder,
  book: Book,
  pdf: Pdf,
  attachment: Attachment,
  download: Download,
  upload: Upload,
  printer: Printer,
  "qr-code": QrCode,
  table: Table,
  calendar: Calendar,
  clock: Clock,
  video: Video,
  play: Play,
  trophy: Trophy,
  flag: Flag,
  star: Star,
  heart: Heart,
  money: Money,
  "check-shield": CheckShield,
  lock: Lock,
  setting: Setting,
  bolt: Bolt,
  desktop: Desktop,
  mobile: Mobile,
  search: Search,
  link: Link,
  bell: Bell,
  megaphone: Megaphone,
  info: Info,
  warning: Warning,
  "check-circle": CheckCircle,
  "question-circle": QuestionCircle,
  "thumbs-up": ThumbsUp,
  email: Email,
  phone: Phone,
  "chat-bubble": ChatBubble,
  share: Share,
  whatsapp: Whatsapp,
  telegram: Telegram,
  facebook: Facebook,
  instagram: Instagram,
  "twitter-x": TwitterX,
  youtube: Youtube,
  tiktok: Tiktok,
  linkedin: Linkedin,
  rss: Rss,
};
