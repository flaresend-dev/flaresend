import { codeToHtml } from 'shiki';

/** Highlights at build time. Both themes are in the HTML; global.css picks one from the OS setting. */
export function highlight(code: string, lang: string) {
  return codeToHtml(code, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark-default' },
    defaultColor: 'light',
  });
}

export async function Code({ code, lang, className }: { code: string; lang: string; className?: string }) {
  const html = await highlight(code, lang);
  return (
    <div
      className={`overflow-x-auto text-[13px] leading-6 [&_pre]:px-4 [&_pre]:py-3.5 [&_pre]:font-mono ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
