// X2 (Pinterest and Instagram References) owns this folder. Contract stub: a
// plain link until X2 renders the platform's official embed in an /embed/* iframe.

export type ReferenceEmbedProps = {
  platform: "pinterest" | "instagram";
  url: string;
};

export function ReferenceEmbed({ platform, url }: ReferenceEmbedProps) {
  const name = platform === "pinterest" ? "Pinterest" : "Instagram";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-action underline"
    >
      Open on {name}
    </a>
  );
}
