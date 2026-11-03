import {
  SOCIAL_PLATFORMS,
  isValidSocialUrl,
  type SocialUrls,
} from "@/lib/social-urls";

/**
 * Tautan URL sosmed valid admin, read-only untuk tinjauan super-admin.
 * Hanya nilai valid yang dirender sebagai tautan; tanpa URL valid
 * tampil "—". Bukan berkas privat — URL sosmed adalah identitas
 * publik admin sendiri.
 */
export default function SocialLinks({
  urls,
}: {
  urls: SocialUrls | undefined;
}) {
  if (!urls) return <>—</>;
  const shown = SOCIAL_PLATFORMS.filter((p) =>
    isValidSocialUrl(p.key, urls[p.column])
  );
  if (shown.length === 0) return <>—</>;
  return (
    <>
      {shown.map((p) => (
        <span key={p.key}>
          <a href={urls[p.column] ?? ""} target="_blank" rel="noreferrer">
            {p.label}
          </a>{" "}
        </span>
      ))}
    </>
  );
}
