import { embedAddresses, embedServices } from "@laman/blocks";
import { useQuery } from "@tanstack/react-query";
import { Details, DetailsContent, DetailsTrigger } from "@/components/ui/details";
import { t } from "@/i18n";
import { siteDocQuery } from "@/lib/publish";

/**
 * Under the Embed block's address: what this site lets pages frame, behind a
 * line that opens, so an officer needn't leave the editor (or be an Admin) to
 * find out: each service switched on with the addresses it's allowed at, then
 * the site's own hosts. It reads the live settings, since those are what a
 * publish frames by.
 */
export function EmbedsAllowed() {
  // Not refetched each time an Embed block is selected: what's allowed changes rarely.
  const { data } = useQuery({ ...siteDocQuery("settings"), staleTime: 60_000 });
  if (!data) return null;
  const { services, hosts } = data.published.embeds;
  const on = embedServices.filter((s) => services.includes(s.id));
  return (
    <Details className="text-body-sm">
      <DetailsTrigger>{t("editor.embeds.allowed")}</DetailsTrigger>
      <DetailsContent>
        {on.length + hosts.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {on.map((service) => (
              <li key={service.id} className="flex flex-col">
                <span className="text-txt-black-900 font-medium">{service.name}</span>
                {embedAddresses(service).map((address) => (
                  <span key={address} className="text-txt-black-700 break-all">
                    {address}
                  </span>
                ))}
              </li>
            ))}
            {hosts.map((host) => (
              <li key={host} className="text-txt-black-900 font-medium break-all">
                {host}
              </li>
            ))}
          </ul>
        ) : (
          t("editor.embeds.none")
        )}
        <p className="text-txt-black-700 mt-2">{t("editor.embeds.missing")}</p>
      </DetailsContent>
    </Details>
  );
}
