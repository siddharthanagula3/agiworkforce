import { CopyTextButton } from './CopyPageButton';

export function DocsCodeBlock({ code, language }: { code: string; language?: string }) {
  return (
    <figure className="dx-code-block">
      <div className="dx-code-bar">
        <span className="dx-code-language">{language || 'Code'}</span>
        <CopyTextButton text={code} label="Copy code" copiedLabel="Code copied" />
      </div>
      <pre role="region" tabIndex={0} aria-label={language ? `${language} code` : 'Code example'}>
        <code className={language ? `language-${language}` : undefined}>{code}</code>
      </pre>
    </figure>
  );
}
