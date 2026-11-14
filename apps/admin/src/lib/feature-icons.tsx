/** The icons features, services and navigation links may use, drawn as the site draws them. */
import { featureIconGroups, featureIconLabels, type featureIcons } from "@laman/blocks";
import type { FunctionComponent, SVGProps } from "react";
import { AccessibleIcon } from "@/components/ui/icons/accessible";
import { AttachmentIcon } from "@/components/ui/icons/attachment";
import { BellIcon } from "@/components/ui/icons/bell";
import { BoltIcon } from "@/components/ui/icons/bolt";
import { BookIcon } from "@/components/ui/icons/book";
import { CalendarIcon } from "@/components/ui/icons/calendar";
import { ChatBubbleIcon } from "@/components/ui/icons/chat-bubble";
import { CheckCircleIcon } from "@/components/ui/icons/check-circle";
import { CheckShieldIcon } from "@/components/ui/icons/check-shield";
import { ClockIcon } from "@/components/ui/icons/clock";
import { DesktopIcon } from "@/components/ui/icons/desktop";
import { DirectionIcon } from "@/components/ui/icons/direction";
import { DocumentIcon } from "@/components/ui/icons/document";
import { DocumentAddIcon } from "@/components/ui/icons/document-add";
import { DownloadIcon } from "@/components/ui/icons/download";
import { EmailIcon } from "@/components/ui/icons/email";
import { FacebookIcon } from "@/components/ui/icons/facebook";
import { FlagIcon } from "@/components/ui/icons/flag";
import { FolderIcon } from "@/components/ui/icons/folder";
import { FormsIcon } from "@/components/ui/icons/forms";
import { GlobeIcon } from "@/components/ui/icons/globe";
import { GovtOfficeIcon } from "@/components/ui/icons/govt-office";
import { HeartIcon } from "@/components/ui/icons/heart";
import { HomeIcon } from "@/components/ui/icons/home";
import { InfoIcon } from "@/components/ui/icons/info";
import { InstagramIcon } from "@/components/ui/icons/instagram";
import { LinkIcon } from "@/components/ui/icons/link";
import { LinkedinIcon } from "@/components/ui/icons/linkedin";
import { LockIcon } from "@/components/ui/icons/lock";
import { MapIcon } from "@/components/ui/icons/map";
import { MegaphoneIcon } from "@/components/ui/icons/megaphone";
import { MobileIcon } from "@/components/ui/icons/mobile";
import { MoneyIcon } from "@/components/ui/icons/money";
import { OrgChartIcon } from "@/components/ui/icons/org-chart";
import { PdfIcon } from "@/components/ui/icons/pdf";
import { PhoneIcon } from "@/components/ui/icons/phone";
import { PinIcon } from "@/components/ui/icons/pin";
import { PlayIcon } from "@/components/ui/icons/play";
import { PrinterIcon } from "@/components/ui/icons/printer";
import { PutrajayaIcon } from "@/components/ui/icons/putrajaya";
import { QrCodeIcon } from "@/components/ui/icons/qr-code";
import { QuestionCircleIcon } from "@/components/ui/icons/question-circle";
import { RSSIcon } from "@/components/ui/icons/rss";
import { SearchIcon } from "@/components/ui/icons/search";
import { SettingIcon } from "@/components/ui/icons/setting";
import { ShareIcon } from "@/components/ui/icons/share";
import { StarIcon } from "@/components/ui/icons/star";
import { TableIcon } from "@/components/ui/icons/table";
import { TelegramIcon } from "@/components/ui/icons/telegram";
import { ThumbsUpIcon } from "@/components/ui/icons/thumbs-up";
import { TiktokIcon } from "@/components/ui/icons/tiktok";
import { TrophyIcon } from "@/components/ui/icons/trophy";
import { TwitterXIcon } from "@/components/ui/icons/twitter-x";
import { UploadIcon } from "@/components/ui/icons/upload";
import { UserIcon } from "@/components/ui/icons/user";
import { UserGroupIcon } from "@/components/ui/icons/user-group";
import { VideoIcon } from "@/components/ui/icons/video";
import { WarningIcon } from "@/components/ui/icons/warning";
import { WhatsappIcon } from "@/components/ui/icons/whatsapp";
import { YoutubeIcon } from "@/components/ui/icons/youtube";
import type { IconSection } from "@/components/icon-picker";
import { locale, rt } from "@/i18n";

type FeatureIcon = (typeof featureIcons)[number];

type IconComponent = FunctionComponent<SVGProps<SVGSVGElement>>;

/** The FTDS icon for each feature icon name; the type checker holds it to the registry's list. */
const featureIconComponents: Record<FeatureIcon, IconComponent> = {
  home: HomeIcon,
  "govt-office": GovtOfficeIcon,
  putrajaya: PutrajayaIcon,
  map: MapIcon,
  pin: PinIcon,
  direction: DirectionIcon,
  globe: GlobeIcon,
  user: UserIcon,
  "user-group": UserGroupIcon,
  "org-chart": OrgChartIcon,
  accessible: AccessibleIcon,
  document: DocumentIcon,
  "document-add": DocumentAddIcon,
  forms: FormsIcon,
  folder: FolderIcon,
  book: BookIcon,
  pdf: PdfIcon,
  attachment: AttachmentIcon,
  download: DownloadIcon,
  upload: UploadIcon,
  printer: PrinterIcon,
  "qr-code": QrCodeIcon,
  table: TableIcon,
  calendar: CalendarIcon,
  clock: ClockIcon,
  video: VideoIcon,
  play: PlayIcon,
  trophy: TrophyIcon,
  flag: FlagIcon,
  star: StarIcon,
  heart: HeartIcon,
  money: MoneyIcon,
  "check-shield": CheckShieldIcon,
  lock: LockIcon,
  setting: SettingIcon,
  bolt: BoltIcon,
  desktop: DesktopIcon,
  mobile: MobileIcon,
  search: SearchIcon,
  link: LinkIcon,
  bell: BellIcon,
  megaphone: MegaphoneIcon,
  info: InfoIcon,
  warning: WarningIcon,
  "check-circle": CheckCircleIcon,
  "question-circle": QuestionCircleIcon,
  "thumbs-up": ThumbsUpIcon,
  email: EmailIcon,
  phone: PhoneIcon,
  "chat-bubble": ChatBubbleIcon,
  share: ShareIcon,
  whatsapp: WhatsappIcon,
  telegram: TelegramIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  "twitter-x": TwitterXIcon,
  youtube: YoutubeIcon,
  tiktok: TiktokIcon,
  linkedin: LinkedinIcon,
  rss: RSSIcon,
};

/** Built once per language: the picker reads them on every render of every icon field. */
const sections = new Map<string, IconSection<FeatureIcon>[]>();

/** The feature icons as the picker's titled sections, in the admin's language. */
export function featureIconSections(): IconSection<FeatureIcon>[] {
  const key = locale();
  let built = sections.get(key);
  if (!built) {
    built = featureIconGroups.map((group) => ({
      label: rt(group.label),
      options: group.icons.map((value) => ({
        value,
        label: rt(featureIconLabels[value]),
        icon: featureIconComponents[value],
      })),
    }));
    sections.set(key, built);
  }
  return built;
}
