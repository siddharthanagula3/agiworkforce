import type { ReactNode } from 'react';
import { Check, CircleCheck, FileText, Search } from 'lucide-react';
import { APPROVALS_SCENE, ILLUSTRATION, MEMORY_SCENE, RESEARCH_SCENE, VERIFY } from './content';
import { Rise } from './Rise';
import { Section } from './Section';

const ICON = 16;
const STATUS_ICON = 18;

function ResearchScene() {
  const last = RESEARCH_SCENE.steps.length - 1;
  return (
    <div className="f2-scene-inner">
      <div className="f2-scene-bar">
        <span className="f2-scene-status">
          <CircleCheck size={STATUS_ICON} strokeWidth={2} aria-hidden="true" />
          {RESEARCH_SCENE.status}
        </span>
        <span className="f2-label">{RESEARCH_SCENE.meta}</span>
      </div>
      <ol className="f2-steps">
        {RESEARCH_SCENE.steps.map((step, index) => (
          <li key={step} className="f2-step">
            <Check size={ICON} strokeWidth={2.25} aria-hidden="true" />
            {index === last ? (
              <FileText size={ICON} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Search size={ICON} strokeWidth={2} aria-hidden="true" />
            )}
            <span>{step}</span>
            <span className="f2-label f2-step-done">{RESEARCH_SCENE.done}</span>
          </li>
        ))}
      </ol>
      <h4 className="f2-scene-h">{RESEARCH_SCENE.heading}</h4>
      <p className="f2-text f2-scene-p">
        {RESEARCH_SCENE.excerpt}{' '}
        {RESEARCH_SCENE.citations.map((citation, index) => (
          <span key={citation}>
            {index > 0 ? ', ' : ''}
            <span className="f2-cite">[{citation}]</span>
          </span>
        ))}
        .
      </p>
    </div>
  );
}

function ApprovalsScene() {
  return (
    <div className="f2-scene-inner">
      <div className="f2-scene-bar">
        <span className="f2-scene-title">{APPROVALS_SCENE.title}</span>
        <span className="f2-label">{ILLUSTRATION}</span>
      </div>
      <div className="f2-options">
        {APPROVALS_SCENE.options.map((option) => (
          <div key={option.name} className="f2-option" data-selected={option.selected}>
            <i className="f2-radio" aria-hidden="true" />
            <div>
              <div className="f2-option-name">{option.name}</div>
              <p className="f2-text f2-option-body">{option.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MemoryScene() {
  return (
    <div className="f2-scene-inner">
      <div className="f2-scene-bar">
        <span className="f2-scene-title">{MEMORY_SCENE.title}</span>
        <span className="f2-label">{ILLUSTRATION}</span>
      </div>
      <p className="f2-text f2-scene-p">{MEMORY_SCENE.body}</p>
      <ul className="f2-sources">
        {MEMORY_SCENE.sources.map((source) => (
          <li key={source} className="f2-source">
            <i className="f2-checkbox" aria-hidden="true" />
            <span>
              {MEMORY_SCENE.suppress}: {source}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SCENES: readonly ReactNode[] = [
  <ResearchScene key="research" />,
  <ApprovalsScene key="approvals" />,
  <MemoryScene key="memory" />,
];

export function Verify() {
  return (
    <Section id="verify" title={VERIFY.title} lead={VERIFY.lead}>
      <div className="f2-rows">
        {VERIFY.items.map((item, index) => (
          <Rise key={item.title} className="f2-row">
            <figure
              className="f2-scene"
              data-illustration
              aria-label={`${ILLUSTRATION}: ${item.title}`}
            >
              {SCENES[index]}
            </figure>
            <div className="f2-row-copy">
              <h3 className="f2-h3">{item.title}</h3>
              <p className="f2-text">{item.body}</p>
            </div>
          </Rise>
        ))}
      </div>
    </Section>
  );
}
