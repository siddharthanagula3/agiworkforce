import { fireEvent, render } from '@testing-library/react-native';

import { ResearchReportSections } from '../ResearchReportSections';

const REPORT_A = '# Overview\n\nText.\n\n## Costs\n\nText.\n\n## Risks\n\nText.';
const REPORT_B = '# Market\n\nText.\n\n## Buyers\n\nText.\n\n## Sellers\n\nText.';

describe('research report sections', () => {
  it('does not carry an opened list into another run shown in the same row', () => {
    const screen = render(<ResearchReportSections content={REPORT_A} messageId="run-a" />);

    fireEvent.press(screen.getByTestId('research-report-sections-toggle'));
    expect(screen.getByText('Costs')).toBeTruthy();

    screen.rerender(<ResearchReportSections content={REPORT_B} messageId="run-b" />);

    expect(screen.queryByText('Buyers')).toBeNull();
    expect(screen.getByLabelText('Show 3 report sections')).toBeTruthy();
  });

  it('takes the reader to a section when one is tapped', () => {
    const onSelectSection = jest.fn();
    const screen = render(
      <ResearchReportSections
        content={REPORT_A}
        messageId="run-a"
        defaultExpanded
        onSelectSection={onSelectSection}
      />,
    );

    fireEvent.press(screen.getByLabelText('Go to Risks'));

    expect(onSelectSection).toHaveBeenCalledWith('risks');
  });

  it('lists sections as plain text when there is nowhere to go', () => {
    const screen = render(
      <ResearchReportSections content={REPORT_A} messageId="run-a" defaultExpanded />,
    );

    expect(screen.getByText('Risks')).toBeTruthy();
    expect(screen.queryByLabelText('Go to Risks')).toBeNull();
  });
});
